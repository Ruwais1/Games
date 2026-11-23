// Finger drawing pad (phones) and drawing playback (big screen) for "Wesh Rasamt?".
// A drawing is a list of strokes: { c: color, w: width as a share of the canvas, p: [[x, y], ...] }
// with x and y between 0 and 1, so it looks the same on any screen size.
(function () {
  const COLORS = ['#1C1C24', '#D7263D', '#2F7DD1', '#2E9E5B', '#F2B33D', '#8C6A43', '#F6E7C8'];
  const SIZES = [0.012, 0.03];
  const PAPER = '#F6E7C8';
  const MAX_POINTS = 8000;

  function fitCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function strokePath(ctx, s, w, h, upTo) {
    const pts = s.p.slice(0, upTo);
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.w * w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
    if (pts.length === 1) ctx.lineTo(pts[0][0] * w + 0.1, pts[0][1] * h + 0.1);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
    ctx.stroke();
  }

  // Paint the drawing, optionally only its first `limit` points (for the replay)
  function paint(canvas, strokes, limit = Infinity) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let left = limit;
    for (const s of strokes || []) {
      if (left <= 0) break;
      strokePath(ctx, s, w, h, Math.max(1, Math.min(s.p.length, left)));
      left -= s.p.length;
    }
  }

  // Show a finished drawing; with animate, replay it line by line
  function show(canvas, strokes, animate = false, secs = 3.5) {
    fitCanvas(canvas);
    const total = (strokes || []).reduce((n, s) => n + s.p.length, 0);
    const token = {};
    canvas._replay = token;
    if (!animate || !total) return paint(canvas, strokes);
    const start = performance.now();
    const frame = (t) => {
      if (canvas._replay !== token) return;
      const k = Math.min(1, (t - start) / (secs * 1000));
      paint(canvas, strokes, Math.ceil(total * k));
      if (k < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // A drawing pad on a canvas. Only new line segments are painted while drawing,
  // so it stays smooth on phones even with long drawings.
  function pad(canvas, onChange) {
    let strokes = [];
    let current = null;
    let points = 0;
    let color = COLORS[0];
    let size = SIZES[0];
    let locked = false;
    const ctx = canvas.getContext('2d');

    const redraw = () => {
      fitCanvas(canvas);
      paint(canvas, strokes);
    };
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
    };
    const segment = (a, b, s) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.strokeStyle = s.c;
      ctx.lineWidth = s.w * w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a[0] * w, a[1] * h);
      ctx.lineTo(b[0] * w + (a === b ? 0.1 : 0), b[1] * h);
      ctx.stroke();
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (locked || points >= MAX_POINTS) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      current = { c: color, w: size, p: [p] };
      strokes.push(current);
      points++;
      segment(p, p, current);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current || points >= MAX_POINTS) return;
      const p = pos(e);
      const last = current.p[current.p.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.004) return;
      current.p.push(p);
      points++;
      segment(last, p, current);
    });
    const end = () => {
      if (current && onChange) onChange();
      current = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    window.addEventListener('resize', redraw);

    return {
      get strokes() { return strokes; },
      reset() {
        strokes = [];
        points = 0;
        locked = false;
        redraw();
      },
      undo() {
        const s = strokes.pop();
        if (s) points -= s.p.length;
        redraw();
        if (onChange) onChange();
      },
      clear() {
        strokes = [];
        points = 0;
        redraw();
        if (onChange) onChange();
      },
      lock(v) { locked = v; },
      redraw,
      setColor(c) { color = c; },
      setSize(s) { size = s; },
    };
  }

  window.Sketch = { COLORS, SIZES, show, pad };
})();
