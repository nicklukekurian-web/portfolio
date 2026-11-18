// Scene 2: the gravity shaft (original, procedural). Two facing walls of boxy buildings form a deep canyon;
// the camera falls down it while rolling from 90° (gravity sideways) to 0° over the first 55%, then drops out
// of the bottom over a dense dark city. Windows are emissive cells picked by a hash in the fragment shader
// (no textures); a pale-blue light column of layered additive sheets runs down the middle and narrows as it
// drifts left. Two draw calls: buildings (walls and city share one instanced mesh) and the light sheets.
import { Program, boxMesh, vao, camera, rng, NOISE } from './core.js';

export const BUILD_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale; layout(location=4) in vec4 iData;
uniform mat4 uVP; uniform vec3 uOffset;
out vec3 vW; out vec3 vN; flat out vec4 vD;
void main(){ vec3 w = aPos * iScale + iPos + uOffset; vW = w; vN = aNrm; vD = iData; gl_Position = uVP * vec4(w, 1.); }`;

// iData: seed, lit probability, tone (0 shadow steel … 1 lit steel), unused
export const BUILD_FS = `${NOISE}
uniform vec3 uCam, uFogC; uniform float uFogD, uLit, uCol, uColW, uDim;
in vec3 vW; in vec3 vN; flat in vec4 vD; out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 base = mix(vec3(.016, .035, .059), mix(vec3(.055, .165, .247), vec3(.18, .435, .576), vD.z), .55 + .45 * vD.z) * .6;
  vec2 uv = abs(n.x) > .5 ? vW.zy : abs(n.z) > .5 ? vW.xy : vW.xz;
  vec2 cell = uv / vec2(1.25, 1.7), id = floor(cell), f = fract(cell);
  float win = step(.18, f.x) * step(f.x, .82) * step(.22, f.y) * step(f.y, .8);
  float h = hash21(id + vD.x * 37.);
  float lit = step(h, vD.y * uLit) * win;
  if (n.y > .5) { win = 0.; lit = step(.975, h) * step(.3, f.x) * step(f.x, .7) * step(.3, f.y) * step(f.y, .7); }
  vec3 wc = mix(vec3(1., .86, .62), vec3(.62, .9, 1.), step(.55, fract(h * 13.)));
  float wash = exp(-abs(vW.x - uCol) * .22) * (.35 + .65 * abs(n.x));
  vec3 c = base * (.3 + .7 * max(dot(n, normalize(vec3(.2, .9, .3))), 0.)) + vec3(.749, .902, .961) * wash * .16;
  c = mix(c, c * .45 + vec3(.01, .02, .035), win * (1. - lit));
  c += wc * lit * (1.3 + .6 * fract(h * 7.));
  float d = length(vW - uCam);
  c = mix(uFogC, c, exp(-d * uFogD) * (1. - .5 * lit) + .5 * lit * exp(-d * uFogD * .35));
  o = vec4(c * uDim, 1.);
}`;

const SHEET_VS = `
layout(location=0) in vec3 aPos; layout(location=2) in vec2 iK;     // offset in widths, weight
uniform mat4 uVP; uniform float uCol, uColW, uTop, uBot;
out float vW8; out vec3 vWp; out vec2 vQ;
void main(){
  vec3 w = vec3(uCol + iK.x * uColW, mix(uBot, uTop, aPos.y + .5), aPos.z * 90.);
  vW8 = iK.y; vWp = w; vQ = aPos.yz;
  gl_Position = uVP * vec4(w, 1.);
}`;

const SHEET_FS = `
uniform vec3 uCam; uniform float uGlow;
in float vW8; in vec3 vWp; in vec2 vQ; out vec4 o;
void main(){
  vec3 c = mix(vec3(.11, .29, .39), vec3(.75, .9, .96), vW8 * vW8);
  float a = vW8 * .17 * uGlow * smoothstep(.5, .3, abs(vQ.y)) * smoothstep(.5, .42, abs(vQ.x));
  a *= exp(-length(vWp - uCam) * .003);
  o = vec4(c * a, 1.);
}`;

const H = 260, W = 6, CITY_Y = -H - 140;
export const SHAFT = { H, CITY_Y };

/** Instanced city blocks around (0, y0, 0): [pos3, scale3, data4] per box. Shared with scene 3. */
export function cityBlocks(rand, { n = 24, gap = 6, y0 = 0 } = {}) {
  const I = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (rand() < 0.08) continue;                          // a few open plots and streets
    const h = 3 + rand() ** 2 * 26, sx = gap * (0.45 + rand() * 0.35), sz = gap * (0.45 + rand() * 0.35);
    I.push((i - n / 2) * gap + (rand() - 0.5) * 1.2, y0 + h / 2, (j - n / 2) * gap + (rand() - 0.5) * 1.2, sx, h, sz, rand() * 9, 0.16 + rand() * 0.14, rand(), 1);
  }
  return I;
}

export function createShaft(gl, ext, { density = 1 } = {}) {
  const P = { build: new Program(gl, BUILD_VS, BUILD_FS, ext), sheet: new Program(gl, SHEET_VS, SHEET_FS, ext) };
  const V = {};
  const rand = rng(23);

  function build() {
    return [
      () => {
        const I = [];
        for (const side of [-1, 1]) {
          for (let z = -45; z < 45;) {
            const wz = 3 + rand() * 4.5;
            for (let y = 10; y > -H;) {
              const hy = 5 + rand() * 9, prot = rand() * 2.6, depth = 4;
              // the box face nearest the axis sits at |x| = W − prot; the right wall is lit, the left mostly dark
              const x0 = side * (W - prot), x1 = side * (W + depth);
              if (rand() < density + 0.15) I.push((x0 + x1) / 2, y - hy / 2, z + wz / 2, Math.abs(x1 - x0), hy * 0.96, wz * 0.94, rand() * 9, side > 0 ? 0.24 : 0.07, side > 0 ? 0.55 + rand() * 0.45 : rand() * 0.25, 0);
              y -= hy;
            }
            z += wz;
          }
        }
        I.push(...cityBlocks(rand, { n: density < 1 ? 16 : 26, gap: 6, y0: CITY_Y }));
        I.push(0, CITY_Y - 0.5, 0, 400, 1, 400, 0, 0, 0, 0);   // the ground under the city
        V.build = vao(gl, { mesh: boxMesh(), instances: new Float32Array(I), layout: [[2, 3], [3, 3], [4, 4]] });
      },
      () => {
        const quad = new Float32Array([0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5]);
        const K = [];
        for (let k = -4; k <= 4; k++) K.push(k / 4, Math.exp(-(k * k) / 5));
        V.sheet = vao(gl, { mesh: quad, stride: 3, instances: new Float32Array(K), layout: [[2, 2]] });
      },
    ];
  }

  function render(p, f) {
    const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
    const y = 30 - e * (H + 85);
    const tilt = (24 - 18 * p) * (Math.PI / 180);
    const k = Math.min(1, p / 0.55), roll = (Math.PI / 2) * (1 - k * k * (3 - 2 * k));   // 90° → 0° over the first 55%
    const shake = Math.sin(f.time * 1.7) * 0.004 + Math.sin(f.time * 2.9) * 0.003;
    const eye = [Math.sin(f.time * 0.5) * 0.15, y, Math.sin(f.time * 0.37) * 0.2];
    const dir = [Math.sin(tilt) + shake, -Math.cos(tilt), shake];
    const cam = camera(eye, dir, { fov: 58 + 3 * Math.min(1, Math.abs(f.vel) / 2600), aspect: f.aspect, near: 0.2, far: 700, up: [0, 0, 1], roll });
    const col = -3.4 * Math.max(0, (p - 0.35) / 0.65) ** 1.3, colW = 1.3 - 0.95 * p;
    gl.clearColor(0.016, 0.035, 0.059, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    P.build.use().m4('uVP', cam.vp).v3('uCam', eye).v3('uOffset', [0, 0, 0]).f('uFogC', 0.016, 0.035, 0.059).f('uFogD', 0.0075)
      .f('uLit', 1 + 0.6 * p).f('uCol', col).f('uColW', colW).f('uDim', 1);
    gl.bindVertexArray(V.build.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, V.build.count, V.build.n);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    P.sheet.use().m4('uVP', cam.vp).v3('uCam', eye).f('uCol', col).f('uColW', colW).f('uTop', 40).f('uBot', -H).f('uGlow', 1 - 0.85 * Math.max(0, (p - 0.75) / 0.25));
    gl.bindVertexArray(V.sheet.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, V.sheet.n);
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  return { programs: Object.values(P), build, render, dispose() { Object.values(P).forEach((q) => q.dispose()); Object.values(V).forEach((v) => v?.dispose?.()); } };
}
