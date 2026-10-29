'use strict';
// Bara Al-Salfa: everyone knows the secret word except one player
const CATEGORIES = require('./words');
const { shuffle, pick, ar, options, seconds, createClock } = require('./util');

const GUESS_SECONDS = 30;
const GUESS_OPTIONS = 8; // words offered to the outsider when guessing
const INSIDER_POINTS = 1; // each insider, when the outsider is caught
const ESCAPE_POINTS = 2; // the outsider, when not caught
const GUESS_POINTS = 1; // bonus for the outsider guessing the word
const usedWords = new Map(); // category key -> words already played
const between = (a, b) => a + Math.floor(Math.random() * (b - a));

function pickWord(cat) {
  let used = usedWords.get(cat.key) || new Set();
  let pool = cat.words.filter((w) => !used.has(w));
  if (!pool.length) {
    used = new Set();
    pool = [...cat.words];
  }
  const word = pick(pool);
  used.add(word);
  usedWords.set(cat.key, used);
  return word;
}

// Each lap is one chain: whoever answered asks next, looping through everyone.
// So per lap every player asks once and is asked once.
// Later laps try not to repeat a pair, so with 3 players and 2 laps
// everyone asks both others.
function buildTurns(ids, laps) {
  const used = new Set();
  const turns = [];
  for (let lap = 0; lap < laps; lap++) {
    let best = null;
    let bestCost = Infinity;
    for (let tries = 0; tries < 60 && bestCost > 0; tries++) {
      const order = shuffle([...ids]);
      const pairs = order.map((asker, i) => ({ asker, target: order[(i + 1) % order.length] }));
      let cost = pairs.filter((t) => used.has(t.asker + '>' + t.target)).length;
      const last = turns[turns.length - 1];
      if (last && last.asker === pairs[0].target && last.target === pairs[0].asker) cost += 0.5;
      if (cost < bestCost) {
        best = pairs;
        bestCost = cost;
      }
    }
    for (const t of best) {
      used.add(t.asker + '>' + t.target);
      turns.push(t);
    }
  }
  return turns;
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
    // Skip an award shared by more than half the players: it means nothing
    .filter((a) => a.ids.length && a.ids.length <= Math.max(1, Math.floor(a.total / 2)));
}

module.exports = {
  key: 'outsider',
  title: 'برا السالفة',
  tagline: 'الكل يعرف الكلمة إلا واحد. اكشفوه قبل ما يكشفها.',
  minPlayers: 3,
  winnerTitle: 'ذيب السالفة',
  settings: [
    {
      key: 'category',
      label: 'الفئة',
      default: 'mix',
      options: [{ value: 'mix', label: 'منوّع' }, ...CATEGORIES.map((c) => ({ value: c.key, label: c.title }))],
    },
    { key: 'rounds', label: 'عدد الجولات', default: 5, options: options([3, 5, 7], ar) },
    {
      key: 'laps',
      label: 'كل واحد يسأل',
      default: 2,
      options: [
        { value: 1, label: 'مرة' },
        { value: 2, label: 'مرتين' },
        { value: 3, label: '٣ مرات' },
      ],
    },
    {
      key: 'discuss',
      label: 'نقاش قبل التصويت',
      default: 60,
      options: [
        { value: 0, label: 'بدون' },
        { value: 60, label: 'دقيقة' },
        { value: 120, label: 'دقيقتين' },
      ],
    },
    { key: 'voteTime', label: 'وقت التصويت', default: 45, options: options([30, 45, 60], seconds) },
    {
      key: 'showCategory',
      label: 'اللي برا السالفة يعرف الفئة',
      default: true,
      options: [
        { value: true, label: 'نعم' },
        { value: false, label: 'لا، صعّبها' },
      ],
    },
  ],

  create(ctx, cfg) {
    const st = {
      phase: 'reveal', // reveal | questions | discuss | voting | guess | result | final
      round: 0,
      cat: null,
      word: null,
      outsider: null,
      seen: new Set(),
      turns: [],
      turn: 0,
      votes: new Map(),
      accused: null,
      outcome: null, // caught | escaped | framed
      guessOptions: [],
      guess: null,
      guessed: false,
      gains: {},
    };
    // Per-player stats for the end-of-game awards
    const stats = new Map();
    const stat = (id) => {
      if (!stats.has(id)) stats.set(id, { hawk: 0, escapes: 0 });
      return stats.get(id);
    };
    const clock = createClock(() => {
      if (st.phase === 'discuss') setPhase('voting', cfg.voteTime);
      else if (st.phase === 'voting') tally();
      else if (st.phase === 'guess') finishGuess(null);
    });

    function setPhase(phase, secs = 0) {
      st.phase = phase;
      clock.set(secs);
      ctx.broadcast();
    }

    function startRound() {
      const active = ctx.connected();
      st.round++;
      st.cat = cfg.category === 'mix' ? pick(CATEGORIES) : CATEGORIES.find((c) => c.key === cfg.category);
      st.word = pickWord(st.cat);
      st.outsider = pick(active).id;
      st.seen = new Set();
      st.turns = buildTurns(active.map((p) => p.id), cfg.laps);
      st.turn = 0;
      st.votes = new Map();
      st.accused = null;
      st.outcome = null;
      st.guessOptions = [];
      st.guess = null;
      st.guessed = false;
      st.gains = {};
      setPhase('reveal');
    }

    const live = (id) => {
      const p = ctx.get(id);
      return p && p.connected;
    };

    // Skip any turn whose asker or target is not connected
    function skipMissing() {
      while (st.turn < st.turns.length && !(live(st.turns[st.turn].asker) && live(st.turns[st.turn].target))) st.turn++;
    }

    function startQuestions() {
      st.turn = 0;
      skipMissing();
      if (st.turn >= st.turns.length) return afterQuestions();
      setPhase('questions');
    }

    function nextTurn() {
      st.turn++;
      skipMissing();
      if (st.turn >= st.turns.length) afterQuestions();
      else ctx.broadcast();
    }

    function afterQuestions() {
      if (cfg.discuss > 0) setPhase('discuss', cfg.discuss);
      else setPhase('voting', cfg.voteTime);
    }

    // A player is caught with the most votes alone, and at least two votes.
    // After voting the outsider always gets to guess the word, caught or not.
    function tally() {
      const counts = new Map();
      for (const target of st.votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
      const max = Math.max(0, ...counts.values());
      const leaders = [...counts].filter(([, c]) => c === max).map(([id]) => id);
      st.accused = max >= 2 && leaders.length === 1 ? leaders[0] : null;
      st.outcome = st.accused === st.outsider ? 'caught' : st.accused ? 'framed' : 'escaped';
      for (const [voter, target] of st.votes) if (target === st.outsider) stat(voter).hawk++;
      if (st.outcome !== 'caught') stat(st.outsider).escapes++;

      const others = shuffle(st.cat.words.filter((w) => w !== st.word)).slice(0, GUESS_OPTIONS - 1);
      st.guessOptions = shuffle([st.word, ...others]);
      if (!live(st.outsider)) return finishGuess(null);
      setPhase('guess', GUESS_SECONDS);
    }

    function finishGuess(word) {
      st.guess = word;
      st.guessed = word === st.word;
      award();
    }

    function award() {
      const gains = {};
      for (const p of ctx.players()) gains[p.id] = 0;
      if (st.outcome === 'caught') {
        for (const p of ctx.players()) if (p.id !== st.outsider) gains[p.id] += INSIDER_POINTS;
      } else {
        gains[st.outsider] = (gains[st.outsider] || 0) + ESCAPE_POINTS;
      }
      if (st.guessed) gains[st.outsider] = (gains[st.outsider] || 0) + GUESS_POINTS;
      for (const [id, g] of Object.entries(gains)) {
        const p = ctx.get(id);
        if (p) p.score += g;
      }
      st.gains = gains;
      setPhase('result');
    }

    function checkProgress() {
      const active = ctx.connected();
      if (!active.length) return false;
      if (st.phase === 'reveal' && active.every((p) => st.seen.has(p.id))) {
        startQuestions();
        return true;
      }
      if (st.phase === 'voting' && active.every((p) => st.votes.has(p.id))) {
        tally();
        return true;
      }
      return false;
    }

    return {
      get phase() {
        return st.phase;
      },
      start: startRound,
      stop: clock.stop,

      snapshot() {
        const t = st.turns[st.turn];
        // Everyone sees the big screen: never show the word or the outsider before the result
        const s = {
          phase: st.phase,
          round: st.round,
          rounds: cfg.rounds,
          remaining: clock.remaining(),
          duration: clock.duration,
          category: cfg.showCategory || st.phase === 'result' ? st.cat.title : null,
          done: st.phase === 'reveal' ? [...st.seen] : st.phase === 'voting' ? [...st.votes.keys()] : [],
          turn: st.phase === 'questions' && t ? { asker: t.asker, target: t.target, index: st.turn + 1, total: st.turns.length } : null,
        };
        // Keep the vote result secret during the guess, for the reveal
        if (st.phase === 'result') {
          Object.assign(s, {
            accused: st.accused,
            outsider: st.outsider,
            word: st.word,
            guess: st.guess,
            guessed: st.guessed,
            outcome: st.outcome,
            votes: Object.fromEntries(st.votes),
            gains: st.gains,
          });
        }
        if (st.phase === 'final') {
          s.winnerTitle = module.exports.winnerTitle;
          s.awards = awards(stats, [
            { key: 'hawk', title: 'عين الصقر', label: 'مرات التصويت الصح' },
            { key: 'escapes', title: 'أفضل ممثل', label: 'مرات الإفلات' },
          ], (id) => !!ctx.get(id));
        }
        return s;
      },

      meView(p) {
        const out = p.id === st.outsider;
        return {
          role: out ? 'outsider' : 'insider',
          word: out ? null : st.word,
          category: out && !cfg.showCategory ? null : st.cat.title,
          seen: st.seen.has(p.id),
          vote: st.votes.get(p.id) || null,
          guessOptions: st.phase === 'guess' && out ? st.guessOptions : null,
          gain: st.phase === 'result' ? st.gains[p.id] || 0 : null,
        };
      },

      action(p, data, reply) {
        if (data.type === 'seen') {
          if (st.phase !== 'reveal') return reply({ ok: true });
          st.seen.add(p.id);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'next') {
          const t = st.turns[st.turn];
          if (st.phase !== 'questions' || !t) return reply({ error: 'مو وقت الأسئلة.' });
          if (p.id !== t.asker && p.id !== t.target) return reply({ error: 'مو دورك.' });
          reply({ ok: true });
          nextTurn();
        } else if (data.type === 'vote') {
          if (st.phase !== 'voting') return reply({ error: 'انتهى وقت التصويت.' });
          if (st.votes.has(p.id)) return reply({ error: 'صوّتت خلاص.' });
          if (data.target === p.id) return reply({ error: 'ما تقدر تصوّت لنفسك.' });
          if (!ctx.get(data.target)) return reply({ error: 'هذا اللاعب مو موجود.' });
          st.votes.set(p.id, data.target);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'guess') {
          if (st.phase !== 'guess' || p.id !== st.outsider) return reply({ error: 'مو وقت التخمين.' });
          if (!st.guessOptions.includes(data.word)) return reply({ error: 'اختر كلمة من القائمة.' });
          reply({ ok: true });
          finishGuess(data.word);
        } else reply({ error: 'طلب غير معروف.' });
      },

      hostAction(type) {
        if (type === 'skip') {
          if (st.phase === 'reveal') startQuestions();
          else if (st.phase === 'questions') nextTurn();
          else if (st.phase === 'discuss') setPhase('voting', cfg.voteTime);
          else if (st.phase === 'voting') tally();
        } else if (type === 'next' && st.phase === 'result') {
          if (st.round >= cfg.rounds) setPhase('final');
          else startRound();
        }
      },

      // What a test bot does now. Bots don't reason: they vote and guess at random.
      botMove(p) {
        const r = st.round;
        if (st.phase === 'reveal' && !st.seen.has(p.id)) {
          return { key: `s${r}`, delay: between(1200, 3500), data: { type: 'seen' } };
        }
        const t = st.turns[st.turn];
        if (st.phase === 'questions' && t && t.asker === p.id) {
          // Give the humans a few seconds to read the turn before moving on
          return { key: `q${r}-${st.turn}`, delay: between(4000, 6500), data: { type: 'next' } };
        }
        if (st.phase === 'voting' && !st.votes.has(p.id)) {
          const others = ctx.players().filter((x) => x.id !== p.id);
          const target = pick(others).id;
          return { key: `v${r}`, delay: between(2500, 6000), data: { type: 'vote', target } };
        }
        if (st.phase === 'guess' && p.id === st.outsider) {
          return { key: `g${r}`, delay: between(3000, 6000), data: { type: 'guess', word: pick(st.guessOptions) } };
        }
        return null;
      },

      onDisconnect(p) {
        const t = st.turns[st.turn];
        if (st.phase === 'questions' && t && (t.asker === p.id || t.target === p.id)) return nextTurn();
        if (!checkProgress()) ctx.broadcast();
      },
    };
  },
};
