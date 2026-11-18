// The one shared WebGL2 renderer for the About journey: three procedural scenes on one context.
// Per frame: render the active scene (two during a transition) into off-screen targets at an adaptive
// resolution, mix them (parabolic wipe 1→2, dissolve 2→3), extract and blur a half-resolution bloom, then one
// final pass does barrel distortion, edge chromatic aberration, the bottom water-ripple band, vignette, grain
// and the fade to black. Initialisation is spread over idle time and frames (shaders compile in the background).
import { Program, target, NOISE } from './core.js';
import { createAssembly } from './assembly.js';
import { createShaft } from './shaft.js';
import { createRocket } from './rocket.js';

// Timeline in viewport heights (×0.7 on phones): scene 1 300vh, wipe 50vh, scene 2 260vh, dissolve 40vh, scene 3 220vh.
export const T = { s1: [0, 3.5], wipe: [3, 3.5], s2: [3, 6.5], dissolve: [6.1, 6.5], s3: [6.1, 8.7], end: 8.7 };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const span = ([a, b], g) => (g - a) / (b - a);

const QUAD_VS = 'layout(location=0) in vec2 aP; out vec2 vUv; void main(){ vUv = aP * .5 + .5; gl_Position = vec4(aP, 0., 1.); }';

const MIX_FS = `${NOISE}
uniform sampler2D uA, uB; uniform float uT, uTime; uniform int uMode; uniform vec2 uRes;
in vec2 vUv; out vec4 o;
void main(){
  vec2 uv = vUv;
  if (uMode == 1) {                                     // wipe: scene 2 rises from the bottom under a parabolic edge
    float x = uv.x * 2. - 1.;
    float edge = uT * 1.08 - .04 + .03 * (1. - x * x);
    float d = uv.y - edge;
    float band = smoothstep(.04, 0., abs(d));
    float sl = floor(uv.y * uRes.y / 5.);
    float off = (hash11(sl + floor(uTime * 22.)) - .5) * 12. / uRes.x * band;
    vec2 sp = vec2(3. / uRes.x * band, 0.);
    vec2 q = uv + vec2(off, 0.);
    vec3 a = vec3(texture(uA, q - sp).r, texture(uA, q).g, texture(uA, q + sp).b);
    vec3 b = vec3(texture(uB, q + sp).r, texture(uB, q).g, texture(uB, q - sp).b);
    vec3 c = d > 0. ? a : b;
    c += band * band * vec3(.35, .6, .75) * .5;
    o = vec4(c, 1.);
  } else {                                              // dissolve: blocky noise threshold + one upward glitch band
    float n = hash21(floor(uv * uRes / 4.));
    float m = smoothstep(n - .2, n + .2, uT * 1.4 - .2);
    float band = smoothstep(.06, 0., abs(uv.y - uT));
    float off = (hash11(floor(uv.y * uRes.y / 5.) + floor(uTime * 24.)) - .5) * 14. / uRes.x * band;
    vec2 q = uv + vec2(off, 0.);
    vec3 c = mix(texture(uA, q).rgb, texture(uB, q).rgb, m);
    c += band * vec3(.2, .3, .4) * .4;
    c *= 1. - .25 * sin(3.14159 * uT);
    o = vec4(c, 1.);
  }
}`;

const BRIGHT_FS = `uniform sampler2D uC; uniform float uTh; in vec2 vUv; out vec4 o;
void main(){ vec3 c = texture(uC, vUv).rgb; float l = max(c.r, max(c.g, c.b)); o = vec4(c * smoothstep(uTh, 1., l), 1.); }`;

const BLUR_FS = `uniform sampler2D uC; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main(){
  vec3 c = texture(uC, vUv).rgb * .227;
  c += (texture(uC, vUv + uDir * 1.385).rgb + texture(uC, vUv - uDir * 1.385).rgb) * .316;
  c += (texture(uC, vUv + uDir * 3.231).rgb + texture(uC, vUv - uDir * 3.231).rgb) * .07;
  o = vec4(c, 1.);
}`;

const FINAL_FS = `${NOISE}
uniform sampler2D uC, uBloom; uniform float uBloomAmt, uTime, uRipple, uFade, uExposure, uBarrel, uCA, uGlitch; uniform vec2 uRes;
in vec2 vUv; out vec4 o;
void main(){
  vec2 uv = vUv;
  float rb = smoothstep(.18, 0., uv.y);                 // water-ripple band in the lower 18%
  float line = floor(uv.y * uRes.y / 2.);
  float on = step(.35, hash11(line + floor(uTime * 9.)));
  uv.x += sin(line * .9 + uTime * 13.) * (.8 + uRipple * 6.) * uGlitch / uRes.x * rb * on;
  vec2 c = uv * 2. - 1.;
  c *= 1. + uBarrel * dot(c, c);                        // barrel: the frame bulges toward the viewer
  vec2 bu = c * .5 + .5;
  if (bu.x < 0. || bu.y < 0. || bu.x > 1. || bu.y > 1.) { o = vec4(0., 0., 0., 1.); return; }
  vec2 ca = c * dot(c, c) * uCA * uGlitch;               // chromatic aberration grows toward the edges
  vec3 col = vec3(texture(uC, bu - ca).r, texture(uC, bu).g, texture(uC, bu + ca).b);
  col += texture(uBloom, bu).rgb * uBloomAmt;
  col *= 1. - smoothstep(.55, 1.45, length(c * vec2(1., 1.1))) * .8;
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.) * 97.) - .5) * .04;
  col *= uExposure * (1. - uFade);
  o = vec4(col, 1.);
}`;

const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 16)));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

export function createRenderer(canvas, { mobile = false, hud = null, tier = null } = {}) {
  const FIXED = { full: 1, medium: 0.85, low: 0.7 }[tier];   // ?exp=tier:… (dev only): a fixed resolution scale
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) return null;
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const density = mobile ? 0.4 : 1;
  const dprCap = mobile ? 1.25 : 1.75;
  let ready = false, failed = false, scale = FIXED ?? 1, cw = 1, ch = 1;
  let A, B, C, H1, H2, quad, P = {};
  const scenes = [];
  const slow = { t: 0, fast: 0 };                        // adaptive resolution bookkeeping
  let draws = 0, lastExposure = 0, warmed = null;
  for (const name of ['drawArrays', 'drawArraysInstanced', 'drawElements', 'drawElementsInstanced']) {
    const fn = gl[name].bind(gl);
    gl[name] = (...a) => { draws++; return fn(...a); };
  }

  async function prepare() {
    // 1. programs for every scene and the post chain, all linking in parallel
    await idle();
    P.mix = new Program(gl, QUAD_VS, MIX_FS, ext);
    P.bright = new Program(gl, QUAD_VS, BRIGHT_FS, ext);
    P.blur = new Program(gl, QUAD_VS, BLUR_FS, ext);
    P.final = new Program(gl, QUAD_VS, FINAL_FS, ext);
    for (const make of [createAssembly, createShaft, createRocket]) { await idle(); scenes.push(make(gl, ext, { density })); }
    // 2. geometry, one scene step per idle slot
    for (const sc of scenes) for (const step of sc.build()) { await idle(); step(); }
    await idle();
    const qb = gl.createBuffer();
    quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    A = target(gl, 2, 2, { depth: true }); B = target(gl, 2, 2, { depth: true }); C = target(gl, 2, 2);
    H1 = target(gl, 2, 2); H2 = target(gl, 2, 2);
    sizeTargets();
    // 3. wait for the background compiles, then check each link (one per frame: no long task)
    const all = [P.mix, P.bright, P.blur, P.final, ...scenes.flatMap((s) => s.programs)];
    for (let k = 0; k < 600 && !all.every((p) => p.done); k++) await nextFrame();
    for (const p of all) { p.finish(); await nextFrame(); }
    ready = true;
  }
  const started = prepare().catch((e) => { failed = true; console.warn('[journey] WebGL scenes unavailable:', e.message); });

  function sizeTargets() {
    if (!A) return;
    const w = Math.max(2, Math.round(cw * scale)), h = Math.max(2, Math.round(ch * scale));
    A.resize(w, h); B.resize(w, h); C.resize(w, h);
    H1.resize(w / 2, h / 2); H2.resize(w / 2, h / 2);
    for (const s of scenes) s.resize?.(w, h);
  }

  function resize(cssW, cssH) {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    cw = Math.max(2, Math.round(cssW * dpr)); ch = Math.max(2, Math.round(cssH * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    sizeTargets();
  }

  // Adaptive resolution (0.7–1.0) from the rolling frame interval; stepped so targets rarely reallocate.
  // Round 5 B6: it used to step back up only below 13.5 ms, which a 60 Hz display never reaches, so a page that
  // dipped once stayed at the lower resolution. Now on-time frames (≤ 17.5 ms, i.e. holding vsync) bring it back,
  // and a step up that is undone within 2 s doubles the wait before the next try (no oscillation).
  function adapt(dtMs, now) {
    if (FIXED || dtMs > 100) return;                     // fixed by an experiment, or a stalled/background frame
    slow.t = slow.t * 0.92 + dtMs * 0.08;
    if (slow.t > 19 && scale > 0.7) {
      if (now - (slow.upAt || -1e9) < 2000) slow.wait = Math.min(1440, (slow.wait || 180) * 2);
      scale = Math.max(0.7, +(scale - 0.1).toFixed(2)); slow.t = 16; slow.fast = 0; sizeTargets();
    } else if (slow.t <= 17.5) {
      if (++slow.fast > (slow.wait || 180) && scale < 1) { scale = Math.min(1, +(scale + 0.1).toFixed(2)); slow.fast = 0; slow.upAt = now; sizeTargets(); }
    } else slow.fast = 0;
  }

  const fs = (prog) => { prog.use(); gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLES, 0, 3); };
  const tex = (prog, name, unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); prog.i(name, unit); };

  /** g: journey position in viewport heights (already divided by the phone factor).
   *  opts.exposure: the entry fade (0.15 → 1 during the portal); opts.glitch: ripple and RGB-split amount (0–1). */
  function render(g, vel, dtMs, now, { exposure: entryExposure = 1, glitch = 1 } = {}) {
    if (!ready) return false;
    draws = 0;
    adapt(dtMs, now);
    const time = now / 1000;
    const frame = { time, vel, aspect: A.w / A.h, w: A.w, h: A.h };
    const active = [];
    if (g < T.s1[1]) active.push([0, span(T.s1, g)]);
    if (g >= T.s2[0] && g < T.s2[1]) active.push([1, span(T.s2, g)]);
    if (g >= T.s3[0]) active.push([2, clamp(span(T.s3, g))]);
    const two = active.length > 1;
    gl.enable(gl.DEPTH_TEST);
    active.forEach(([i, p], k) => {
      const t = k === 0 ? A : B;
      t.bind();
      scenes[i].render(clamp(p), frame);
    });
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    let src = A;
    if (two) {
      const mode = active[0][0] === 0 ? 1 : 2;
      const tt = mode === 1 ? clamp(span(T.wipe, g)) : clamp(span(T.dissolve, g));
      C.bind();
      P.mix.use().f('uT', tt).f('uTime', time).f('uRes', C.w, C.h).i('uMode', mode);
      tex(P.mix, 'uA', 0, A); tex(P.mix, 'uB', 1, B);
      fs(P.mix);
      src = C;
    }
    // bloom: bright pass at half resolution, then a separable blur
    const bloomAmt = g < T.wipe[0] ? 0.35 : g < T.dissolve[0] ? 0.35 + 0.65 * sstep(T.wipe[0], T.wipe[1], g) : 0.95;
    H1.bind(); P.bright.use().f('uTh', g < 3 ? 0.62 : 0.5); tex(P.bright, 'uC', 0, src); fs(P.bright);
    H2.bind(); P.blur.use().f('uDir', 1.6 / H1.w, 0); tex(P.blur, 'uC', 0, H1); fs(P.blur);
    H1.bind(); P.blur.use().f('uDir', 0, 1.6 / H1.h); tex(P.blur, 'uC', 0, H2); fs(P.blur);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    const ripple = clamp(Math.abs(vel) / 2600);
    const exposure = (1 - 0.12 * Math.sin(Math.PI * clamp(span(T.dissolve, g)))) * entryExposure;
    lastExposure = exposure;
    P.final.use().f('uBloomAmt', bloomAmt).f('uTime', time).f('uRipple', ripple).f('uFade', sstep(T.end - 0.18, T.end, g))
      .f('uExposure', exposure).f('uBarrel', 0.045).f('uCA', 0.006).f('uGlitch', glitch).f('uRes', cw, ch);
    tex(P.final, 'uC', 0, src); tex(P.final, 'uBloom', 1, H1);
    fs(P.final);
    hud?.stat('scenes', `res ${(scale * 100).toFixed(0)}% · ${cw}×${ch} · draws ${draws} · g ${g.toFixed(2)}`);
    canvas.dataset.draws = String(draws);
    canvas.dataset.scale = String(scale);
    return true;
  }

  // Draw each scene (and both transitions) once while nothing is on screen, one per idle slot, so first-use
  // driver work (pipeline creation, buffer uploads) happens before the reader gets there. Returns the per-slot
  // times in ms (each must stay under a frame).
  function warm() {
    warmed ??= (async () => {
      const times = [];
      for (const g of [0.2, 3.25, 6.3, 8]) {
        await idle();
        const t = performance.now();
        render(g, 0, 16, performance.now(), { exposure: 0, glitch: 0 });
        times.push(+(performance.now() - t).toFixed(2));
      }
      return times;
    })();
    return warmed;
  }

  function dispose() {
    for (const s of scenes) s.dispose();
    for (const p of Object.values(P)) p.dispose();
    for (const t of [A, B, C, H1, H2]) t?.dispose();
  }

  return { gl, started, render, warm, resize, dispose, get ready() { return ready; }, get failed() { return failed; }, get scale() { return scale; }, get exposure() { return lastExposure; }, get warmTimes() { return warmed; } };
}
