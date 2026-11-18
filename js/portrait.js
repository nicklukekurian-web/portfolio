// Hero signal: a grinning mask built from voxels over a bulging, subdivided grid.
// The mask is an original vector given a depth map (dome, nose, cheeks, mustache),
// so it can turn in 3D to look at the cursor; lighting is recomputed as it turns.
// A scan line brightens what it passes and tear bands glitch the signal.
// Decorative only: the canvas is aria-hidden and every word on the page is DOM text.
// The pointer peels voxels off as an ice-coloured particle trail (js/fx/particle-trail.js); they flow home.
import { TrailEngine as Trail, ICE } from './fx/particle-trail.js';
import { DEV } from './core/env.js';
import { exp } from './core/experiments.js';

const VOXEL = 6;         // CSS px per voxel cell (4 on narrow screens)
const BUCKETS = 10;
const LIGHT = (() => { const v = [-.55, -.45, .7]; const m = Math.hypot(...v); return v.map((c) => c / m); })();

// ── The mask, in a 630×630 design space: white face, black features.
function drawMask(g) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 630, 630);
  const mirror = (fn) => { fn(); g.save(); g.translate(630, 0); g.scale(-1, 1); fn(); g.restore(); };
  g.fillStyle = '#fff';
  mirror(() => g.fillRect(118, 162, 34, 66));                         // ear tabs
  g.beginPath();                                                     // face
  g.moveTo(315, 52);
  g.bezierCurveTo(420, 52, 482, 108, 484, 200);
  g.bezierCurveTo(486, 262, 502, 300, 494, 362);
  g.bezierCurveTo(486, 444, 458, 522, 398, 580);
  g.bezierCurveTo(368, 606, 340, 614, 315, 614);
  g.bezierCurveTo(290, 614, 262, 606, 232, 580);
  g.bezierCurveTo(172, 522, 144, 444, 136, 362);
  g.bezierCurveTo(128, 300, 144, 262, 146, 200);
  g.bezierCurveTo(148, 108, 210, 52, 315, 52);
  g.fill();
  g.strokeStyle = '#000';
  g.fillStyle = '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  mirror(() => {
    g.lineWidth = 6;                                                 // ear grooves
    for (const y of [178, 195, 212]) { g.beginPath(); g.moveTo(124, y); g.lineTo(146, y + 4); g.stroke(); }
    g.lineWidth = 20;                                                // brow
    g.beginPath(); g.moveTo(182, 222); g.bezierCurveTo(206, 188, 250, 180, 298, 214); g.stroke();
    g.lineWidth = 15;                                                // closed, smiling eye
    g.beginPath(); g.moveTo(212, 272); g.bezierCurveTo(232, 244, 266, 242, 290, 266); g.stroke();
    g.lineWidth = 8;                                                 // cheek fold
    g.beginPath(); g.moveTo(198, 296); g.bezierCurveTo(222, 306, 248, 304, 266, 294); g.stroke();
    g.lineWidth = 7;                                                 // side of the nose
    g.beginPath(); g.moveTo(298, 236); g.bezierCurveTo(294, 262, 288, 282, 282, 300);
    g.bezierCurveTo(274, 314, 280, 330, 298, 334); g.stroke();
  });
  g.beginPath();                                                     // mustache
  g.moveTo(315, 346);
  g.bezierCurveTo(290, 320, 250, 304, 204, 318);
  g.bezierCurveTo(172, 328, 152, 348, 158, 376);
  g.bezierCurveTo(164, 396, 186, 404, 202, 398);
  g.bezierCurveTo(232, 408, 262, 400, 286, 387);
  g.bezierCurveTo(300, 381, 310, 386, 315, 394);
  g.bezierCurveTo(320, 386, 330, 381, 344, 387);
  g.bezierCurveTo(368, 400, 398, 408, 428, 398);
  g.bezierCurveTo(444, 404, 466, 396, 472, 376);
  g.bezierCurveTo(478, 348, 458, 328, 426, 318);
  g.bezierCurveTo(380, 304, 340, 320, 315, 346);
  g.fill();
  g.beginPath();                                                     // grin
  g.moveTo(242, 424);
  g.bezierCurveTo(280, 414, 350, 414, 388, 424);
  g.bezierCurveTo(372, 460, 346, 476, 315, 476);
  g.bezierCurveTo(284, 476, 258, 460, 242, 424);
  g.fill();
}

// Depth in 0..~1.4 at a point of the 630 design space: a dome plus raised features.
function depth(x, y) {
  const g = (cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2) / 2);
  const nx = (x - 315) / 190, ny = (y - 330) / 300;
  const dome = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  return Math.max(.12, dome) + .38 * g(315, 300, 26, 48) + .16 * g(315, 362, 120, 30)
    + .1 * (g(240, 330, 45, 45) + g(390, 330, 45, 45)) + .08 * g(315, 214, 140, 20);
}

// ── Voxel field: sample the mask once, keep each lit voxel's 3D position and normal.
function buildVoxels(box, dpr) {
  const cell = (box.voxel || VOXEL) * dpr;
  const n = Math.max(8, Math.round(box.size / cell));
  const sample = new OffscreenCanvas(n, n);
  const s = sample.getContext('2d', { willReadFrequently: true });
  s.scale(n / 630, n / 630);
  drawMask(s);
  const px = s.getImageData(0, 0, n, n).data;
  const R = box.size / 2;                                    // depth scale, device px
  const toDesign = 630 / n;
  const voxels = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (px[(r * n + c) * 4] < 128) continue;                // features and background: no voxel
      const dx = (c + .5) * toDesign, dy = (r + .5) * toDesign;
      const z = depth(dx, dy);
      const e = toDesign;                                     // normal from the depth gradient
      const gx = (depth(dx + e, dy) - depth(dx - e, dy)) / (2 * e) * 630 * .5;
      const gy = (depth(dx, dy + e) - depth(dx, dy - e)) / (2 * e) * 630 * .5;
      const m = Math.hypot(gx, gy, 1);
      voxels.push((c + .5) * cell - R, (r + .5) * cell - R, z * R * .32, -gx / m, -gy / m, 1 / m);
    }
  }
  return { data: Float32Array.from(voxels), cell, R, size: box.size };
}

// Cold blue in the shadows, near-white in the highlights.
function tintFor(l, light) {
  if (light) return `rgb(${Math.round(10 + 20 * (1 - l))},${Math.round(30 + 40 * (1 - l))},${Math.round(50 + 50 * (1 - l))})`;
  return `rgb(${Math.round(70 + 170 * l)},${Math.round(110 + 135 * l)},${Math.round(160 + 95 * l)})`;
}

// Project the voxels for a head turn (yaw, pitch) and paint them. `rest` (optional, 3 floats per voxel)
// receives each voxel's projected centre and scale, NaN when turned away: the particle trail's rest positions.
function paintHead(ctx, field, cx, cy, yaw, pitch, dpr, light, buckets, rest = null) {
  const { data, cell, R: R0 } = field;
  const cy_ = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = R0 * 9;                                           // gentle perspective
  for (const b of buckets) b.length = 0;
  for (let i = 0; i < data.length; i += 6) {
    const u = data[i], v = data[i + 1], z = data[i + 2];
    const x1 = u * cy_ + z * sy, z1 = -u * sy + z * cy_;
    const y2 = v * cp - z1 * sp, z2 = v * sp + z1 * cp;
    const nx = data[i + 3], ny = data[i + 4], nz = data[i + 5];
    const nx1 = nx * cy_ + nz * sy, nz1 = -nx * sy + nz * cy_;
    const ny2 = ny * cp - nz1 * sp, nz2 = ny * sp + nz1 * cp;
    const j = (i / 6) * 3;
    if (nz2 < -.05) { if (rest) rest[j] = NaN; continue; }   // turned away
    const lit = Math.max(0, nx1 * LIGHT[0] + ny2 * LIGHT[1] + nz2 * LIGHT[2]);
    const shade = Math.min(1, .1 + .95 * lit ** 1.3);
    const p = f / (f - z2);
    buckets[Math.min(BUCKETS - 1, Math.floor(shade * BUCKETS))].push(cx + x1 * p, cy + y2 * p, p);
    if (rest) { rest[j] = cx + x1 * p; rest[j + 1] = cy + y2 * p; rest[j + 2] = p; }
  }
  // Every pass batches its squares into one path per bucket: one fill call instead of thousands of fillRects.
  // Occlusion: the head hides the grid behind it.
  ctx.fillStyle = light ? '#ecebe7' : '#050505';
  const occ = new Path2D();
  for (const b of buckets) for (let k = 0; k < b.length; k += 3) occ.rect(b[k] - cell / 2, b[k + 1] - cell / 2, cell * b[k + 2] + 1, cell * b[k + 2] + 1);
  ctx.fill(occ);
  const pass = (from, offX, color, alphaScale) => {
    for (let bi = from; bi < BUCKETS; bi++) {
      const b = buckets[bi];
      if (!b.length) continue;
      const l = (bi + .5) / BUCKETS;
      const path = new Path2D();
      for (let k = 0; k < b.length; k += 3) {
        const size = cell * (.55 + .4 * l) * b[k + 2];
        path.rect(b[k] - size / 2 + offX, b[k + 1] - size / 2, size, size);
      }
      ctx.globalAlpha = (.18 + .82 * l) * alphaScale;
      ctx.fillStyle = color || tintFor(l, light);
      ctx.fill(path);
    }
  };
  if (!light) {                                                 // RGB misregistration
    pass(4, -1.5 * dpr, '#ff2f6a', .28);
    pass(4, 1.5 * dpr, '#3fc8ff', .28);
  }
  pass(0, 0, null, 1);
  ctx.fillStyle = 'rgba(255,255,255,.55)';                      // voxel highlight: bright top edge
  for (let bi = Math.floor(BUCKETS * .55); bi < BUCKETS; bi++) {
    const b = buckets[bi];
    if (!b.length) continue;
    const l = (bi + .5) / BUCKETS;
    const path = new Path2D();
    for (let k = 0; k < b.length; k += 3) {
      const size = cell * (.55 + .4 * l) * b[k + 2];
      path.rect(b[k] - size / 2, b[k + 1] - size / 2, size, Math.max(1, dpr));
    }
    ctx.globalAlpha = l * .8;
    ctx.fill(path);
  }
  ctx.globalAlpha = 1;
}

// ── Grid: barrel-warped so the center swells toward the viewer.
const K = .35;
function barrel(x, y, w, h) {
  const nx = (x / w) * 2 - 1;
  const ny = (y / h) * 2 - 1;
  const f = Math.sqrt(1 + K * (nx * nx + ny * ny));
  return [((nx / f) + 1) * w / 2, ((ny / f) + 1) * h / 2];
}
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function drawGrid(ctx, w, h, dpr, light) {
  const step = Math.round(72 * dpr);
  const rand = rng(7);
  const pad = Math.ceil(Math.max(w, h) * .95 / step) * step;
  const segs = [];
  for (let x = -pad; x <= w + pad; x += step) segs.push([x, -pad, x, h + pad, 1]);
  for (let y = -pad; y <= h + pad; y += step) segs.push([-pad, y, w + pad, y, 1]);
  for (let x = -pad; x < w + pad; x += step) {
    for (let y = -pad; y < h + pad; y += step) {
      const r = rand();
      if (r > .3) continue;
      const n = r < .08 ? 4 : 2;
      for (let i = 1; i < n; i++) {
        segs.push([x + step / n * i, y, x + step / n * i, y + step, .5]);
        segs.push([x, y + step / n * i, x + step, y + step / n * i, .5]);
      }
    }
  }
  const base = light ? '0,0,0' : '205,222,240';
  for (const weight of [1, .5]) {
    ctx.strokeStyle = `rgba(${base},${weight === 1 ? (light ? .22 : .42) : (light ? .12 : .22)})`;
    ctx.lineWidth = Math.max(1, dpr * (weight === 1 ? 1 : .75));
    ctx.beginPath();
    for (const [x1, y1, x2, y2, wgt] of segs) {
      if (wgt !== weight) continue;
      const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (10 * dpr)));
      for (let i = 0; i <= n; i++) {
        const [px, py] = barrel(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, w, h);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }
}

// Text the trail must never cover: the ink of the hero copy, the button row and the fixed header (device px).
const ZONE_TEXT = '.hero-name, .hero-tag, .hero-claim, .hero-sub, .hero-open';
function textZones(canvas, dpr) {
  const c = canvas.getBoundingClientRect();
  const out = [];
  const add = (r) => { if (r.width > 0 && r.height > 0) out.push({ l: (r.left - c.left) * dpr, t: (r.top - c.top) * dpr, r: (r.right - c.left) * dpr, b: (r.bottom - c.top) * dpr }); };
  for (const el of document.querySelectorAll(ZONE_TEXT)) { const range = document.createRange(); range.selectNodeContents(el); add(range.getBoundingClientRect()); }
  for (const el of document.querySelectorAll('.hero-actions, .site-header')) add(el.getBoundingClientRect());
  return out;
}

export async function initPortrait(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const buckets = Array.from({ length: BUCKETS }, () => []);
  let w = 0, h = 0, grid, field, head, live, raf = 0, running = false, tear = null, dirty = true;
  let trail = null, rest = null, glowSmall = null, zonesAt = 0, lastNow = 0, slowFor = 0, fastFor = 0, heavyFor = 0, costEma = 0, sweep = null;
  const hud = DEV && new URLSearchParams(location.search).get('debug') === 'fps' ? (await import('./fx/debug-hud.js')).debugHud() : null;
  const TrailEngine = reduced ? null : Trail;
  const t0 = performance.now();
  let nextTear = t0 + 1800;
  // Look-at: yaw/pitch ease toward the cursor's offset from the head.
  const look = { x: 0, y: 0, tx: 0, ty: 0 };

  function build() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(rect.width * dpr));
    h = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = w; canvas.height = h;
    const light = document.documentElement.dataset.theme === 'light';
    grid = new OffscreenCanvas(w, h);
    drawGrid(grid.getContext('2d'), w, h, dpr, light);
    const narrow = w < 720 * dpr;
    const voxel = narrow ? 4 : VOXEL;
    // The head rests dead center on the viewport's vertical axis at every width. It never slides to dodge
    // text: it is sized to fit the room instead. The mask spans these fractions of `size` around its center
    // (ears give the width, brow to chin the height); SLACK leaves room for the head turn.
    const HALF_W = .3127, TOP = -.417, BOTTOM = .475, SLACK = 1.06;
    const cx = w / 2;
    const stacked = matchMedia('(max-width: 1279px)').matches;
    let y0, y1;
    if (stacked) {                                                // text sits below the canvas: the head gets the whole box
      y0 = 8 * dpr; y1 = h - 8 * dpr;
    } else {                                                      // from under the header to above the button row
      const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0;
      const actionsTop = document.querySelector('.hero-actions')?.getBoundingClientRect().top ?? rect.bottom;
      y0 = Math.max(0, headerBottom - rect.top + 16) * dpr;
      y1 = Math.min(rect.height, actionsTop - rect.top - 24) * dpr;
    }
    let size = Math.min((y1 - y0) / ((BOTTOM - TOP) * SLACK), w * .92 / (2 * HALF_W * SLACK));
    if (!stacked) {                                               // clear the words on either side of the axis
      const gap = 32 * dpr;
      for (const el of document.querySelectorAll('.hero-name, .hero-tag, .hero-claim, .hero-sub, .hero-open')) {
        const range = document.createRange();
        range.selectNodeContents(el);                              // the ink, not the block
        const r = range.getBoundingClientRect();
        if (r.width <= 0) continue;
        const l = (r.left - rect.left) * dpr, rt = (r.right - rect.left) * dpr;
        const room = (rt < cx ? cx - rt : l > cx ? l - cx : Infinity) - gap;
        if (room < Infinity) size = Math.min(size, Math.max(0, room) / (HALF_W * SLACK));
      }
    }
    const cy = (y0 + y1) / 2 - ((TOP + BOTTOM) / 2) * size;      // center the visible head, not the design-space center
    head = { size, voxel, cx, cy };
    field = buildVoxels(head, dpr);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < field.data.length; i += 6) {
      minX = Math.min(minX, field.data[i]); maxX = Math.max(maxX, field.data[i]);
      minY = Math.min(minY, field.data[i + 1]); maxY = Math.max(maxY, field.data[i + 1]);
    }
    const half = field.cell / 2;
    const css = (v) => Math.round(v / dpr);                         // CSS px, for tests
    canvas.dataset.head = [cx, cy, size].map(css).join(',');
    canvas.dataset.box = [cx + minX - half, cy + minY - half, cx + maxX + half, cy + maxY + half].map(css).join(',');  // l,t,r,b at rest
    live = new OffscreenCanvas(w, h);
    glowSmall = new OffscreenCanvas(Math.max(1, w >> 2), Math.max(1, h >> 2));
    if (TrailEngine) {
      // One particle per voxel. Displacement is clamped to the head's box plus 25% on each side.
      const count = field.data.length / 6;
      rest = new Float32Array(count * 3);
      const bw = maxX - minX + field.cell, bh = maxY - minY + field.cell;
      trail = new TrailEngine({ count, rest, cell: field.cell, dpr, palette: ICE, width: bw });
      trail.setBounds({ l: Math.max(0, cx + minX - half - bw * .25), t: Math.max(0, cy + minY - half - bh * .25), r: Math.min(w, cx + maxX + half + bw * .25), b: Math.min(h, cy + maxY + half + bh * .25) });
      trail.setZones(textZones(canvas, dpr)); zonesAt = performance.now();
      canvas.trail = trail;                                        // for tests and the ?debug=fps HUD
      if (exp.tier === 'medium' || exp.tier === 'low') { trail.skipOdd = true; trail.glow = exp.tier === 'medium'; }   // ?exp=tier (dev only)
    }
    dirty = true;
  }

  function renderHead() {
    const h0 = performance.now();
    const g = live.getContext('2d');
    g.clearRect(0, 0, w, h);
    const light = document.documentElement.dataset.theme === 'light';
    paintHead(g, field, head.cx, head.cy, look.x * .42, -look.y * .22, dpr, light, buckets, rest);
    dirty = false;
    canvas.headCost = performance.now() - h0;
  }

  // Feed a pointer sample (client px, ms) to the trail as a velocity impulse.
  let prev = null;
  function pointerImpulse(clientX, clientY, t) {
    if (!trail) return;
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left) * dpr, y = (clientY - r.top) * dpr;
    if (prev && t - prev.t > 0 && t - prev.t < 100) {
      const dt = (t - prev.t) / 1000, cap = 6000 * dpr;
      let vx = (x - prev.x) / dt, vy = (y - prev.y) / dt;
      const s = Math.hypot(vx, vy);
      if (s > cap) { vx *= cap / s; vy *= cap / s; }
      if (performance.now() - zonesAt > 250) { trail.setZones(textZones(canvas, dpr)); zonesAt = performance.now(); }   // copy may still be animating in
      trail.impulse(x, y, vx, vy, dt);
      if (!running && onScreen) start();
    }
    prev = { x, y, t };
  }

  // The one automatic sweep after the preloader: a gentle S across the lower face, left to right.
  function runSweep(now) {
    if (!sweep) return;
    const k = (now - sweep.t0) / sweep.dur;
    if (k > 1) { sweep = null; prev = null; return; }
    const r = canvas.getBoundingClientRect(), span = head.size * .62;
    const x = r.left + (head.cx + (k - .5) * span) / dpr;
    const y = r.top + (head.cy + head.size * (.08 + .06 * Math.sin(k * Math.PI * 2))) / dpr;
    pointerImpulse(x, y, now);
  }

  function drawTear(now) {
    if (!tear && now > nextTear) {
      tear = { start: now, y: (.1 + Math.random() * .75) * h, bh: (8 + Math.random() * 24) * dpr, dx: (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 22) * dpr };
    }
    if (!tear) return;
    if (now - tear.start > 220) { tear = null; nextTear = now + 2600 + Math.random() * 3200; return; }
    const { y, bh, dx } = tear;
    ctx.drawImage(canvas, 0, y, w, bh, dx, y, w, bh);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .35;
    ctx.drawImage(canvas, 0, y, w, bh, dx + 4 * dpr, y + 2 * dpr, w, bh);
    ctx.fillStyle = 'rgba(160,210,255,.08)';
    for (let i = 0; i < 6; i++) ctx.fillRect(0, y + Math.random() * bh, w, dpr);
    ctx.restore();
  }

  function frame(now) {
    const f0 = performance.now();
    const dx = (look.tx - look.x) * .08, dy = (look.ty - look.y) * .08;
    look.x += dx; look.y += dy;
    if (Math.abs(dx) + Math.abs(dy) > .0005) dirty = true;
    if (dirty) renderHead();
    const light = document.documentElement.dataset.theme === 'light';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(grid, -look.x * 6 * dpr, -look.y * 6 * dpr);
    ctx.drawImage(live, 0, 0);
    if (reduced && !light) {                                       // reduced motion: a static ice glow, nothing moves
      const sg = glowSmall.getContext('2d');
      sg.clearRect(0, 0, glowSmall.width, glowSmall.height);
      sg.drawImage(live, 0, 0, glowSmall.width, glowSmall.height);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35;
      ctx.drawImage(glowSmall, 0, 0, w, h);
      ctx.restore();
    }
    if (!reduced) {
      const band = 90 * dpr;
      const y = (((now - t0) / 6500) % 1) * (h + band * 2) - band;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, y, w, band); ctx.clip();
      ctx.globalCompositeOperation = light ? 'multiply' : 'lighter';
      ctx.globalAlpha = .4;
      ctx.drawImage(live, 0, 0);
      ctx.restore();
      ctx.fillStyle = 'rgba(143,227,255,.16)';
      ctx.fillRect(0, y + band - dpr, w, dpr);
      if (trail) {
        const dt = lastNow ? Math.min(.05, (now - lastNow) / 1000) : 1 / 60;
        runSweep(now);
        trail.step(dt);
        trail.render(ctx, { bg: light ? '#ecebe7' : '#050505' });
        // Perf guard: a full second of slow frames while the trail is busy drops half the particles and the glow.
        const ms = lastNow ? now - lastNow : 0;                      // > 100ms is a throttled/background tab, not load
        // (Not during the first 4s: load, font swaps and module compiles stall frames that say nothing about the trail.)
        if (trail.active && ms > 18.5 && ms < 100 && now - t0 > 4000) slowFor += ms / 1000; else slowFor = Math.max(0, slowFor - Math.min(ms, 100) / 2000);
        // Round 5 B6: also watch the trail's own work. Measured at 4× CPU, the full trail costs ~12 ms a frame (p95
        // 19 ms): scattered dropped frames that the interval rule above never adds up to a second of.
        if (trail.active && ms > 0 && ms < 100 && now - t0 > 4000) {
          costEma = costEma * 0.9 + (canvas.frameCost || 0) * 0.1;
          heavyFor = costEma > 10 ? heavyFor + ms / 1000 : Math.max(0, heavyFor - ms / 2000);
        }
        if ((slowFor > 1 || heavyFor > 1) && !trail.skipOdd) { trail.skipOdd = true; trail.glow = false; canvas.dataset.trailDegraded = 'true'; fastFor = 0; heavyFor = 0; }
        // Recovery: three busy seconds of light work (half the particles at under 4 ms ≈ the full trail under 8 ms),
        // on time. The gap between 10 ms and that keeps it from flipping back and forth.
        if (trail.skipOdd && !exp.tier) {
          if (trail.active && ms > 0 && ms < 18.5 && costEma < 4) fastFor += ms / 1000; else if (trail.active && ms < 100) fastFor = 0;
          if (fastFor > 3) { trail.skipOdd = false; trail.glow = true; canvas.dataset.trailDegraded = 'false'; slowFor = 0; fastFor = 0; heavyFor = 0; costEma = 0; }
        }
        hud?.stat('trail', `${trail.active} active${trail.skipOdd ? ' (half)' : ''}`);
      }
      drawTear(now);
    }
    lastNow = now;
    canvas.frameCost = performance.now() - f0;                      // main-thread ms for this frame (tests, HUD)
    hud?.stat('hero frame', `${canvas.frameCost.toFixed(1)}ms`);
    if (running) raf = requestAnimationFrame(frame);
  }

  let onScreen = true;
  function start() { if (!running && !reduced) { running = true; lastNow = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  build();
  frame(performance.now());
  let lastSize = `${canvas.clientWidth}x${canvas.clientHeight}`;
  new ResizeObserver(() => {
    const size = `${canvas.clientWidth}x${canvas.clientHeight}`;
    if (size === lastSize) return;                                 // skip the initial callback and no-op resizes
    lastSize = size; build(); if (!running) frame(performance.now());
  }).observe(canvas);
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { build(); if (!running) frame(performance.now()); });  // name width changes when Doto lands  // name width changes when Doto lands
  document.addEventListener('themechange', () => { build(); if (!running) frame(performance.now()); });

  if (reduced) return; // one static, front-facing frame
  new IntersectionObserver((entries) => { const e = entries[entries.length - 1]; onScreen = e.isIntersecting; onScreen ? start() : stop(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden || !onScreen ? stop() : start()));
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {                               // touch: no look-at, the trail only while the finger is down
      if (e.buttons || e.pressure > 0) pointerImpulse(e.clientX, e.clientY, e.timeStamp);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const hx = rect.left + head.cx / dpr, hy = rect.top + head.cy / dpr;
    look.tx = Math.max(-1, Math.min(1, (e.clientX - hx) / (innerWidth * .45)));
    look.ty = Math.max(-1, Math.min(1, (e.clientY - hy) / (innerHeight * .45)));
    pointerImpulse(e.clientX, e.clientY, e.timeStamp);
  }, { passive: true });
  window.addEventListener('pointerup', () => { prev = null; }, { passive: true });
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { look.tx = 0; look.ty = 0; prev = null; } });  // cursor left the window
  // One automatic sweep once the preloader has gone (Home shows it for ~1.15s), if the visitor hasn't moved yet.
  setTimeout(() => {
    if (prev || !onScreen || scrollY > innerHeight * .5) return;
    sweep = { t0: performance.now(), dur: 700 };
    prev = null;
  }, 1400);
}
