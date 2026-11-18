// Particle trail: a reusable engine that peels particles off a picture and carries them along the pointer's
// path as a swirling ribbon, then lets them flow home over ~1.2s. The host owns the canvas and the frame loop
// and provides rest positions (device px); the engine keeps the physics and draws only the *active* particles
// on top of the host's cached picture: a hole where each one left, the particle itself as an oriented quad,
// a chromatic split along its velocity, one cheap glow copy, and a rare full-width glitch streak.
// Used by the hero head (ice palette). Any palette with the same shape works (stops, fringe, streak).

export const ICE = {
  stops: [[0, '#0a2a3a'], [0.25, '#1ea7ff'], [0.45, '#00e5ff'], [0.62, '#3dffc4'], [0.8, '#ffc857'], [0.9, '#ff9f43'], [1, '#ffffff']],
  fringe: ['#ff3df2', '#7a5cff'],                 // faint outer RGB-split passes only
  streak: 'rgba(190,240,255,',
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// 256-entry LUT; the engine samples it into a few CSS colours so each colour bucket is one batched fill.
export function buildLut(stops, n = 256) {
  const out = new Uint8ClampedArray(n * 3);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0 || 1)));
    const a = hex(c0), b = hex(c1);
    for (let j = 0; j < 3; j++) out[i * 3 + j] = a[j] + (b[j] - a[j]) * f;
  }
  return out;
}

const BUCKETS = 24;
const ALPHAS = [0.35, 0.7, 1];
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class TrailEngine {
  // count: particles; rest: Float32Array(count*3) of x, y, size scale (device px; NaN x = hidden);
  // cell: particle size (device px); width: picture width (device px), which sets the pointer radius.
  constructor({ count, rest, cell, dpr = 1, palette = ICE, width = 600, stiffness = 42 }) {
    this.n = count; this.rest = rest; this.cell = cell; this.dpr = dpr; this.width = width;
    this.dx = new Float32Array(count); this.dy = new Float32Array(count);
    this.vx = new Float32Array(count); this.vy = new Float32Array(count);
    this.k = new Float32Array(count);
    this.on = new Uint8Array(count);                         // 1 = active (displaced or moving)
    this.list = [];                                         // active indices
    for (let i = 0; i < count; i++) this.k[i] = stiffness * (0.8 + 0.4 * Math.random());   // ±20% stiffness
    const lut = buildLut(palette.stops);
    this.colors = Array.from({ length: BUCKETS }, (_, b) => { const i = Math.round((b / (BUCKETS - 1)) * 255) * 3; return `rgb(${lut[i]},${lut[i + 1]},${lut[i + 2]})`; });
    this.palette = palette;
    this.zones = [];                                        // [{l,t,r,b}] device px: no particle is drawn inside (+ margin)
    this.margin = 24 * dpr;
    this.bounds = null;                                     // {l,t,r,b}: displacement clamp and drawing region
    this.skipOdd = false;                                   // perf guard: half density
    this.glow = true;
    this.streak = null; this.lastStreak = -1e9;
    this.acc = 0;
    this.drawn = [];                                        // last frame's drawn particle centres (device px), for tests
    this.groups = Array.from({ length: BUCKETS * ALPHAS.length }, () => []);
    this.act = null; this.small = null;
  }

  setZones(z) { this.zones = z; }
  setBounds(b) { this.bounds = b; }

  // Pointer impulse: position in device px, velocity in device px/s. Push along the motion plus a swirl around it.
  impulse(px, py, pvx, pvy, dt = 1 / 60) {
    const speed = Math.hypot(pvx, pvy);
    if (speed < 20 * this.dpr) return;
    const R = this.width * (speed > 2200 * this.dpr ? 0.18 : 0.14);
    const R2 = R * R, scale = Math.min(1.5, dt * 60);
    const kPush = 0.34, kSwirl = 0.3, rest = this.rest;
    for (let i = 0; i < this.n; i++) {
      if (this.skipOdd && i & 1) continue;
      const rx = rest[i * 3];
      if (rx !== rx) continue;                                // NaN: hidden (turned away)
      const x = rx + this.dx[i], y = rest[i * 3 + 1] + this.dy[i];
      const ox = x - px, oy = y - py, d2 = ox * ox + oy * oy;
      if (d2 > R2) continue;
      const d = Math.sqrt(d2) || 1, fall = smooth(1 - d / R) * scale;
      this.vx[i] += (kPush * pvx + kSwirl * (-oy / d) * speed) * fall;
      this.vy[i] += (kPush * pvy + kSwirl * (ox / d) * speed) * fall;
      if (!this.on[i]) { this.on[i] = 1; this.list.push(i); }
    }
    const now = performance.now();
    if (speed > 2600 * this.dpr && now - this.lastStreak > 400) {   // a thin glitch streak, at most every 400ms
      this.lastStreak = now;
      this.streak = { y: py, t0: now, dur: 80 + Math.random() * 60, h: (1 + Math.random() * 2) * this.dpr,
        slices: Array.from({ length: 3 }, () => ({ y: py + (Math.random() - 0.5) * 140 * this.dpr, h: (6 + Math.random() * 18) * this.dpr, dx: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 22) * this.dpr })) };
    }
  }

  // Fixed-timestep damped spring back to rest (frame-rate independent).
  step(dt) {
    this.acc = Math.min(this.acc + dt, 0.1);
    const h = 1 / 120, damp = Math.sqrt(0.88);              // 0.88 per 60 fps frame
    while (this.acc >= h) {
      this.acc -= h;
      const keep = [];
      for (const i of this.list) {
        let dx = this.dx[i], dy = this.dy[i];
        let vx = (this.vx[i] - this.k[i] * dx * h) * damp, vy = (this.vy[i] - this.k[i] * dy * h) * damp;
        dx += vx * h; dy += vy * h;
        const b = this.bounds;
        if (b) {
          const x = this.rest[i * 3] + dx, y = this.rest[i * 3 + 1] + dy;
          if (x < b.l) { dx += b.l - x; vx = 0; } else if (x > b.r) { dx -= x - b.r; vx = 0; }
          if (y < b.t) { dy += b.t - y; vy = 0; } else if (y > b.b) { dy -= y - b.b; vy = 0; }
        }
        if (Math.abs(dx) + Math.abs(dy) < 0.08 && Math.abs(vx) + Math.abs(vy) < 1) { dx = dy = vx = vy = 0; this.on[i] = 0; }
        else keep.push(i);
        this.dx[i] = dx; this.dy[i] = dy; this.vx[i] = vx; this.vy[i] = vy;
      }
      this.list = keep;
    }
  }

  get active() { return this.list.length; }
  maxDisplacement() { let m = 0; for (let i = 0; i < this.n; i++) m = Math.max(m, Math.hypot(this.dx[i], this.dy[i])); return m; }
  reset() { this.dx.fill(0); this.dy.fill(0); this.vx.fill(0); this.vy.fill(0); this.on.fill(0); this.list = []; }

  zoneAlpha(x, y) {                                          // 0 inside a text zone grown by the margin (square corners), fading in over one more margin
    let a = 1;
    for (const z of this.zones) {
      const ddx = Math.max(z.l - x, 0, x - z.r), ddy = Math.max(z.t - y, 0, y - z.b), d = Math.max(ddx, ddy);
      if (d <= this.margin) return 0;
      a = Math.min(a, (d - this.margin) / this.margin);
    }
    return a;
  }

  // Draw on the host's context, over its cached picture. bg fills the holes the particles leave.
  render(ctx, { bg = '#050505' } = {}) {
    const { rest, cell, list } = this;
    this.drawn = [];
    if (list.length) {
      // 1. holes where particles left the surface
      ctx.fillStyle = bg;
      for (const i of list) {
        const d = Math.hypot(this.dx[i], this.dy[i]);
        if (d < cell * 0.5) continue;
        ctx.globalAlpha = Math.min(0.82, d / (cell * 3));     // a hole, but the face still reads through it
        const s = cell * rest[i * 3 + 2] + 1;
        ctx.fillRect(rest[i * 3] - s / 2, rest[i * 3 + 1] - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      // 2. the active layer, limited to the bounds: bucket every particle by colour and alpha, one fill per bucket
      const W = ctx.canvas.width, H = ctx.canvas.height, B = this.bounds;
      const ox = B ? Math.max(0, Math.floor(B.l)) : 0, oy = B ? Math.max(0, Math.floor(B.t)) : 0;
      const aw = Math.max(1, (B ? Math.min(W, Math.ceil(B.r)) : W) - ox), ah = Math.max(1, (B ? Math.min(H, Math.ceil(B.b)) : H) - oy);
      if (!this.act || this.act.width !== aw || this.act.height !== ah) { this.act = new OffscreenCanvas(aw, ah); this.small = new OffscreenCanvas(Math.max(1, aw >> 2), Math.max(1, ah >> 2)); }
      const g = this.act.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, aw, ah);
      g.setTransform(1, 0, 0, 1, -ox, -oy);
      for (const grp of this.groups) grp.length = 0;
      const LA = -2.3;                                       // light comes from the upper left
      for (const i of list) {
        const x = rest[i * 3] + this.dx[i], y = rest[i * 3 + 1] + this.dy[i];
        if (x !== x) continue;                                // its voxel turned away mid-flight
        const za = this.zoneAlpha(x, y);
        if (za <= 0.02) continue;
        const sp = Math.hypot(this.vx[i], this.vy[i]) / (60 * this.dpr);       // CSS px per 60 fps frame
        const ang = sp > 0.05 ? Math.atan2(this.vy[i], this.vx[i]) : Math.atan2(this.dy[i], this.dx[i]);
        const tilt = Math.min(1, sp / 9);
        const lift = Math.min(1, Math.hypot(this.dx[i], this.dy[i]) / (cell * 8));
        const spec = Math.pow(Math.max(0, Math.cos(ang - LA)), 8) * (0.4 + 0.6 * tilt);   // pow(max(0, n·l), 8)
        let t = 0.3 + 0.32 * Math.min(1, sp / 12) + 0.38 * spec + 0.1 * lift;
        t += 0.06 * Math.sin(ang * 2);                       // thin-film shimmer as the ribbon turns
        const b = Math.max(0, Math.min(BUCKETS - 1, Math.round(Math.min(1, t) * (BUCKETS - 1))));
        const a = za >= 0.9 ? 2 : za >= 0.5 ? 1 : 0;
        this.groups[b * ALPHAS.length + a].push(i, x, y, ang, tilt, sp);
        this.drawn.push(x, y);
      }
      const quad = (path, x, y, ang, tilt, off) => {
        const L = cell * (0.55 + 0.9 * tilt) * 0.5, Wd = cell * (0.5 - 0.18 * tilt) * 0.5;
        const c = Math.cos(ang), s = Math.sin(ang), qx = x + c * off, qy = y + s * off;
        path.moveTo(qx + c * L - s * Wd, qy + s * L + c * Wd);
        path.lineTo(qx - c * L - s * Wd, qy - s * L + c * Wd);
        path.lineTo(qx - c * L + s * Wd, qy - s * L - c * Wd);
        path.lineTo(qx + c * L + s * Wd, qy + s * L - c * Wd);
        path.closePath();
      };
      // outer RGB-split fringes: +δ and −δ along the velocity, δ = clamp(speed·0.35, 0, 3.5) px, faint, additive
      g.globalCompositeOperation = 'lighter';
      for (const [sign, color] of [[1, this.palette.fringe[0]], [-1, this.palette.fringe[1]]]) {
        const p = new Path2D();
        let any = false;
        for (const grp of this.groups) for (let k = 0; k < grp.length; k += 6) {
          const delta = Math.min(3.5, grp[k + 5] * 0.35) * this.dpr * sign;
          if (Math.abs(delta) > 0.4) { quad(p, grp[k + 1], grp[k + 2], grp[k + 3], grp[k + 4], delta); any = true; }
        }
        if (any) { g.globalAlpha = 0.2; g.fillStyle = color; g.fill(p); }
      }
      g.globalCompositeOperation = 'source-over';
      this.groups.forEach((grp, gi) => {
        if (!grp.length) return;
        const p = new Path2D();
        for (let k = 0; k < grp.length; k += 6) quad(p, grp[k + 1], grp[k + 2], grp[k + 3], grp[k + 4], 0);
        g.globalAlpha = ALPHAS[gi % ALPHAS.length];
        g.fillStyle = this.colors[Math.floor(gi / ALPHAS.length)];
        g.fill(p);
      });
      g.globalAlpha = 1;
      ctx.drawImage(this.act, ox, oy);
      if (this.glow) {                                     // one low-res blurred copy, additive at 0.35
        const sg = this.small.getContext('2d');
        sg.clearRect(0, 0, this.small.width, this.small.height);
        sg.drawImage(this.act, 0, 0, this.small.width, this.small.height);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.small, ox, oy, aw, ah);
        ctx.restore();
      }
    }
    // 3. glitch streak: three displaced slices and a hairline, ~100ms
    const st = this.streak;
    if (st) {
      const age = performance.now() - st.t0;
      if (age > st.dur) this.streak = null;
      else {
        const a = 1 - age / st.dur, W = ctx.canvas.width;
        for (const sl of st.slices) ctx.drawImage(ctx.canvas, 0, sl.y, W, sl.h, sl.dx, sl.y, W, sl.h);
        ctx.fillStyle = `${this.palette.streak}${(0.55 * a).toFixed(3)})`;
        ctx.fillRect(0, st.y, W, st.h);
      }
    }
  }
}
