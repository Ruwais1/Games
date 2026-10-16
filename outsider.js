'use strict';
// لعبة برا السالفة
const CATEGORIES = require('./words');
const { shuffle, pick, ar, options, seconds, createClock } = require('./util');

const GUESS_SECONDS = 30;
const GUESS_OPTIONS = 8; // عدد الكلمات اللي تطلع للي برا السالفة وقت التخمين
const INSIDER_POINTS = 1; // لكل واحد يعرف الكلمة إذا انكشف اللي برا السالفة
const ESCAPE_POINTS = 2; // للي برا السالفة إذا ما انكشف
const GUESS_POINTS = 1; // نقطة زيادة للي برا السالفة إذا خمّن الكلمة صح
const usedWords = new Map(); // الفئة -> الكلمات اللي انلعبت

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

// كل واحد يسأل شخص مختلف في كل دورة، ومع ٣ لاعبين ودورتين: كل واحد يسأل الاثنين
function buildTurns(ids, laps) {
  const asked = new Map(ids.map((id) => [id, new Set()]));
  const turns = [];
  for (let lap = 0; lap < laps; lap++) {
    for (const asker of shuffle([...ids])) {
      let pool = ids.filter((t) => t !== asker && !asked.get(asker).has(t));
      if (!pool.length) {
        asked.get(asker).clear();
        pool = ids.filter((t) => t !== asker);
      }
      const last = turns[turns.length - 1];
      const noPingPong = pool.filter((t) => !(last && last.asker === t && last.target === asker));
      if (noPingPong.length) pool = noPingPong;
      const target = pick(pool);
      asked.get(asker).add(target);
      turns.push({ asker, target });
    }
  }
  return turns;
}

module.exports = {
  key: 'outsider',
  title: 'برا السالفة',
  tagline: 'الكل يعرف الكلمة إلا واحد. اكشفوه قبل ما يكشفها.',
  minPlayers: 3,
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

    // نتخطى أي سؤال صاحبه أو اللي ينسأل مو موجود
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

    // ينمسك الشخص إذا جاب أكثر أصوات لوحده، وبصوتين على الأقل.
    // وبعد التصويت، اللي برا السالفة يخمّن الكلمة دايم، سواء انمسك أو لا
    function tally() {
      const counts = new Map();
      for (const target of st.votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
      const max = Math.max(0, ...counts.values());
      const leaders = [...counts].filter(([, c]) => c === max).map(([id]) => id);
      st.accused = max >= 2 && leaders.length === 1 ? leaders[0] : null;
      st.outcome = st.accused === st.outsider ? 'caught' : st.accused ? 'framed' : 'escaped';

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
        // الشاشة يشوفها الكل، فما تعرض الكلمة ولا مين برا السالفة إلا في النهاية
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
        // وقت التخمين ما نكشف مين انمسك، عشان تبقى المفاجأة للنتيجة
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

      onDisconnect(p) {
        const t = st.turns[st.turn];
        if (st.phase === 'questions' && t && (t.asker === p.id || t.target === p.id)) return nextTurn();
        if (!checkProgress()) ctx.broadcast();
      },
    };
  },
};
