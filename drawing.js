'use strict';
// "Wesh Rasamt?": everyone draws a secret prompt on their phone, then the others
// write fake titles for each drawing, and everyone votes for the real one.
const PROMPTS = require('./prompts');
const { normalize, shuffle, pick, cleanText, ar, options, seconds, createClock } = require('./util');

const PALETTE = ['#1C1C24', '#D7263D', '#2F7DD1', '#2E9E5B', '#F2B33D', '#8C6A43', '#F6E7C8'];
const WIDTHS = [0.012, 0.03];
const MAX_POINTS = 8000;
const MAX_LIE = 40;
const TRUTH_POINTS = 2; // for guessing the real title
const FOOL_POINTS = 1; // for the liar, per player fooled
const ARTIST_POINTS = 1; // for the artist, per player who guessed right
const usedPrompts = new Set();
const between = (a, b) => a + Math.floor(Math.random() * (b - a));

// Keep only well-formed strokes: known colors and widths, points inside the canvas
function cleanStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let total = 0;
  for (const s of raw.slice(0, 500)) {
    if (!s || !PALETTE.includes(s.c) || !WIDTHS.includes(s.w) || !Array.isArray(s.p)) continue;
    const p = [];
    for (const pt of s.p) {
      if (total >= MAX_POINTS) break;
      if (!Array.isArray(pt) || pt.length !== 2) continue;
      const x = Math.min(1, Math.max(0, Number(pt[0]) || 0));
      const y = Math.min(1, Math.max(0, Number(pt[1]) || 0));
      p.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
      total++;
    }
    if (p.length) out.push({ c: s.c, w: s.w, p });
  }
  return out;
}

function pickPrompts(count) {
  let pool = PROMPTS.filter((t) => !usedPrompts.has(t));
  if (pool.length < count) {
    usedPrompts.clear();
    pool = [...PROMPTS];
  }
  const chosen = shuffle([...pool]).slice(0, count);
  for (const t of chosen) usedPrompts.add(t);
  return chosen;
}

// A bot's drawing: a few random wobbly lines
function scribble() {
  const strokes = [];
  for (let s = 0; s < between(3, 7); s++) {
    let x = Math.random();
    let y = Math.random();
    const p = [[x, y]];
    for (let k = 0; k < 25; k++) {
      x = Math.min(1, Math.max(0, x + (Math.random() - 0.5) * 0.1));
      y = Math.min(1, Math.max(0, y + (Math.random() - 0.5) * 0.1));
      p.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
    }
    strokes.push({ c: pick(PALETTE.slice(0, 5)), w: pick(WIDTHS), p });
  }
  return strokes;
}

// An award goes to the player(s) with the highest non-zero value of one stat
function awards(stats, defs, exists) {
  return defs
    .map((d) => {
      const rows = [...stats].filter(([id]) => exists(id));
      const best = Math.max(0, ...rows.map(([, s]) => s[d.key] || 0));
      const ids = best ? rows.filter(([, s]) => s[d.key] === best).map(([id]) => id) : [];
      return { title: d.title, label: d.label, value: best, ids, total: rows.length };
    })
    .filter((a) => a.ids.length && a.ids.length <= Math.max(1, Math.floor(a.total / 2)));
}

module.exports = {
  key: 'drawing',
  title: 'وش رسمت؟',
  tagline: 'ارسم بإصبعك، واكتب عنوان كذاب لرسمات الباقين، وخلهم يحتارون وين الصح.',
  minPlayers: 3,
  winnerTitle: 'فنان الجلسة',
  settings: [
    {
      key: 'laps',
      label: 'كل واحد يرسم',
      default: 1,
      options: [
        { value: 1, label: 'مرة' },
        { value: 2, label: 'مرتين' },
      ],
    },
    {
      key: 'drawTime',
      label: 'وقت الرسم',
      default: 90,
      options: [
        { value: 60, label: 'دقيقة' },
        { value: 90, label: 'دقيقة ونص' },
        { value: 120, label: 'دقيقتين' },
      ],
    },
    { key: 'guessTime', label: 'وقت كتابة العنوان', default: 45, options: options([30, 45, 60], seconds) },
    { key: 'voteTime', label: 'وقت التصويت', default: 30, options: options([20, 30, 45], seconds) },
  ],

  create(ctx, cfg) {
    const st = {
      phase: 'draw', // draw | guess | vote | reveal | final
      lap: 0,
      prompts: new Map(), // playerId -> what to draw
      drafts: new Map(), // playerId -> latest strokes, used if time runs out
      drawings: new Map(), // playerId -> submitted strokes
      queue: [], // artists whose drawings we go through
      qi: 0,
      lies: new Map(),
      options: [],
      votes: new Map(),
      gains: {},
      bestLie: null,
    };
    const stats = new Map();
    const stat = (id) => {
      if (!stats.has(id)) stats.set(id, { clear: 0, fooled: 0, bestLie: null });
      return stats.get(id);
    };
    const clock = createClock(() => {
      if (st.phase === 'draw') finishDrawing();
      else if (st.phase === 'guess') startVoting();
      else if (st.phase === 'vote') reveal();
    });

    const artist = () => st.queue[st.qi];
    const guessers = () => ctx.connected().filter((p) => p.id !== artist());

    function setPhase(phase, secs = 0) {
      st.phase = phase;
      clock.set(secs);
      ctx.broadcast();
    }

    function startLap() {
      st.lap++;
      const players = ctx.connected();
      const prompts = pickPrompts(players.length);
      st.prompts = new Map(players.map((p, i) => [p.id, prompts[i]]));
      st.drafts = new Map();
      st.drawings = new Map();
      setPhase('draw', cfg.drawTime);
    }

    // Anyone who ran out of time hands in what they had drawn so far
    function finishDrawing() {
      for (const [id, strokes] of st.drafts) if (!st.drawings.has(id) && strokes.length) st.drawings.set(id, strokes);
      st.queue = shuffle([...st.drawings.keys()].filter((id) => ctx.get(id)));
      st.qi = 0;
      if (!st.queue.length) return afterDrawings();
      startGuess();
    }

    function startGuess() {
      st.lies = new Map();
      st.votes = new Map();
      st.options = [];
      st.gains = {};
      setPhase('guess', cfg.guessTime);
    }

    function startVoting() {
      const truth = st.prompts.get(artist());
      const opts = [{ text: truth, truth: true, authors: [] }];
      for (const [pid, text] of st.lies) opts.push({ text, truth: false, authors: [pid] });
      st.options = shuffle(opts).map((o, i) => ({ ...o, id: 'o' + i, voters: [] }));
      setPhase('vote', cfg.voteTime);
    }

    function reveal() {
      const a = artist();
      const gains = {};
      for (const p of ctx.players()) gains[p.id] = 0;
      for (const [pid, oid] of st.votes) {
        const o = st.options.find((x) => x.id === oid);
        if (!o) continue;
        o.voters.push(pid);
        if (o.truth) {
          gains[pid] = (gains[pid] || 0) + TRUTH_POINTS;
          gains[a] = (gains[a] || 0) + ARTIST_POINTS;
          stat(a).clear++;
        } else {
          for (const au of o.authors) if (au !== pid) gains[au] = (gains[au] || 0) + FOOL_POINTS;
        }
      }
      // Remember the title that fooled the most people
      for (const o of st.options) {
        if (o.truth) continue;
        const author = o.authors[0];
        const fooled = o.voters.filter((v) => v !== author).length;
        if (!fooled) continue;
        stat(author).fooled += fooled;
        const lie = { author, text: o.text, question: `رسمة ${ctx.get(a) ? ctx.get(a).name : ''}`, fooled };
        if (!stat(author).bestLie || fooled > stat(author).bestLie.fooled) stat(author).bestLie = lie;
        if (!st.bestLie || fooled > st.bestLie.fooled) st.bestLie = lie;
      }
      for (const [pid, g] of Object.entries(gains)) {
        const p = ctx.get(pid);
        if (p) p.score += g;
      }
      st.gains = gains;
      setPhase('reveal');
    }

    function afterDrawings() {
      if (st.lap < cfg.laps) startLap();
      else setPhase('final');
    }

    function checkProgress() {
      const active = ctx.connected();
      if (!active.length) return false;
      if (st.phase === 'draw' && active.every((p) => st.drawings.has(p.id))) {
        finishDrawing();
        return true;
      }
      const g = guessers();
      if (st.phase === 'guess' && g.length && g.every((p) => st.lies.has(p.id))) {
        startVoting();
        return true;
      }
      if (st.phase === 'vote' && g.length && g.every((p) => st.votes.has(p.id))) {
        reveal();
        return true;
      }
      return false;
    }

    return {
      get phase() {
        return st.phase;
      },
      start: startLap,
      stop: clock.stop,

      snapshot() {
        const showing = ['guess', 'vote', 'reveal'].includes(st.phase);
        const s = {
          phase: st.phase,
          round: st.lap,
          rounds: cfg.laps,
          label: showing
            ? `الرسمة ${ar(st.qi + 1)} من ${ar(st.queue.length)}`
            : `جولة الرسم ${ar(st.lap)} من ${ar(cfg.laps)}`,
          remaining: clock.remaining(),
          duration: clock.duration,
          maxLie: MAX_LIE,
          done:
            st.phase === 'draw'
              ? [...st.drawings.keys()]
              : st.phase === 'guess'
                ? [...st.lies.keys()]
                : st.phase === 'vote'
                  ? [...st.votes.keys()]
                  : [],
        };
        if (showing) s.drawing = { artist: artist(), strokes: st.drawings.get(artist()), index: st.qi + 1, total: st.queue.length };
        // While voting: titles only, never the authors or which one is true
        if (st.phase === 'vote') s.options = st.options.map((o) => ({ id: o.id, text: o.text }));
        if (st.phase === 'reveal') {
          s.options = st.options.map((o) => ({ id: o.id, text: o.text, truth: o.truth, authors: o.authors, voters: o.voters }));
          s.gains = st.gains;
        }
        if (st.phase === 'final') {
          s.winnerTitle = module.exports.winnerTitle;
          s.awards = awards(stats, [
            { key: 'clear', title: 'أوضح رسّام', label: 'مرات عرفوا رسمته' },
            { key: 'fooled', title: 'أخبث عنوان', label: 'مرات خدع فيها' },
          ], (id) => !!ctx.get(id));
          s.bestLie = st.bestLie && ctx.get(st.bestLie.author) ? st.bestLie : null;
        }
        return s;
      },

      meView(p) {
        const own = st.options.find((o) => o.authors.includes(p.id));
        return {
          prompt: st.phase === 'draw' ? st.prompts.get(p.id) || null : null,
          drew: st.drawings.has(p.id),
          isArtist: artist() === p.id,
          lie: st.lies.get(p.id) || null,
          vote: st.votes.get(p.id) || null,
          ownOption: own ? own.id : null,
          gain: st.phase === 'reveal' ? st.gains[p.id] || 0 : null,
          bestLie: st.phase === 'final' && stats.has(p.id) ? stats.get(p.id).bestLie : null,
        };
      },

      action(p, data, reply) {
        if (data.type === 'draft') {
          if (st.phase === 'draw' && !st.drawings.has(p.id)) st.drafts.set(p.id, cleanStrokes(data.strokes));
          return reply({ ok: true });
        }
        if (data.type === 'draw') {
          if (st.phase !== 'draw') return reply({ error: 'انتهى وقت الرسم.' });
          if (!st.prompts.has(p.id)) return reply({ error: 'استنى الجولة الجاية.' });
          if (st.drawings.has(p.id)) return reply({ error: 'أرسلت رسمتك خلاص.' });
          const strokes = cleanStrokes(data.strokes);
          if (!strokes.length) return reply({ error: 'ارسم شي أول 😄' });
          st.drawings.set(p.id, strokes);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'lie') {
          if (st.phase !== 'guess') return reply({ error: 'انتهى وقت الكتابة.' });
          if (p.id === artist()) return reply({ error: 'هذي رسمتك، انتظرهم 😏' });
          if (st.lies.has(p.id)) return reply({ error: 'أرسلت عنوانك خلاص.' });
          const lie = cleanText(data.text, MAX_LIE);
          if (!lie) return reply({ error: 'اكتب عنوان أول.' });
          if (normalize(lie) === normalize(st.prompts.get(artist()))) return reply({ error: 'هذا هو العنوان الصح! اكتب كذبة بداله.' });
          if ([...st.lies.values()].some((l) => normalize(l) === normalize(lie))) return reply({ error: 'أحد سبقك بنفس العنوان، جرّب غيره.' });
          st.lies.set(p.id, lie);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'vote') {
          if (st.phase !== 'vote') return reply({ error: 'انتهى وقت التصويت.' });
          if (p.id === artist()) return reply({ error: 'هذي رسمتك، ما تصوّت عليها.' });
          if (st.votes.has(p.id)) return reply({ error: 'صوّتت خلاص.' });
          const o = st.options.find((x) => x.id === data.option);
          if (!o) return reply({ error: 'هذا الاختيار مو موجود.' });
          if (o.authors.includes(p.id)) return reply({ error: 'ما تقدر تختار عنوانك.' });
          st.votes.set(p.id, o.id);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else reply({ error: 'طلب غير معروف.' });
      },

      hostAction(type) {
        if (type === 'skip') {
          if (st.phase === 'draw') finishDrawing();
          else if (st.phase === 'guess') startVoting();
          else if (st.phase === 'vote') reveal();
        } else if (type === 'next' && st.phase === 'reveal') {
          st.qi++;
          if (st.qi < st.queue.length) startGuess();
          else afterDrawings();
        }
      },

      // Test bots: scribble something, write a title borrowed from another prompt, vote at random
      botMove(p) {
        if (st.phase === 'draw' && st.prompts.has(p.id) && !st.drawings.has(p.id)) {
          return { key: `d${st.lap}`, delay: between(4000, 9000), data: { type: 'draw', strokes: scribble() } };
        }
        if (st.phase === 'guess' && p.id !== artist() && !st.lies.has(p.id)) {
          const truth = normalize(st.prompts.get(artist()));
          const taken = new Set([...st.lies.values()].map(normalize));
          const text = shuffle([...PROMPTS]).find((t) => normalize(t) !== truth && !taken.has(normalize(t)));
          return { key: `g${st.lap}-${st.qi}`, delay: between(3000, 8000), data: { type: 'lie', text } };
        }
        if (st.phase === 'vote' && p.id !== artist() && !st.votes.has(p.id)) {
          const choices = st.options.filter((o) => !o.authors.includes(p.id));
          if (!choices.length) return null;
          return { key: `v${st.lap}-${st.qi}`, delay: between(2500, 6000), data: { type: 'vote', option: pick(choices).id } };
        }
        return null;
      },

      onDisconnect() {
        if (!checkProgress()) ctx.broadcast();
      },
    };
  },
};
