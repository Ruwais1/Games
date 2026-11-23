'use strict';
// "Malaf Al-Qadiya" (Case File): read a short case, study the evidence
// (pictures, statements, recordings), then answer questions about it on your phone.
const CASES = require('./cases');
const { shuffle, ar, options, seconds, createClock } = require('./util');

const CATEGORY_TITLES = { theft: 'سرقة', fraud: 'احتيال', murder: 'قتل' };
const DIFFICULTY_TITLES = { 1: 'سهلة', 2: 'متوسطة', 3: 'صعبة' };
const FIRST_BONUS = 1; // extra point for the fastest correct answer
const usedCases = new Set(); // cases already played, so they don't repeat
const between = (a, b) => a + Math.floor(Math.random() * (b - a));

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

function pickCases(category, count) {
  const pool = CASES.filter((c) => category === 'mix' || c.category === category);
  let fresh = pool.filter((c) => !usedCases.has(c.id));
  if (fresh.length < Math.min(count, pool.length)) {
    for (const c of pool) usedCases.delete(c.id);
    fresh = pool;
  }
  const chosen = shuffle([...fresh]).slice(0, count);
  for (const c of chosen) usedCases.add(c.id);
  return chosen;
}

// Shuffle a question's options and remember where the right one went
function shuffleQuestion(q) {
  const order = shuffle(q.options.map((_, i) => i));
  return { q: q.q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

module.exports = {
  key: 'detective',
  title: 'ملف القضية',
  tagline: 'اقرأ القضية، افحص الأدلة واسمع التسجيلات، واكشف الجاني قبل الكل.',
  minPlayers: 1,
  winnerTitle: 'كبير المحققين',
  settings: [
    {
      key: 'category',
      label: 'نوع القضايا',
      default: 'mix',
      options: [
        { value: 'mix', label: 'عشوائي' },
        { value: 'theft', label: 'سرقة' },
        { value: 'fraud', label: 'احتيال' },
        { value: 'murder', label: 'قتل' },
      ],
    },
    { key: 'cases', label: 'عدد القضايا', default: 2, options: options([1, 2, 3], ar) },
    {
      key: 'evidenceTime',
      label: 'وقت فحص الأدلة',
      default: 120,
      options: [
        { value: 60, label: 'دقيقة' },
        { value: 120, label: 'دقيقتين' },
        { value: 180, label: '٣ دقايق' },
      ],
    },
    { key: 'questionTime', label: 'وقت كل سؤال', default: 45, options: options([30, 45, 60], seconds) },
  ],

  create(ctx, cfg) {
    const list = pickCases(cfg.category, cfg.cases);
    const st = {
      phase: 'intro', // intro | evidence | question | answer | solution | final
      index: -1, // which case
      caseDef: null,
      questions: [],
      qi: 0,
      ready: new Set(),
      answers: new Map(), // playerId -> { option, at }
      gains: {},
      first: null,
    };
    const stats = new Map();
    const stat = (id) => {
      if (!stats.has(id)) stats.set(id, { correct: 0, fastest: 0 });
      return stats.get(id);
    };
    const clock = createClock(() => {
      if (st.phase === 'evidence') startQuestion(0);
      else if (st.phase === 'question') reveal();
    });

    function setPhase(phase, secs = 0) {
      st.phase = phase;
      clock.set(secs);
      ctx.broadcast();
    }

    function nextCase() {
      st.index++;
      st.caseDef = list[st.index];
      st.questions = st.caseDef.questions.map(shuffleQuestion);
      st.qi = 0;
      st.ready = new Set();
      setPhase('intro');
    }

    function startEvidence() {
      st.ready = new Set();
      setPhase('evidence', cfg.evidenceTime);
    }

    function startQuestion(i) {
      st.qi = i;
      st.answers = new Map();
      st.gains = {};
      st.first = null;
      setPhase('question', cfg.questionTime);
    }

    function reveal() {
      const q = st.questions[st.qi];
      const worth = st.caseDef.difficulty;
      const gains = {};
      for (const p of ctx.players()) gains[p.id] = 0;
      const right = [...st.answers].filter(([, a]) => a.option === q.answer).sort((a, b) => a[1].at - b[1].at);
      for (const [pid] of right) {
        gains[pid] = (gains[pid] || 0) + worth;
        stat(pid).correct++;
      }
      if (right.length) {
        st.first = right[0][0];
        gains[st.first] += FIRST_BONUS;
        stat(st.first).fastest++;
      }
      for (const [pid, g] of Object.entries(gains)) {
        const p = ctx.get(pid);
        if (p) p.score += g;
      }
      st.gains = gains;
      setPhase('answer');
    }

    // Move on early once everyone is done. Returns true if the phase changed.
    function checkProgress() {
      const active = ctx.connected();
      if (!active.length) return false;
      if (st.phase === 'intro' && active.every((p) => st.ready.has(p.id))) {
        startEvidence();
        return true;
      }
      if (st.phase === 'evidence' && active.every((p) => st.ready.has(p.id))) {
        startQuestion(0);
        return true;
      }
      if (st.phase === 'question' && active.every((p) => st.answers.has(p.id))) {
        reveal();
        return true;
      }
      return false;
    }

    function caseView() {
      const c = st.caseDef;
      return {
        title: c.title,
        number: st.index + 1,
        total: list.length,
        category: c.category,
        categoryTitle: CATEGORY_TITLES[c.category],
        difficulty: c.difficulty,
        difficultyTitle: DIFFICULTY_TITLES[c.difficulty],
        story: c.story,
        suspects: c.suspects,
        evidence: c.evidence,
      };
    }

    return {
      get phase() {
        return st.phase;
      },
      start: nextCase,
      stop: clock.stop,

      snapshot() {
        const s = {
          phase: st.phase,
          round: st.index + 1,
          rounds: list.length,
          remaining: clock.remaining(),
          duration: clock.duration,
          done:
            st.phase === 'intro' || st.phase === 'evidence'
              ? [...st.ready]
              : st.phase === 'question'
                ? [...st.answers.keys()]
                : [],
        };
        if (st.caseDef && st.phase !== 'final') s.case = caseView();
        if (st.phase === 'question' || st.phase === 'answer') {
          const q = st.questions[st.qi];
          s.question = { index: st.qi + 1, total: st.questions.length, q: q.q, options: q.options };
        }
        if (st.phase === 'answer') {
          const q = st.questions[st.qi];
          s.question.answer = q.answer;
          s.question.picks = q.options.map((_, i) => [...st.answers].filter(([, a]) => a.option === i).map(([id]) => id));
          s.first = st.first;
          s.gains = st.gains;
        }
        if (st.phase === 'solution') {
          s.solution = st.caseDef.solution;
          s.culprit = st.caseDef.culprit;
        }
        if (st.phase === 'final') {
          s.winnerTitle = module.exports.winnerTitle;
          s.awards = awards(stats, [
            { key: 'fastest', title: 'أسرع محقق', label: 'مرات أول جواب صح' },
            { key: 'correct', title: 'ما يفوته شي', label: 'الأجوبة الصح' },
          ], (id) => !!ctx.get(id));
        }
        return s;
      },

      meView(p) {
        const a = st.answers.get(p.id);
        return {
          ready: st.ready.has(p.id),
          answer: a ? a.option : null,
          gain: st.phase === 'answer' ? st.gains[p.id] || 0 : null,
        };
      },

      action(p, data, reply) {
        if (data.type === 'ready') {
          if (st.phase !== 'intro' && st.phase !== 'evidence') return reply({ ok: true });
          st.ready.add(p.id);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'answer') {
          if (st.phase !== 'question') return reply({ error: 'انتهى وقت السؤال.' });
          if (st.answers.has(p.id)) return reply({ error: 'جاوبت خلاص.' });
          const q = st.questions[st.qi];
          const option = Number(data.option);
          if (!Number.isInteger(option) || option < 0 || option >= q.options.length) return reply({ error: 'اختيار غير موجود.' });
          st.answers.set(p.id, { option, at: Date.now() });
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else reply({ error: 'طلب غير معروف.' });
      },

      hostAction(type) {
        if (type === 'skip') {
          if (st.phase === 'intro') startEvidence();
          else if (st.phase === 'evidence') startQuestion(0);
          else if (st.phase === 'question') reveal();
        } else if (type === 'next') {
          if (st.phase === 'answer') {
            if (st.qi + 1 < st.questions.length) startQuestion(st.qi + 1);
            else setPhase('solution');
          } else if (st.phase === 'solution') {
            if (st.index + 1 < list.length) nextCase();
            else setPhase('final');
          }
        }
      },

      // Test bots: get ready after a moment, then answer at random
      botMove(p) {
        if ((st.phase === 'intro' || st.phase === 'evidence') && !st.ready.has(p.id)) {
          return { key: `r${st.index}-${st.phase}`, delay: between(2500, 6000), data: { type: 'ready' } };
        }
        if (st.phase === 'question' && !st.answers.has(p.id)) {
          const q = st.questions[st.qi];
          return { key: `a${st.index}-${st.qi}`, delay: between(3000, 9000), data: { type: 'answer', option: Math.floor(Math.random() * q.options.length) } };
        }
        return null;
      },

      onDisconnect() {
        if (!checkProgress()) ctx.broadcast();
      },
    };
  },
};
