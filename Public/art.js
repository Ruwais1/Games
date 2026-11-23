// Drawings, evidence cards and clue recordings for "Malaf Al-Qadiya".
// Everything is drawn in code (SVG + Web Audio), so there are no image or audio files.
(function () {
  const SKIN = ['#F1C9A5', '#D9A47A', '#B37A52', '#8A5A3C'];
  const HAIR = '#2A1E12';

  // ---------- Suspect portraits ----------
  function avatar(look = {}) {
    const skin = SKIN[look.skin ?? 1] || SKIN[1];
    const cloth = look.color || '#3A86C8';
    const light = /^#F/i.test(cloth); // white thobe needs an outline
    const parts = [];
    parts.push('<circle cx="60" cy="60" r="58" fill="#E6D1A6"/>');
    // Shoulders
    parts.push(`<path d="M14 120 C18 88 40 80 60 80 C80 80 102 88 106 120 Z" fill="${cloth}" ${light ? 'stroke="#C9BFA9" stroke-width="2"' : ''}/>`);
    if (look.wear === 'hijab') {
      parts.push(`<path d="M24 120 C22 70 30 22 60 22 C90 22 98 70 96 120 Z" fill="${cloth}"/>`);
      parts.push(`<path d="M24 120 C22 70 30 22 60 22 C90 22 98 70 96 120 Z" fill="#000" opacity=".12"/>`);
    }
    // Neck and head
    parts.push(`<rect x="52" y="66" width="16" height="16" rx="6" fill="${skin}"/>`);
    parts.push(`<ellipse cx="60" cy="50" rx="20" ry="23" fill="${skin}"/>`);
    if (look.wear === 'none' || !look.wear) {
      parts.push(`<path d="M40 48 C40 26 80 26 80 48 C76 38 66 34 60 34 C54 34 44 38 40 48 Z" fill="${HAIR}"/>`);
    }
    if (look.wear === 'cap') {
      parts.push(`<path d="M39 44 C39 22 81 22 81 44 Z" fill="${cloth}"/>`);
      parts.push(`<path d="M60 42 L94 44 C94 48 80 48 60 46 Z" fill="${cloth}"/>`);
      parts.push(`<path d="M39 44 C39 22 81 22 81 44 Z" fill="#000" opacity=".12"/>`);
    }
    if (look.wear === 'shemagh') {
      // Red and white checked headscarf with a black agal
      parts.push('<defs><pattern id="chk" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#F7F3EA"/><rect width="3" height="3" fill="#C8303C"/></pattern></defs>');
      parts.push('<path d="M34 50 C30 22 90 22 86 50 L96 96 C84 90 74 84 76 64 L44 64 C46 84 36 90 24 96 Z" fill="url(#chk)"/>');
      parts.push(`<ellipse cx="60" cy="52" rx="17" ry="20" fill="${skin}"/>`);
      parts.push('<ellipse cx="60" cy="30" rx="24" ry="6" fill="none" stroke="#1C1C1C" stroke-width="4"/>');
    }
    if (look.wear === 'hijab') {
      parts.push(`<path d="M36 52 C34 26 86 26 84 52 C82 36 72 30 60 30 C48 30 38 36 36 52 Z" fill="${cloth}"/>`);
    }
    // Face
    parts.push(`<circle cx="52" cy="50" r="2.6" fill="${HAIR}"/><circle cx="68" cy="50" r="2.6" fill="${HAIR}"/>`);
    parts.push(`<path d="M53 61 Q60 65 67 61" fill="none" stroke="${HAIR}" stroke-width="2" stroke-linecap="round"/>`);
    if (look.beard) parts.push(`<path d="M42 54 C44 74 54 78 60 78 C66 78 76 74 78 54 C74 66 68 68 60 68 C52 68 46 66 42 54 Z" fill="${HAIR}"/>`);
    if (look.mustache || look.beard) parts.push(`<path d="M52 59 Q60 55 68 59 Q60 61 52 59 Z" fill="${HAIR}"/>`);
    if (look.glasses) {
      parts.push(`<g fill="none" stroke="${HAIR}" stroke-width="2"><circle cx="52" cy="50" r="6"/><circle cx="68" cy="50" r="6"/><path d="M58 50 L62 50"/></g>`);
    }
    return `<svg viewBox="0 0 120 120" class="avatar" aria-hidden="true">${parts.join('')}</svg>`;
  }

  // ---------- Evidence drawings ----------
  const steps = (pts, color) =>
    pts.map(([x, y, r], i) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="8" transform="rotate(${r} ${x} ${y})" fill="${color}" opacity="${0.55 + (i % 2) * 0.25}"/>`).join('');
  const label = (x, y, t, size = 12) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="middle" fill="#6B5A43" font-family="IBM Plex Sans Arabic, Tahoma, sans-serif">${t}</text>`;

  const ART = {
    'mud-trail': () => `
      <rect width="240" height="150" fill="#EFE3CC"/>
      <rect x="196" y="20" width="34" height="70" rx="3" fill="#8C6A43"/><circle cx="202" cy="58" r="2.5" fill="#E6D1A6"/>
      ${label(213, 104, 'باب الحوش')}
      <rect x="18" y="66" width="70" height="12" rx="3" fill="#A07650"/><rect x="24" y="78" width="6" height="30" fill="#8C6A43"/><rect x="76" y="78" width="6" height="30" fill="#8C6A43"/>
      ${label(53, 126, 'طاولة المجلس')}
      ${steps([[186, 112, 80], [170, 100, 70], [154, 110, 80], [138, 98, 70], [122, 106, 80], [106, 96, 70], [94, 100, 80]], '#6B4A2B')}`,

    'muddy-shoe': () => `
      <rect width="240" height="150" fill="#EFE3CC"/>
      <path d="M40 104 C40 84 58 64 84 62 L112 58 C124 58 128 66 138 72 C160 84 196 86 204 98 C208 106 204 114 194 116 L52 116 C44 116 40 112 40 104 Z" fill="#F7F3EA" stroke="#3A86C8" stroke-width="4"/>
      <path d="M40 108 L204 108 L202 118 L44 118 Z" fill="#3A86C8"/>
      <path d="M92 66 L108 86 M102 64 L118 84 M112 62 L126 80" stroke="#3A86C8" stroke-width="3"/>
      <ellipse cx="70" cy="110" rx="18" ry="6" fill="#6B4A2B" opacity=".85"/>
      <ellipse cx="150" cy="112" rx="26" ry="7" fill="#6B4A2B" opacity=".8"/>
      <circle cx="176" cy="98" r="6" fill="#6B4A2B" opacity=".7"/><circle cx="58" cy="94" r="5" fill="#6B4A2B" opacity=".6"/>`,

    cups: () => `
      <rect width="240" height="150" fill="#EFE3CC"/>
      <path d="M58 118 L50 72 C50 56 62 48 76 48 C90 48 100 58 98 72 L92 118 Z" fill="#C9A227"/>
      <path d="M98 70 C116 64 124 54 130 40 L136 44 C130 62 118 76 100 82 Z" fill="#C9A227"/>
      <path d="M62 50 C66 34 86 34 90 50 Z" fill="#B08E1F"/><circle cx="76" cy="32" r="5" fill="#B08E1F"/>
      ${[150, 180, 210].map((x) => `<path d="M${x - 13} 100 L${x + 13} 100 L${x + 9} 118 L${x - 9} 118 Z" fill="#F7F3EA" stroke="#C9BFA9" stroke-width="2"/><ellipse cx="${x}" cy="101" rx="11" ry="3" fill="#C9A227" opacity=".7"/>`).join('')}`,

    'two-cups': () => `
      <rect width="240" height="150" fill="#EFE3CC"/>
      <rect x="10" y="90" width="220" height="16" rx="3" fill="#8C6A43"/>
      <path d="M70 62 L102 62 L98 90 L74 90 Z" fill="#F7F3EA" stroke="#C9BFA9" stroke-width="2"/><ellipse cx="86" cy="63" rx="15" ry="3.5" fill="#B08E1F"/>
      <path d="M140 62 L172 62 L168 90 L144 90 Z" fill="#F7F3EA" stroke="#C9BFA9" stroke-width="2"/><ellipse cx="156" cy="63" rx="15" ry="3.5" fill="#E9E1CF"/>
      ${label(86, 128, 'فيه قهوة')}${label(156, 128, 'فاضي')}`,

    'wedding-photo': () => `
      <rect width="240" height="150" fill="#2B2B3A"/>
      <rect x="10" y="10" width="220" height="130" fill="#3B3150" stroke="#F7F3EA" stroke-width="6"/>
      ${[30, 60, 90, 120, 150, 180, 210].map((x, i) => `<circle cx="${x}" cy="${22 + (i % 2) * 8}" r="3" fill="#FFD36E"/>`).join('')}
      <path d="M70 140 C70 100 80 86 96 86 C112 86 122 100 122 140 Z" fill="#F7F3EA"/><circle cx="96" cy="70" r="14" fill="#D9A47A"/><path d="M80 66 C80 50 112 50 112 66 L118 92 L74 92 Z" fill="#F7F3EA"/><circle cx="96" cy="70" r="12" fill="#D9A47A"/>
      <path d="M128 140 C128 100 138 86 154 86 C170 86 180 100 180 140 Z" fill="#2B2B3A"/><circle cx="154" cy="70" r="14" fill="#B37A52"/><path d="M138 64 C138 48 170 48 170 64 L176 90 L132 90 Z" fill="#F7F3EA"/><circle cx="154" cy="70" r="12" fill="#B37A52"/>
      <text x="24" y="132" font-size="16" fill="#FF9F43" font-family="monospace" direction="ltr" text-anchor="start" unicode-bidi="plaintext">11:05 PM</text>`,

    'chalet-plan': () => `
      <rect width="240" height="150" fill="#F7F3EA"/>
      <g fill="none" stroke="#2A1E12" stroke-width="2.5">
        <rect x="8" y="8" width="224" height="134"/>
        <rect x="150" y="8" width="82" height="44"/><rect x="150" y="52" width="82" height="45"/><rect x="150" y="97" width="82" height="45"/>
      </g>
      <rect x="20" y="30" width="74" height="90" rx="6" fill="#7EC8E3" stroke="#3A86C8" stroke-width="2"/>
      ${label(57, 80, 'المسبح', 13)}
      ${label(191, 34, 'غرفة ١')}${label(191, 79, 'غرفة ٢')}${label(191, 124, 'غرفة ٣')}
      ${label(120, 22, 'الصالة', 11)}
      <path d="M150 64 L150 84" stroke="#F7F3EA" stroke-width="5"/>
      ${steps([[102, 76, 90], [114, 70, 90], [124, 78, 90], [134, 72, 90], [144, 76, 90]], '#3A86C8')}`,

    'broken-glass': () => `
      <rect width="240" height="150" fill="#D8E6EC"/>
      <ellipse cx="128" cy="104" rx="70" ry="22" fill="#F5A623" opacity=".75"/>
      <path d="M90 80 L112 70 L106 96 Z M130 66 L150 84 L124 88 Z M160 96 L182 92 L168 112 Z M70 104 L88 98 L84 116 Z" fill="#FFFFFF" stroke="#9FB8C6" stroke-width="2"/>
      <path d="M116 112 L128 104 L134 120 Z M144 116 L156 108 L150 126 Z" fill="#FFFFFF" stroke="#9FB8C6" stroke-width="2"/>`,

    console: () => `
      <rect width="240" height="150" fill="#E9EEF5"/>
      <path d="M92 20 C110 18 120 30 120 40 L120 134 L98 134 C86 112 84 60 92 20 Z" fill="#FFFFFF" stroke="#C9D3E0" stroke-width="2"/>
      <path d="M148 20 C130 18 120 30 120 40 L120 134 L142 134 C154 112 156 60 148 20 Z" fill="#FFFFFF" stroke="#C9D3E0" stroke-width="2"/>
      <rect x="116" y="30" width="8" height="104" fill="#1C1C24"/>
      <path d="M160 112 C160 98 170 94 182 94 L206 94 C218 94 228 98 228 112 C228 126 220 132 212 126 L204 118 L184 118 L176 126 C168 132 160 126 160 112 Z" fill="#FFFFFF" stroke="#C9D3E0" stroke-width="2"/>`,
  };

  const svg = (name) => `<svg viewBox="0 0 240 150" class="ev-svg" aria-hidden="true">${(ART[name] || (() => ''))()}</svg>`;

  // ---------- Evidence cards (shared by the big screen and the phones) ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function evidenceCard(item, opts = {}) {
    const card = el('li', 'card ev');
    card.append(el('span', 'ev-title', item.title));
    if (item.kind === 'art') {
      const box = el('div', 'ev-art');
      box.innerHTML = svg(item.art);
      card.append(box, el('p', 'ev-text', item.text));
    } else if (item.kind === 'note') {
      card.append(el('blockquote', 'ev-note', `«${item.text}»`));
    } else if (item.kind === 'sms') {
      const sms = el('div', 'sms');
      sms.append(el('div', 'sms-from', item.from), el('div', 'sms-bubble', item.text), el('div', 'sms-time', item.time));
      card.append(sms);
    } else if (item.kind === 'listing') {
      const photo = el('div', 'listing-photo');
      photo.innerHTML = svg('console');
      photo.append(el('span', 'watermark', item.watermark));
      const meta = el('div', 'listing-meta');
      meta.append(el('b', 'listing-price', item.price), el('span', 'listing-seller', item.seller), el('span', 'listing-small', `${item.age} · ${item.rating}`));
      card.append(photo, meta, el('p', 'ev-text', item.text));
    } else if (item.kind === 'receipt') {
      const r = el('div', 'receipt');
      for (const line of item.lines) r.append(el('div', null, line));
      r.append(el('div', 'receipt-time', item.time));
      card.append(r);
    } else if (item.kind === 'app') {
      const app = el('div', 'app');
      app.append(el('div', 'app-head', '📍 تطبيق التوصيل'), el('div', null, item.text));
      card.append(app);
    } else if (item.kind === 'sound') {
      const row = el('div', 'sound');
      if (opts.onPlay) {
        const b = el('button', 'btn sound-play', '▶ شغّل التسجيل');
        b.type = 'button';
        b.onclick = () => opts.onPlay(item.sound, b);
        row.append(b);
      } else {
        row.append(el('span', 'sound-hint', '🔊 التسجيل يشتغل من الشاشة'));
      }
      card.append(row, el('p', 'ev-text', item.text));
    }
    return card;
  }

  function suspectCard(s, opts = {}) {
    const card = el('li', 'card suspect');
    const face = el('div', 'suspect-face');
    face.innerHTML = avatar(s.look);
    const info = el('div', 'suspect-info');
    info.append(el('b', 'suspect-name', s.name), el('span', 'suspect-role', s.role));
    if (!opts.short) info.append(el('q', 'suspect-says', s.says));
    card.append(face, info);
    return card;
  }

  // ---------- Clue recordings (Web Audio) ----------
  function noiseBuffer(a, secs) {
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * secs), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function env(a, node, t, peak, dur) {
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g).connect(a.destination);
    return g;
  }
  function tone(a, freq, t, dur, type = 'sine', peak = 0.3, to) {
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(a, o, t, peak, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function noise(a, t, dur, filterType, freq, peak = 0.4) {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer(a, dur + 0.05);
    const f = a.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    src.connect(f);
    env(a, f, t, peak, dur);
    src.start(t);
  }
  const knock = (a, t) => { noise(a, t, 0.09, 'lowpass', 500, 0.9); tone(a, 140, t, 0.12, 'sine', 0.5, 70); };
  function creak(a, t) {
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(170, t);
    o.frequency.linearRampToValueAtTime(380, t + 0.6);
    o.frequency.linearRampToValueAtTime(240, t + 1.0);
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = 14;
    depth.gain.value = 25;
    lfo.connect(depth).connect(o.frequency);
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 3;
    o.connect(f);
    env(a, f, t, 0.25, 1.1);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.2);
    lfo.stop(t + 1.2);
    knock(a, t + 1.15);
  }
  function chime(a, t) {
    tone(a, 523, t, 1.1, 'sine', 0.35);
    tone(a, 1046, t, 0.7, 'sine', 0.12);
    tone(a, 1568, t, 0.4, 'sine', 0.06);
  }

  // Each recording returns its length in seconds
  const CLUES = {
    safe(a, t) {
      creak(a, t);
      for (let i = 0; i < 11; i++) chime(a, t + 2 + i * 0.9);
      const k = t + 2 + 11 * 0.9 + 0.8;
      for (let i = 0; i < 4; i++) tone(a, 1500, k + i * 0.32, 0.11, 'square', 0.12);
      tone(a, 880, k + 1.6, 0.14, 'sine', 0.25);
      tone(a, 1320, k + 1.78, 0.2, 'sine', 0.25);
      noise(a, k + 2.1, 0.06, 'highpass', 2000, 0.5);
      return k + 2.5 - t;
    },
    knock(a, t) {
      for (let i = 0; i < 3; i++) knock(a, t + i * 0.34);
      knock(a, t + 3 * 0.34 + 0.9);
      creak(a, t + 3.4);
      return 5;
    },
    glass(a, t) {
      noise(a, t, 0.35, 'highpass', 2500, 0.7);
      tone(a, 220, t, 0.15, 'triangle', 0.3, 90);
      for (let i = 0; i < 12; i++) tone(a, 2500 + Math.random() * 3500, t + 0.05 + Math.random() * 0.7, 0.08 + Math.random() * 0.25, 'sine', 0.08);
      noise(a, t + 0.4, 0.5, 'bandpass', 1200, 0.15);
      return 1.6;
    },
  };

  function playClue(a, name) {
    if (!a || !CLUES[name]) return 0;
    return CLUES[name](a, a.currentTime + 0.1);
  }

  window.CaseArt = { avatar, svg, evidenceCard, suspectCard, playClue };
})();
