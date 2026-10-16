'use strict';
// أدوات مشتركة بين الألعاب

// توحيد الكتابة العربية عشان "أسود" و"اسود" و"الأسود" تُحسب نفس الشي
function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((w) => w.replace(/^ال(?=..)/, ''))
    .join('');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cleanText = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const ar = (n) => Number(n).toLocaleString('ar-SA');
const options = (values, label) => values.map((value) => ({ value, label: label(value) }));
const seconds = (v) => `${ar(v)} ث`;

// مؤقت لكل لعبة: يحفظ نهاية المرحلة ويشغّل دالة لما يخلص الوقت
function createClock(onTimeout) {
  let timer = null;
  const clock = {
    deadline: 0,
    duration: 0,
    set(secs) {
      clearTimeout(timer);
      timer = null;
      clock.duration = secs * 1000;
      clock.deadline = secs ? Date.now() + clock.duration : 0;
      if (secs) timer = setTimeout(onTimeout, clock.duration);
    },
    stop() {
      clearTimeout(timer);
      timer = null;
    },
    remaining() {
      return clock.deadline ? Math.max(0, clock.deadline - Date.now()) : 0;
    },
  };
  return clock;
}

module.exports = { normalize, shuffle, pick, cleanText, ar, options, seconds, createClock };
