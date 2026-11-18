// Scene 3: a rocket climbing out of the city into space (original, procedural). It starts over the night
// city, slowly spinning; as the camera swings from above to the side and pulls back, the city shrinks into a
// curved planet with a thin blue atmosphere, the sky goes black and stars come out. ~400 GPU-driven exhaust
// sprites stream from the nozzle (longer at scroll speed) and fade as the rocket leaves the atmosphere.
// Five draw calls: sky/planet (analytic, one full-screen pass), stars, city, rocket, exhaust.
import { Program, boxMesh, latheMesh, vao, camera, rng, NOISE } from './core.js';
import { BUILD_VS, BUILD_FS, cityBlocks } from './shaft.js';

const R = 2400;                       // planet radius (world units)

const SKY_VS = 'layout(location=0) in vec2 aP; out vec2 vUv; void main(){ vUv = aP * .5 + .5; gl_Position = vec4(aP, .9999, 1.); }';
const SKY_FS = `${NOISE}
uniform vec3 uEye, uRight, uUp, uFwd, uC; uniform float uTan, uAspect, uR, uAlt;
in vec2 vUv; out vec4 o;
void main(){
  vec2 s = vUv * 2. - 1.;
  vec3 rd = normalize(uFwd + s.x * uTan * uAspect * uRight + s.y * uTan * uUp);
  vec3 oc = uEye - uC; float b = dot(oc, rd), c = dot(oc, oc) - uR * uR, h = b * b - c;
  vec3 atm = vec3(.29, .64, 1.);
  float high = smoothstep(30., 260., uAlt);
  vec3 col;
  if (h > 0. && -b - sqrt(h) > 0.) {                    // the planet: dark ground, city lights, a blue limb
    vec3 P = uEye + rd * (-b - sqrt(h)), N = normalize(P - uC);
    vec2 q = N.xz * uR;
    float cs = 5. * max(1., uAlt / 40.);
    vec2 id = floor(q / cs), f = fract(q / cs) - .5;
    float r = length(q);
    float dens = .55 * exp(-r / 260.) + .12 * step(.93, hash21(floor(q / 160.))) + .02;
    float lit = step(hash21(id), dens) * smoothstep(.45, .1, length(f));
    col = vec3(.008, .016, .03) + vec3(1., .78, .5) * lit * (.6 + .4 * hash21(id + 3.));
    col += atm * pow(1. - max(dot(N, -rd), 0.), 4.) * .7;
  } else {                                              // the sky: navy at low altitude, black above; atmosphere glow
    float dmin = b < 0. ? sqrt(max(dot(oc, oc) - b * b, 0.)) : length(oc);
    float g = exp(-max(dmin - uR, 0.) / 38.);
    col = mix(vec3(.02, .05, .1), vec3(0.), high) * (1. - high * .9) + atm * g * mix(.35, 1.1, high);
  }
  o = vec4(col, 1.);
}`;

const STAR_VS = `
layout(location=0) in vec3 aPos;
uniform mat4 uVP; uniform vec3 uEye, uC; uniform float uR, uTime, uStars, uPx;
out float vA;
void main(){
  vec3 d = normalize(aPos), p = d * 1400.;
  vec3 rd = normalize(p - uEye), oc = uEye - uC;
  float b = dot(oc, rd), h = b * b - (dot(oc, oc) - uR * uR);
  float hid = step(0., h) * step(0., -b - sqrt(max(h, 0.)));
  float id = float(gl_VertexID);
  vA = uStars * (1. - hid) * (.55 + .45 * sin(uTime * (1. + fract(id * .37) * 3.) + id)) * (.35 + .65 * fract(id * .618));
  gl_Position = uVP * vec4(p, 1.);
  gl_Position.z = gl_Position.w * .9998;
  gl_PointSize = uPx * (1.6 + 2.2 * fract(id * .123));
}`;
const STAR_FS = 'in float vA; out vec4 o; void main(){ float d = length(gl_PointCoord - .5); o = vec4(vec3(.85, .92, 1.) * vA * 1.6 * smoothstep(.5, .05, d), 1.); }';

const ROCKET_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in float aMat;
uniform mat4 uVP, uModel;
out vec3 vW; out vec3 vN; out vec3 vL; flat out float vM;
void main(){ vec4 w = uModel * vec4(aPos, 1.); vW = w.xyz; vN = mat3(uModel) * aNrm; vL = aPos; vM = aMat; gl_Position = uVP * w; }`;
const ROCKET_FS = `
uniform vec3 uCam; uniform float uFlame;
in vec3 vW; in vec3 vN; in vec3 vL; flat in float vM; out vec4 o;
void main(){
  vec3 n = normalize(vN), v = normalize(uCam - vW), key = normalize(vec3(-.5, .7, .45));
  vec3 c = vec3(.898, .224, .122); float spec = .5;
  if (vM > 2.5) { c = vec3(.16, .16, .18); spec = .8; }
  else if (vM > 1.5) c = vec3(.7, .16, .08);
  else if (vL.y > .9 && vL.y < 1.25) c = vec3(.93);
  float glow = 0.;
  float ang = atan(vL.z, vL.x);
  for (int k = 0; k < 3; k++) {                        // three porthole lights
    float a = ang - float(k) * 2.0944;
    a = mod(a + 3.14159, 6.28318) - 3.14159;
    glow += smoothstep(.16, .1, length(vec2(a * .52, vL.y - 1.9))) * step(vM, .5);
  }
  float d = max(dot(n, key), 0.), rim = pow(1. - max(dot(n, v), 0.), 2.5);
  float sp = pow(max(dot(n, normalize(key + v)), 0.), 30.) * spec;
  vec3 col = c * (.14 + .86 * d) + rim * vec3(1., .62, .26) * .7 + sp * vec3(1., .85, .7);
  col += vec3(.65, .88, 1.) * glow * 2.2;
  col += vec3(1., .62, .26) * smoothstep(-2.2, -3.4, vL.y) * uFlame * .9;
  o = vec4(col, 1.);
}`;

const FLAME_VS = `
layout(location=0) in vec3 aPos;                        // two random numbers per particle
uniform mat4 uVP, uModel; uniform float uTime, uLen, uPx;
out float vPh;
void main(){
  float r1 = aPos.x, r2 = aPos.y;
  float ph = fract(uTime * (1.1 + r1 * .9) + r2 * 7.);
  float spread = .12 + ph * ph * 1.1;
  float a = r1 * 6.2831 + uTime * 2.;
  vec3 lp = vec3(cos(a) * spread * r2, -3.45 - ph * uLen, sin(a) * spread * r2);
  vec4 w = uModel * vec4(lp, 1.);
  gl_Position = uVP * w;
  gl_PointSize = uPx * (1.2 - ph * .8) * (40. / max(gl_Position.w, 1.)) + 1.;
  vPh = ph;
}`;
const FLAME_FS = `
uniform float uFlame; in float vPh; out vec4 o;
void main(){
  float d = length(gl_PointCoord - .5);
  vec3 c = vPh < .15 ? mix(vec3(1.), vec3(1., .82, .4), vPh / .15) : vPh < .5 ? mix(vec3(1., .82, .4), vec3(1., .42, .12), (vPh - .15) / .35) : mix(vec3(1., .42, .12), vec3(.6, .08, .04), (vPh - .5) / .5);
  float a = (1. - vPh) * smoothstep(.5, .15, d) * uFlame;
  o = vec4(c * a, 1.);
}`;

function rocketMesh() {
  const profile = [[0.3, -3.45], [0.42, -3.05], [0.5, -2.92], [0.52, -2.6], [0.52, 1.6], [0.5, 2.0], [0.44, 2.5], [0.33, 3.0], [0.18, 3.45], [0.0, 3.78]];
  const out = latheMesh(profile, 28, (j) => (j < 2 ? 3 : 0));
  const box = boxMesh();
  for (let k = 0; k < 4; k++) {                          // four fins, built into the same mesh
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < box.length; i += 6) {
      const x = box[i] * 0.07, y = box[i + 1] * 1.3 - 2.35, z = box[i + 2] * 0.85 + 0.85;
      const nx = box[i + 3], ny = box[i + 4], nz = box[i + 5];
      out.push(x * c - z * s, y - Math.max(0, z - 0.85) * 0.5, x * s + z * c, nx * c - nz * s, ny, nx * s + nz * c, 2);
    }
  }
  return new Float32Array(out);
}

function model(tilt, spin) {
  const cz = Math.cos(tilt), sz = Math.sin(tilt), cy = Math.cos(spin), sy = Math.sin(spin);
  // Rz(tilt) · Ry(spin), column-major
  return new Float32Array([cz * cy, sz * cy, -sy, 0, -sz, cz, 0, 0, cz * sy, sz * sy, cy, 0, 0, 0, 0, 1]);
}

export function createRocket(gl, ext, { density = 1 } = {}) {
  const P = {
    sky: new Program(gl, SKY_VS, SKY_FS, ext), star: new Program(gl, STAR_VS, STAR_FS, ext),
    city: new Program(gl, BUILD_VS, BUILD_FS, ext), rocket: new Program(gl, ROCKET_VS, ROCKET_FS, ext),
    flame: new Program(gl, FLAME_VS, FLAME_FS, ext),
  };
  const V = {};
  const rand = rng(37);
  const dpr = Math.min(1.75, window.devicePixelRatio || 1);

  function build() {
    return [
      () => {
        const I = cityBlocks(rand, { n: density < 1 ? 22 : 36, gap: 6, y0: 0 });
        V.city = vao(gl, { mesh: boxMesh(), instances: new Float32Array(I), layout: [[2, 3], [3, 3], [4, 4]] });
      },
      () => {
        V.rocket = vao(gl, { mesh: rocketMesh(), stride: 7, extra: [[2, 1, 6]] });
        const fl = [];
        for (let k = 0; k < 400; k++) fl.push(rand(), rand(), 0);
        V.flame = vao(gl, { mesh: new Float32Array(fl), stride: 3 });
        const st = [];
        for (let k = 0; k < 420; k++) { const u = rand() * 2 - 1, a = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u); st.push(r * Math.cos(a), u, r * Math.sin(a)); }
        V.star = vao(gl, { mesh: new Float32Array(st), stride: 3 });
        const qb = new Float32Array([-1, -1, 3, -1, -1, 3]);
        V.sky = { va: gl.createVertexArray(), vb: gl.createBuffer(), dispose() { gl.deleteVertexArray(this.va); gl.deleteBuffer(this.vb); } };
        gl.bindVertexArray(V.sky.va); gl.bindBuffer(gl.ARRAY_BUFFER, V.sky.vb); gl.bufferData(gl.ARRAY_BUFFER, qb, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
      },
    ];
  }

  function render(p, f) {
    const e = p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2;
    const alt = 12 + 300 * p ** 1.7;                     // the rocket's height above the city
    const C = [0, -R - alt, 0];
    const phi = (72 - 64 * e) * (Math.PI / 180), dist = 15 + 16 * e, az = 0.5 + 0.35 * p;
    const target = [0, -0.6 + 1.6 * e, 0];
    const eye = [target[0] + dist * Math.cos(phi) * Math.sin(az), target[1] + dist * Math.sin(phi), target[2] + dist * Math.cos(phi) * Math.cos(az)];
    const cam = camera(eye, [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]], { fov: 50, aspect: f.aspect, near: 0.1, far: 4000 });
    const speed = Math.min(1, Math.abs(f.vel) / 2600);
    const flame = 1 - Math.max(0, (p - 0.72) / 0.28);
    const M = model(0.42 - 0.3 * e, p * Math.PI * 1.3 + f.time * 0.12);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    P.sky.use().v3('uEye', eye).v3('uRight', cam.right).v3('uUp', cam.up).v3('uFwd', cam.fwd).v3('uC', C)
      .f('uTan', cam.tanHalf).f('uAspect', cam.aspect).f('uR', R).f('uAlt', alt);
    gl.bindVertexArray(V.sky.va); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    P.star.use().m4('uVP', cam.vp).v3('uEye', eye).v3('uC', C).f('uR', R).f('uTime', f.time)
      .f('uStars', Math.min(1, Math.max(0, (alt - 30) / 120))).f('uPx', dpr * (f.h / 900 + 0.4));
    gl.bindVertexArray(V.star.va); gl.drawArrays(gl.POINTS, 0, V.star.count);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    if (alt < 170) {                                     // the city, until it is a speck on the planet
      P.city.use().m4('uVP', cam.vp).v3('uCam', eye).v3('uOffset', [0, -alt, 0]).f('uFogC', 0.01, 0.02, 0.04).f('uFogD', 0.002)
        .f('uLit', 1.3).f('uCol', 0).f('uColW', 1).f('uDim', 1 - Math.max(0, (alt - 90) / 80));
      gl.bindVertexArray(V.city.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, V.city.count, V.city.n);
    }
    P.rocket.use().m4('uVP', cam.vp).m4('uModel', M).v3('uCam', eye).f('uFlame', flame);
    gl.bindVertexArray(V.rocket.va); gl.drawArrays(gl.TRIANGLES, 0, V.rocket.count);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    P.flame.use().m4('uVP', cam.vp).m4('uModel', M).f('uTime', f.time).f('uLen', 2.4 + 5 * speed).f('uPx', dpr * (f.h / 900) * 1.3).f('uFlame', flame);
    gl.bindVertexArray(V.flame.va); gl.drawArrays(gl.POINTS, 0, V.flame.count);
    gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  return { programs: Object.values(P), build, render, dispose() { Object.values(P).forEach((q) => q.dispose()); Object.values(V).forEach((v) => v?.dispose?.()); } };
}
