// Generative backdrops (decorative, aria-hidden): log rain and a data tunnel.
// Both read the chapter's --progress, cap DPR at 2, pause off-screen and in
// hidden tabs, and draw a single static frame under reduced motion.

// Synthetic lines shaped like Internlog's detector output. Never real data.
// Fixed-width columns, so every line is exactly the same length. Reasons are short codes:
// dup = near-duplicate, templ = templated phrasing, thin = thin text, link = links (legend in the corner HUD).
function logLine(n) {
  const id = String(400 + (n * 37) % 600).padStart(4, '0');
  const ttr = ((n * 53) % 90 + 10) / 100;
  const dup = ((n * 29) % 96) / 100;
  const rating = (n * 7) % 10 + 1;
  const score = Math.min(100, Math.round((1 - ttr) * 40 + dup * 50 + (rating === 1 || rating === 10 ? 15 : 0)));
  const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MED ' : 'LOW ';
  const codes = [];
  if (dup >= .5) codes.push('dup');
  if (ttr < .4) codes.push('thin');
  if (n % 5 === 0) codes.push('templ');
  if (n % 11 === 0) codes.push('link');
  const why = (codes.slice(0, 2).join(',') || 'ok').padEnd(10, ' ');
  const fmt2 = (x) => x.toFixed(2).slice(1);
  return `#${id}  ttr ${fmt2(ttr)}  dup ${fmt2(dup)}  r${String(rating).padStart(2, ' ')}  s${String(score).padStart(3, ' ')}  ${level}  ${why}`;
}

// A small deterministic hash, so a "fire" is a pure function of time: the same on every frame and in the static frame.
function hash(n) {
  n = Math.imul(n ^ (n >>> 15), 2246822519); n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

const FIRE_EVERY = 700, FIRE_LIFE = 1300;  // ms: a new row fires about every 0.7s and glows for 1.3s

// Log rain on a fixed grid. Lanes are as wide as the widest line plus a gap; every lane scrolls at the same
// speed with the same line pitch, so two lines can never share a cell. Lines fade out near the header zone,
// the text beside it (Selected Work's index and panel captions) and the HUD labels (never cut), and a few "fire" in cyan, always as a whole row.
function logRain(ctx, w, h, dpr, canvas) {
  const fs = 11 * dpr, lh = 18 * dpr, boxH = 14 * dpr, pad = 24 * dpr, gap = 32 * dpr, fade = 56 * dpr, margin = 32 * dpr;
  ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`;
  let lineW = 0;                                              // measure the widest line we can produce
  for (let n = 0; n < 240; n++) lineW = Math.max(lineW, ctx.measureText(logLine(n)).width);
  const laneW = lineW + gap;
  const count = Math.max(1, Math.min(5, Math.floor((w - 2 * pad) / laneW)));
  const laneX = Array.from({ length: count }, (_, i) => Math.max(8 * dpr, w - pad - (count - i) * laneW + gap / 2));  // right-weighted
  // Keep-out rectangles in canvas pixels. The text, the caption zone and the HUD labels sit in the same stage, so they hold still.
  const rel = (el, m) => { const a = canvas.getBoundingClientRect(), b = el.getBoundingClientRect(); return { l: (b.left - a.left) * dpr - m, t: (b.top - a.top) * dpr - m, r: (b.right - a.left) * dpr + m, b: (b.bottom - a.top) * dpr + m }; };
  const stage = canvas.closest('.stage') || document;
  const blocks = [...stage.querySelectorAll('.about-block, .sw-index, [data-keepout]')].map((el) => rel(el, margin));
  const huds = [...stage.querySelectorAll('.hud')].map((el) => rel(el, 12 * dpr));
  const dist = (x, y, bw, bh, e) => Math.hypot(Math.max(e.l - (x + bw), 0, x - e.r), Math.max(e.t - (y + bh), 0, y - e.b));
  let boxes = [];
  canvas.logLines = () => boxes;                               // CSS px boxes of what was drawn last frame (tests read this)
  canvas.dataset.lanes = String(count);

  return (t, progress, light) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${fs}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    boxes = [];
    canvas.logDrawnAt = scrollY;                                 // tests only compare frames drawn at the current scroll
    const S = t / 1000 * 22 * dpr + progress * 600 * dpr;       // one scroll position for every lane
    const header = { l: 0, t: -1e6, r: w, b: 96 * dpr - canvas.getBoundingClientRect().top * dpr };  // the top 96px of the viewport
    const first = Math.floor(S / lh) - 1, last = Math.ceil((S + h) / lh) + 1;
    const slot = Math.floor(t / FIRE_EVERY);
    const fires = [];                                           // lines currently glowing: { lane, n, env }
    for (let s = slot - 2; s <= slot; s++) {
      const age = t - s * FIRE_EVERY - hash(s * 7 + 3) * FIRE_EVERY;
      if (age < 0 || age > FIRE_LIFE) continue;
      const lane = Math.floor(hash(s * 13 + 1) * count);
      const startS = (s * FIRE_EVERY / 1000) * 22 * dpr + progress * 600 * dpr;
      const n = Math.floor(startS / lh) + 2 + Math.floor(hash(s * 17 + 5) * Math.max(1, Math.floor(h / lh) - 4));
      fires.push({ lane, n, env: age < 120 ? age / 120 : Math.exp(-(age - 120) / 520) });
    }
    for (let c = 0; c < count; c++) {
      const x = laneX[c];
      for (let n = first; n <= last; n++) {
        const y = n * lh - S;
        if (y < -lh || y > h) continue;
        const d = Math.min(dist(x, y, lineW, boxH, header), ...blocks.map((e) => dist(x, y, lineW, boxH, e)), ...huds.map((e) => dist(x, y, lineW, boxH, e)));
        const zone = Math.max(0, Math.min(1, d / fade));        // 0 against a keep-out rectangle, 1 once clear of it
        if (zone <= .02) continue;
        const text = logLine(n + c * 1000);
        const hot = text.includes('HIGH');
        const fire = fires.find((f) => f.lane === c && f.n === n);
        const a = Math.max(hot ? .3 : .16, fire ? .15 + .8 * fire.env : 0) * zone;
        const cyan = hot || fire;
        ctx.fillStyle = light ? (cyan ? `rgba(0,106,135,${a})` : `rgba(0,0,0,${a * 1.1})`) : (cyan ? `rgba(143,227,255,${a})` : `rgba(200,215,230,${a})`);
        ctx.fillText(text, x, y);
        boxes.push({ x: x / dpr, y: y / dpr, w: lineW / dpr, h: boxH / dpr, a });
      }
    }
  };
}

function tunnel(ctx, w, h, dpr, warm) {
  const N = 900;
  const pts = Array.from({ length: N }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
  let last = 0;
  return (t, progress, light) => {
    const dt = Math.min(50, t - last || 16); last = t;
    const speed = .00012 + progress * .00045;
    ctx.fillStyle = light ? 'rgba(236,235,231,.35)' : 'rgba(5,5,5,.35)';
    ctx.fillRect(0, 0, w, h);
    const [r, g, b] = light ? [80, 40, 20] : warm ? [255, 140, 90] : [150, 210, 255];
    for (const p of pts) {
      p.z -= speed * dt;
      if (p.z <= .02) { p.z = 1; p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; }
      const sx = w / 2 + (p.x / p.z) * w * .25;
      const sy = h / 2 + (p.y / p.z) * h * .25;
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      const s = Math.max(1, (1 - p.z) * 3.2 * dpr);
      ctx.fillStyle = `rgba(${r},${g},${b},${(1 - p.z) * .55})`;
      ctx.fillRect(sx, sy, s, s);
    }
  };
}

export function initScenes({ reduced = false } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const canvas of document.querySelectorAll('canvas[data-scene]')) {
    const ctx = canvas.getContext('2d');
    const chapter = canvas.closest('.chapter') || document.documentElement;
    let draw, raf = 0, visible = false;
    const build = () => {
      const r = canvas.getBoundingClientRect();
      const w = canvas.width = Math.max(1, Math.round(r.width * dpr));
      const h = canvas.height = Math.max(1, Math.round(r.height * dpr));
      draw = canvas.dataset.scene === 'tunnel' ? tunnel(ctx, w, h, dpr, canvas.dataset.tint === 'warm') : logRain(ctx, w, h, dpr, canvas);
    };
    const frame = (t) => {
      const light = document.documentElement.dataset.theme === 'light';
      draw(t, parseFloat(chapter.style.getPropertyValue('--progress')) || 0, light);
      if (visible && !reduced && !document.hidden) raf = requestAnimationFrame(frame);
    };
    build();
    frame(reduced ? 4000 : performance.now());
    new ResizeObserver(() => { build(); frame(reduced ? 4000 : performance.now()); }).observe(canvas);
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { build(); frame(reduced ? 4000 : performance.now()); });  // text boxes move when the fonts land
    if (reduced) continue;
    // Several entries can queue before the first callback (e.g. a jump scroll right after load): the last one is current.
    // A canvas that only touches the viewport edge (Selected Work's sits exactly at the bottom of the hero) counts as
    // "intersecting" with zero area; it must not run until a pixel of it shows (Round 5 B4: it ran behind the hero).
    new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      visible = e.isIntersecting && e.intersectionRatio > 0;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(frame);
    }, { threshold: [0, 0.001] }).observe(canvas);
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(raf);
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
    });
  }
}
