'use strict';
// لعبة الكذّاب
const QUESTIONS = require('./questions');
const { normalize, shuffle, cleanText, ar, options, seconds, createClock } = require('./util');

const TRUTH_POINTS = 2; // لمن يختار الصح
const FOOL_POINTS = 1; // لصاحب الكذبة عن كل شخص انخدع فيها
const MAX_LIE = 40;
const used = new Set(); // الأسئلة اللي انلعبت، عشان ما تتكرر

function pickQuestion() {
  let pool = QUESTIONS.map((_, i) => i).filter((i) => !used.has(i));
  if (!pool.length) {
    used.clear();
    pool = QUESTIONS.map((_, i) => i);
  }
  const i = pool[Math.floor(Math.random() * pool.length)];
  used.add(i);
  return QUESTIONS[i];
}

module.exports = {
  key: 'kaddab',
  title: 'الكذّاب',
  tagline: 'اكتب كذبة تمشي عليهم، واكشف الصح من بين كذباتهم.',
  minPlayers: 2,
  settings: [
    { key: 'rounds', label: 'عدد الجولات', default: 5, options: options([3, 5, 7, 10], ar) },
    { key: 'writeTime', label: 'وقت كتابة الكذبة', default: 60, options: options([30, 45, 60, 90], seconds) },
    { key: 'voteTime', label: 'وقت التصويت', default: 30, options: options([20, 30, 45], seconds) },
  ],

  create(ctx, cfg) {
    const st = { phase: 'writing', round: 0, question: null, lies: new Map(), options: [], votes: new Map(), gains: {} };
    const clock = createClock(() => {
      if (st.phase === 'writing') startVoting();
      else if (st.phase === 'voting') reveal();
    });

    function setPhase(phase, secs = 0) {
      st.phase = phase;
      clock.set(secs);
      ctx.broadcast();
    }

    function nextRound() {
      st.round++;
      st.question = pickQuestion();
      st.lies.clear();
      st.votes.clear();
      st.options = [];
      st.gains = {};
      setPhase('writing', cfg.writeTime);
    }

    function startVoting() {
      const opts = [{ text: st.question.a, truth: true, authors: [] }];
      for (const [pid, text] of st.lies) opts.push({ text, truth: false, authors: [pid] });
      st.options = shuffle(opts).map((o, i) => ({ ...o, id: 'o' + i, voters: [] }));
      setPhase('voting', cfg.voteTime);
    }

    function reveal() {
      const gains = {};
      for (const p of ctx.players()) gains[p.id] = 0;
      for (const [pid, oid] of st.votes) {
        const o = st.options.find((x) => x.id === oid);
        if (!o) continue;
        o.voters.push(pid);
        if (o.truth) gains[pid] = (gains[pid] || 0) + TRUTH_POINTS;
        else for (const a of o.authors) if (a !== pid) gains[a] = (gains[a] || 0) + FOOL_POINTS;
      }
      for (const [pid, g] of Object.entries(gains)) {
        const p = ctx.get(pid);
        if (p) p.score += g;
      }
      st.gains = gains;
      setPhase('reveal');
    }

    function isTruth(text) {
      const n = normalize(text);
      return [st.question.a, ...(st.question.alt || [])].some((x) => normalize(x) === n);
    }

    // إذا الكل خلّص قبل الوقت، ننتقل مباشرة. ترجع true إذا انتقلت المرحلة.
    function checkProgress() {
      const active = ctx.connected();
      if (!active.length) return false;
      if (st.phase === 'writing' && active.every((p) => st.lies.has(p.id))) {
        startVoting();
        return true;
      }
      if (st.phase === 'voting' && active.every((p) => st.votes.has(p.id))) {
        reveal();
        return true;
      }
      return false;
    }

    return {
      get phase() {
        return st.phase;
      },
      start: nextRound,
      stop: clock.stop,

      snapshot() {
        const s = {
          phase: st.phase,
          round: st.round,
          rounds: cfg.rounds,
          remaining: clock.remaining(),
          duration: clock.duration,
          maxLie: MAX_LIE,
          question: st.question ? st.question.q : null,
          done: st.phase === 'writing' ? [...st.lies.keys()] : st.phase === 'voting' ? [...st.votes.keys()] : [],
        };
        // وقت التصويت: النصوص بس، بدون مين كتبها ولا وين الصح
        if (st.phase === 'voting') s.options = st.options.map((o) => ({ id: o.id, text: o.text }));
        if (st.phase === 'reveal') {
          s.options = st.options.map((o) => ({ id: o.id, text: o.text, truth: o.truth, authors: o.authors, voters: o.voters }));
          s.gains = st.gains;
        }
        return s;
      },

      meView(p) {
        const own = st.options.find((o) => o.authors.includes(p.id));
        return {
          lie: st.lies.get(p.id) || null,
          vote: st.votes.get(p.id) || null,
          ownOption: own ? own.id : null,
          gain: st.phase === 'reveal' ? st.gains[p.id] || 0 : null,
        };
      },

      action(p, data, reply) {
        if (data.type === 'lie') {
          if (st.phase !== 'writing') return reply({ error: 'انتهى وقت الكتابة.' });
          if (st.lies.has(p.id)) return reply({ error: 'أرسلت كذبتك خلاص.' });
          const lie = cleanText(data.text, MAX_LIE);
          if (!lie) return reply({ error: 'اكتب كذبتك أول.' });
          if (isTruth(lie)) return reply({ error: 'هذي الإجابة الصحيحة! اكتب كذبة بدالها.' });
          if ([...st.lies.values()].some((l) => normalize(l) === normalize(lie))) {
            return reply({ error: 'أحد سبقك بنفس الكذبة، جرّب غيرها.' });
          }
          st.lies.set(p.id, lie);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else if (data.type === 'vote') {
          if (st.phase !== 'voting') return reply({ error: 'انتهى وقت التصويت.' });
          if (st.votes.has(p.id)) return reply({ error: 'صوّتت خلاص.' });
          const o = st.options.find((x) => x.id === data.option);
          if (!o) return reply({ error: 'هذا الاختيار مو موجود.' });
          if (o.authors.includes(p.id)) return reply({ error: 'ما تقدر تختار كذبتك.' });
          st.votes.set(p.id, o.id);
          reply({ ok: true });
          if (!checkProgress()) ctx.broadcast();
        } else reply({ error: 'طلب غير معروف.' });
      },

      hostAction(type) {
        if (type === 'skip') {
          if (st.phase === 'writing') startVoting();
          else if (st.phase === 'voting') reveal();
        } else if (type === 'next' && st.phase === 'reveal') {
          if (st.round >= cfg.rounds) setPhase('final');
          else nextRound();
        }
      },

      onDisconnect() {
        if (!checkProgress()) ctx.broadcast();
      },
    };
  },
};
