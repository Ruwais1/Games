'use strict';
const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { normalize, cleanText } = require('./util');

// الألعاب المتوفرة. لإضافة لعبة جديدة: سوِّ ملف لها بنفس الشكل وأضفها هنا
const GAMES = {
  kaddab: require('./kaddab'),
  outsider: require('./outsider'),
  detective: require('./detective'),
};

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const MAX_NAME = 14;
// Test players that play on their own, for trying the games without people
const BOT_NAMES = ['بوت سعد', 'بوت نورة', 'بوت فيصل', 'بوت ريم', 'بوت مشاري', 'بوت لولو', 'بوت عبود', 'بوت دانة'];
const PUBLIC = path.join(__dirname, 'Public');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'player.html')));
app.get('/host', (req, res) => res.sendFile(path.join(PUBLIC, 'host.html')));
app.use(express.static(PUBLIC, { index: false }));

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) return a.address;
    }
  }
  return null;
}

// الباركود: على Render ياخذ رابط الموقع، وفي البيت يحوّل localhost إلى عنوان اللابتوب على الواي فاي
app.get('/qr', async (req, res) => {
  try {
    let url = process.env.PUBLIC_URL;
    if (!url) {
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
      const u = new URL(`${proto}://${req.headers.host}`);
      if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) {
        const ip = lanAddress();
        if (ip) u.hostname = ip;
      }
      url = u.origin + '/';
    }
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      width: 520,
      color: { dark: '#1B2A4EFF', light: '#F6E7C8FF' },
    });
    res.json({ url, dataUrl });
  } catch (e) {
    res.status(500).json({ error: 'qr' });
  }
});

// ===== الجلسة: اللاعبين يدخلون مرة، ويلعبون كل الألعاب =====
const defaults = (schema) => Object.fromEntries(schema.map((s) => [s.key, s.default]));
const session = {
  stage: 'lobby', // lobby | playing
  selected: 'kaddab',
  settings: Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, defaults(g.settings)])),
  players: new Map(), // id -> { id, name, score, connected, socketId }
};
const tokens = new Map(); // رمز سري محفوظ في الجوال -> playerId
let game = null; // اللعبة الشغالة الحين

const ctx = {
  players: () => [...session.players.values()],
  connected: () => [...session.players.values()].filter((p) => p.connected),
  get: (id) => session.players.get(id),
  broadcast: () => broadcast(),
};

function snapshot() {
  const s = {
    stage: session.stage,
    selected: session.selected,
    maxName: MAX_NAME,
    players: ctx.players().map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, bot: !!p.bot })),
  };
  if (session.stage === 'lobby') {
    s.games = Object.values(GAMES).map((g) => ({
      key: g.key,
      title: g.title,
      tagline: g.tagline,
      minPlayers: g.minPlayers,
      maxPlayers: MAX_PLAYERS,
      settings: g.settings,
      values: session.settings[g.key],
    }));
  } else {
    s.game = session.selected;
    s.title = GAMES[session.selected].title;
    s.g = game.snapshot();
  }
  return s;
}

// Each bot asks the game what to do next; a move runs once, after a human-like delay
function driveBots() {
  if (!game || !game.botMove) return;
  for (const p of session.players.values()) {
    if (!p.bot) continue;
    const plan = game.botMove(p);
    if (!plan || p.botKey === plan.key) continue;
    p.botKey = plan.key;
    const current = game;
    setTimeout(() => {
      if (game !== current || !session.players.has(p.id)) return;
      const again = game.botMove(p);
      if (again && again.key === plan.key) game.action(p, again.data, () => {});
    }, plan.delay);
  }
}

function addBot() {
  if (session.players.size >= MAX_PLAYERS) return;
  const taken = new Set(ctx.players().map((p) => p.name));
  const name = BOT_NAMES.find((n) => !taken.has(n));
  if (!name) return;
  const id = 'bot-' + crypto.randomBytes(4).toString('hex');
  session.players.set(id, { id, name, score: 0, connected: true, socketId: null, bot: true });
}

function broadcast() {
  const s = snapshot();
  io.to('hosts').emit('state', s);
  for (const p of session.players.values()) {
    if (!p.socketId) continue;
    const me = { id: p.id, name: p.name, score: p.score, g: game ? game.meView(p) : null };
    io.to(p.socketId).emit('state', { ...s, me });
  }
  driveBots();
}

function startGame() {
  const def = GAMES[session.selected];
  for (const [id, p] of session.players) if (!p.connected) session.players.delete(id);
  for (const [t, id] of tokens) if (!session.players.has(id)) tokens.delete(t);
  for (const p of session.players.values()) {
    p.score = 0;
    p.botKey = null;
  }
  game = def.create(ctx, { ...session.settings[def.key] });
  session.stage = 'playing';
  game.start();
}

function endGame() {
  if (game) game.stop();
  game = null;
  session.stage = 'lobby';
  for (const p of session.players.values()) p.score = 0;
  broadcast();
}

io.on('connection', (socket) => {
  const ack = (cb) => (typeof cb === 'function' ? cb : () => {});
  const isHost = () => socket.rooms.has('hosts');
  const me = () => session.players.get(socket.data.playerId);

  // ----- الشاشة -----
  socket.on('host:hello', () => {
    socket.join('hosts');
    socket.emit('state', snapshot());
  });

  socket.on('host:select', (key) => {
    if (!isHost() || session.stage !== 'lobby' || !GAMES[key]) return;
    session.selected = key;
    broadcast();
  });

  socket.on('host:setting', (data) => {
    if (!isHost() || session.stage !== 'lobby' || !data) return;
    const def = GAMES[data.game];
    const setting = def && def.settings.find((s) => s.key === data.key);
    if (!setting || !setting.options.some((o) => o.value === data.value)) return;
    session.settings[def.key][setting.key] = data.value;
    broadcast();
  });

  socket.on('host:addBot', () => {
    if (!isHost() || session.stage !== 'lobby') return;
    addBot();
    broadcast();
  });

  socket.on('host:clearBots', () => {
    if (!isHost() || session.stage !== 'lobby') return;
    for (const [id, p] of session.players) if (p.bot) session.players.delete(id);
    broadcast();
  });

  socket.on('host:start', () => {
    if (!isHost() || session.stage !== 'lobby') return;
    if (ctx.connected().length < GAMES[session.selected].minPlayers) return;
    startGame();
  });

  socket.on('host:action', (type) => {
    if (!isHost() || !game || typeof type !== 'string') return;
    game.hostAction(type);
  });

  socket.on('host:end', () => {
    if (!isHost() || session.stage !== 'playing') return;
    endGame();
  });

  // ----- الجوالات -----
  socket.on('player:join', (data, cb) => {
    const reply = ack(cb);
    const token = typeof data?.token === 'string' ? data.token.slice(0, 64) : '';
    const name = cleanText(data?.name, MAX_NAME);
    if (!token) return reply({ error: 'صار خطأ. حدّث الصفحة وجرّب مرة ثانية.' });
    if (!name) return reply({ error: 'اكتب اسمك.' });

    let p = session.players.get(tokens.get(token));
    const nameTaken = ctx.players().some((o) => o !== p && normalize(o.name) === normalize(name));

    if (!p) {
      if (session.stage !== 'lobby') {
        return reply({ error: 'اللعبة بدأت. تقدر تدخل أول ما يرجعون للقائمة.', retry: true });
      }
      if (session.players.size >= MAX_PLAYERS) return reply({ error: `العدد مكتمل (${MAX_PLAYERS} لاعبين).` });
      if (nameTaken) return reply({ error: 'الاسم مأخوذ، اختر غيره.' });
      p = { id: crypto.randomBytes(6).toString('hex'), name, score: 0, connected: true, socketId: socket.id };
      session.players.set(p.id, p);
      tokens.set(token, p.id);
    } else {
      if (session.stage === 'lobby' && name !== p.name) {
        if (nameTaken) return reply({ error: 'الاسم مأخوذ، اختر غيره.' });
        p.name = name;
      }
      const old = p.socketId;
      p.socketId = socket.id;
      p.connected = true;
      if (old && old !== socket.id) io.sockets.sockets.get(old)?.disconnect(true);
    }
    socket.data.playerId = p.id;
    reply({ ok: true, name: p.name });
    broadcast();
  });

  socket.on('player:action', (data, cb) => {
    const reply = ack(cb);
    const p = me();
    if (!p || !game || !data || typeof data.type !== 'string') return reply({ error: 'ما فيه لعبة شغالة.' });
    game.action(p, data, reply);
  });

  socket.on('disconnect', () => {
    const p = me();
    if (!p || p.socketId !== socket.id) return;
    p.connected = false;
    p.socketId = null;
    if (game) game.onDisconnect(p);
    else broadcast();
  });
});

server.listen(PORT, () => {
  const ip = lanAddress();
  console.log(`الألعاب شغالة على المنفذ ${PORT}`);
  console.log(`  الشاشة:   http://localhost:${PORT}/host`);
  if (ip) console.log(`  الجوالات: http://${ip}:${PORT}/  (لازم نفس الواي فاي)`);
});
