// Small WebGL2 toolkit for the About scenes: programs that compile in the background
// (KHR_parallel_shader_compile, so linking never blocks a frame), instanced geometry, render targets and the
// handful of mat4 helpers the cameras need. Hand-written; no libraries.

export const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
export const NOISE = `
float hash11(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;

export class Program {
  constructor(gl, vs, fs, ext) {
    this.gl = gl; this.ext = ext;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, HEAD + src); gl.compileShader(s); return s; };
    this.vs = sh(gl.VERTEX_SHADER, vs); this.fs = sh(gl.FRAGMENT_SHADER, fs);
    this.p = gl.createProgram();
    gl.attachShader(this.p, this.vs); gl.attachShader(this.p, this.fs);
    gl.linkProgram(this.p);
    this.u = new Map(); this.ok = false;
  }
  /** Non-blocking where the extension exists; otherwise true (the first status read then waits). */
  get done() { return this.ok || !this.ext || this.gl.getProgramParameter(this.p, this.ext.COMPLETION_STATUS_KHR); }
  finish() {
    if (this.ok) return this;
    const gl = this.gl;
    if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) {
      throw new Error(`GL link failed: ${gl.getProgramInfoLog(this.p)} ${gl.getShaderInfoLog(this.vs)} ${gl.getShaderInfoLog(this.fs)}`);
    }
    this.ok = true;
    return this;
  }
  use() { this.gl.useProgram(this.p); return this; }
  loc(name) { if (!this.u.has(name)) this.u.set(name, this.gl.getUniformLocation(this.p, name)); return this.u.get(name); }
  f(name, ...v) { const l = this.loc(name); if (l) this.gl[`uniform${v.length}f`](l, ...v); return this; }
  i(name, v) { const l = this.loc(name); if (l) this.gl.uniform1i(l, v); return this; }
  m4(name, m) { const l = this.loc(name); if (l) this.gl.uniformMatrix4fv(l, false, m); return this; }
  v3(name, a) { const l = this.loc(name); if (l) this.gl.uniform3fv(l, a); return this; }
  dispose() { const gl = this.gl; gl.deleteProgram(this.p); gl.deleteShader(this.vs); gl.deleteShader(this.fs); }
}

// ── Geometry (interleaved position + normal, 6 floats per vertex) ─────────────────────────────────────────
export function boxMesh() {
  const F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const out = [];
  for (const n of F) {
    const [a, b] = n[0] ? [[0, 1, 0], [0, 0, 1]] : n[1] ? [[0, 0, 1], [1, 0, 0]] : [[1, 0, 0], [0, 1, 0]];
    const c = n.map((v) => v * 0.5);
    const corner = (s, t) => [0, 1, 2].map((k) => c[k] + (a[k] * s + b[k] * t) * 0.5);
    const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const flip = n[0] + n[1] + n[2] < 0;                     // keep counter-clockwise winding outward
    const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) out.push(...q[k], ...n);
  }
  return new Float32Array(out);
}

export function cylinderMesh(seg = 16) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (a, y) => [Math.cos(a) * 0.5, y, Math.sin(a) * 0.5];
    const n = (a) => [Math.cos(a), 0, Math.sin(a)];
    out.push(...p(a0, -0.5), ...n(a0), ...p(a1, 0.5), ...n(a1), ...p(a1, -0.5), ...n(a1));
    out.push(...p(a0, -0.5), ...n(a0), ...p(a0, 0.5), ...n(a0), ...p(a1, 0.5), ...n(a1));
    out.push(0, 0.5, 0, 0, 1, 0, ...p(a1, 0.5), 0, 1, 0, ...p(a0, 0.5), 0, 1, 0);
  }
  return new Float32Array(out);
}

// A surface of revolution around +Y from a [radius, y] profile, plus a material id per vertex (7 floats).
export function latheMesh(profile, seg, mat) {
  const out = [];
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    const dy = y1 - y0, dr = r1 - r0, len = Math.hypot(dy, dr) || 1;
    const ny = -dr / len, nr = dy / len;                      // outward normal in the profile plane
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const v = (r, y, a) => [Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * nr, ny, Math.sin(a) * nr, mat(j, y)];
      out.push(...v(r0, y0, a0), ...v(r1, y1, a1), ...v(r1, y1, a0));
      out.push(...v(r0, y0, a0), ...v(r0, y0, a1), ...v(r1, y1, a1));
    }
  }
  return out;
}

export function vao(gl, { mesh, stride = 6, extra = [], instances = null, layout = [] }) {
  const va = gl.createVertexArray();
  gl.bindVertexArray(va);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
  if (stride >= 6) { gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 12); }
  for (const [loc, size, off] of extra) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); }
  let ib = null;
  const per = layout.reduce((n, [, size]) => n + size, 0);
  if (instances) {
    ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STATIC_DRAW);
    let off = 0;
    for (const [loc, size] of layout) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, per * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
      off += size;
    }
  }
  gl.bindVertexArray(null);
  return { va, vb, ib, count: mesh.length / stride, n: instances ? instances.length / per : 0,
    dispose() { gl.deleteVertexArray(va); gl.deleteBuffer(vb); if (ib) gl.deleteBuffer(ib); } };
}

// ── Render targets ───────────────────────────────────────────────────────────────────────────────────────
export function target(gl, w, h, { depth = false, linear = true } = {}) {
  const t = { fb: gl.createFramebuffer(), tex: gl.createTexture(), rb: depth ? gl.createRenderbuffer() : null, w: 0, h: 0 };
  t.resize = (W, H) => {
    W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
    if (W === t.w && H === t.h) return;
    t.w = W; t.h = H;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (t.rb) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.rb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };
  t.bind = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); };
  t.dispose = () => { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); if (t.rb) gl.deleteRenderbuffer(t.rb); };
  t.resize(w, h);
  return t;
}

// ── mat4 (column-major Float32Array(16)) ──────────────────────────────────────────────────────────────────
export function perspective(fovDeg, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360), nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  return out;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v3 = { sub, cross, norm, dot };

/** View matrix looking from eye along dir, with `up` rolled by `roll` radians around dir. Returns {view, right, up, fwd}. */
export function lookDir(eye, dir, up = [0, 1, 0], roll = 0, out = new Float32Array(16)) {
  const f = norm(dir);
  let r = norm(cross(f, up));
  let u = cross(r, f);
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
    r = r2;
  }
  out[0] = r[0]; out[4] = r[1]; out[8] = r[2]; out[12] = -dot(r, eye);
  out[1] = u[0]; out[5] = u[1]; out[9] = u[2]; out[13] = -dot(u, eye);
  out[2] = -f[0]; out[6] = -f[1]; out[10] = -f[2]; out[14] = dot(f, eye);
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return { view: out, right: r, up: u, fwd: f };
}

export function mul(a, b, out = new Float32Array(16)) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}

/** A camera bundle: projection × view, plus the basis for full-screen ray shaders. */
export function camera(eye, dir, { fov = 55, aspect = 16 / 9, near = 0.1, far = 400, up = [0, 1, 0], roll = 0 } = {}) {
  const proj = perspective(fov, aspect, near, far);
  const v = lookDir(eye, dir, up, roll);
  return { vp: mul(proj, v.view), eye, right: v.right, up: v.up, fwd: v.fwd, tanHalf: Math.tan((fov * Math.PI) / 360), aspect };
}

// A seeded random source, so every visit builds the same city.
export function rng(seed = 1) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
