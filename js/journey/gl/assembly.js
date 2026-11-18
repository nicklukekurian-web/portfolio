// Scene 1: a semiconductor assembly line (original, procedural). A low camera flies down a long conveyor:
// two lanes of green chip packages sliding on steel rails, rows of white three-segment robot arms running a
// pick-and-place loop on both sides, coloured cable bundles, a dark metal floor with tanks and circuit boards,
// exponential fog to near black. One draw call per mesh type: static boxes, arms, tanks, cables (4 in total).
import { Program, boxMesh, cylinderMesh, vao, camera, rng, NOISE } from './core.js';

const LIGHT = `
uniform vec3 uCam;
vec3 shade(vec3 base, vec3 n, vec3 w, float spec){
  vec3 key = normalize(vec3(-.45, .85, .3));
  vec3 v = normalize(uCam - w);
  float d = max(dot(n, key), 0.);
  float rim = pow(1. - max(dot(n, v), 0.), 3.);
  float sp = pow(max(dot(n, normalize(key + v)), 0.), 40.) * spec;
  return base * (.17 + .83 * d) + rim * .2 * vec3(.55, .72, 1.) + sp;
}
vec3 fog(vec3 c, vec3 w){ return mix(vec3(.0196, .0196, .0275), c, exp(-length(w - uCam) * .034)); }`;

const STATIC_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 iPos; layout(location=3) in vec3 iScale; layout(location=4) in vec4 iData;
uniform mat4 uVP; uniform float uTime;
out vec3 vW; out vec3 vN; out vec3 vL; flat out vec4 vD;
void main(){
  vec3 p = iPos;
  if (iData.x < .5) p.z = iPos.z - mod(iData.z + uTime * .7, 140.);     // chips slide down the line
  vec3 w = aPos * iScale + p;
  vW = w; vN = aNrm; vL = aPos; vD = iData;
  gl_Position = uVP * vec4(w, 1.);
}`;

const STATIC_FS = `${NOISE}${LIGHT}
uniform float uTime;
in vec3 vW; in vec3 vN; in vec3 vL; flat in vec4 vD; out vec4 o;
void main(){
  int m = int(vD.x + .5); vec3 n = normalize(vN); vec3 c; float spec = .08;
  if (m == 0) {                                        // chip: green package, darker die, silver edge pins
    c = vec3(.13, .52, .24);
    if (n.y > .5) {
      vec2 q = vL.xz;
      if (max(abs(q.x), abs(q.y)) < .27) { c = vec3(.04, .16, .09); spec = .5; }
      else if (abs(q.x) > .41 && fract(q.y * 7.) < .45) { c = vec3(.72, .76, .8); spec = .6; }
      else c *= .9 + .1 * step(.5, fract((q.x + q.y) * 9.));
    }
  } else if (m == 1) { c = vec3(.52, .57, .63); spec = .9; if (n.y > .5) c *= 1.5; }      // steel rail
  else if (m == 2) {                                   // belt: dark rubber with moving cleats
    c = vec3(.07, .08, .09) * (1. + .5 * step(fract((vW.z + uTime * .7) * 1.6), .07));
  } else if (m == 3) { c = vec3(.15, .17, .2); spec = .3; }                                 // frame and cabinets
  else if (m == 4) {                                   // circuit board on the floor
    c = vec3(.08, .36, .17) * (.8 + .4 * step(.85, fract(vL.x * 11.)) + .3 * step(.88, fract(vL.z * 9.)));
    spec = .2;
  } else {                                             // floor: dark metal panels with seams
    vec2 f = fract(vW.xz / 2.4), id = floor(vW.xz / 2.4);
    float seam = step(min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)), .012);
    c = vec3(.055, .062, .072) * (.85 + .3 * hash21(id)) * (1. - .6 * seam);
    c += vec3(.02) * step(.5, fract((vW.x + vW.z) * 5.)) * .4;
    spec = .35;
  }
  o = vec4(fog(shade(c, n, vW, spec), vW), 1.);
}`;

const ARM_VS = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 iBase; layout(location=3) in vec4 iArm;   // side, phase, segment, scale
uniform mat4 uVP; uniform float uTime;
out vec3 vW; out vec3 vN; flat out float vMat;
void main(){
  float side = iArm.x, ph = iArm.y, s = iArm.w; int seg = int(iArm.z + .5);
  float t = uTime * .85 + ph;
  float c = .5 + .5 * sin(t);
  float yaw = (side > 0. ? 0. : 3.14159) + .5 * sin(t * .5 + ph * 1.7);
  vec3 up = vec3(0., 1., 0.), h = vec3(cos(yaw), 0., sin(yaw));
  float a1 = .25 + .5 * c, a2 = a1 + 1.05 + .45 * c, a3 = a2 + .7 - .5 * c;
  vec3 d1 = up * cos(a1) + h * sin(a1), d2 = up * cos(a2) + h * sin(a2), d3 = up * cos(a3) + h * sin(a3);
  vec3 p0 = iBase + vec3(0., .62 * s, 0.), p1 = p0 + d1 * 1.05 * s, p2 = p1 + d2 * .95 * s, p3 = p2 + d3 * .38 * s;
  vec3 nrm = normalize(cross(h, up));
  vec3 X = vec3(1., 0., 0.), Y = up, Z = vec3(0., 0., 1.), C = iBase + vec3(0., .31 * s, 0.), S = vec3(.44, .62, .44) * s;
  vMat = 0.;
  if (seg >= 1 && seg <= 3) {
    vec3 a = seg == 1 ? p0 : seg == 2 ? p1 : p2, b = seg == 1 ? p1 : seg == 2 ? p2 : p3;
    float th = seg == 1 ? .2 : seg == 2 ? .16 : .11;
    Y = normalize(b - a); X = nrm; Z = cross(X, Y); C = (a + b) * .5; S = vec3(th, length(b - a) / s + th * .7, th) * s;
  } else if (seg >= 4) {
    X = nrm; Y = up; Z = cross(X, Y); C = seg == 4 ? p0 : seg == 5 ? p1 : p2; S = vec3(.24) * s; vMat = 1.;
  }
  vec3 l = aPos * S;
  vec3 w = C + X * l.x + Y * l.y + Z * l.z;
  vW = w; vN = X * aNrm.x + Y * aNrm.y + Z * aNrm.z;
  gl_Position = uVP * vec4(w, 1.);
}`;

const ARM_FS = `${LIGHT}
in vec3 vW; in vec3 vN; flat in float vMat; out vec4 o;
void main(){
  vec3 n = normalize(vN);
  vec3 c = vMat > .5 ? vec3(.08, .09, .1) : vec3(.86, .89, .92);
  o = vec4(fog(shade(c, n, vW, vMat > .5 ? .6 : .25), vW), 1.);
}`;

const CABLE_VS = `
layout(location=0) in vec3 aPos;                        // x: t along the cable, y: side of the ribbon
layout(location=2) in vec3 iA; layout(location=3) in vec3 iB; layout(location=4) in vec4 iC;
uniform mat4 uVP; uniform float uTime; uniform vec3 uCam;
out vec3 vW; out vec3 vCol;
void main(){
  float t = aPos.x, k = 3.14159 * t;
  vec3 p = mix(iA, iB, t);
  p.y -= .5 * sin(k);
  p.z += .07 * sin(k) * sin(uTime * 1.3 + iC.w * 6.28);
  vec3 tg = normalize(iB - iA + vec3(0., -.5 * 3.14159 * cos(k), 0.));
  p += normalize(cross(tg, normalize(uCam - p))) * aPos.y * .038;
  vW = p; vCol = iC.rgb;
  gl_Position = uVP * vec4(p, 1.);
}`;

const CABLE_FS = `
uniform vec3 uCam; in vec3 vW; in vec3 vCol; out vec4 o;
void main(){ o = vec4(mix(vec3(.0196, .0196, .0275), vCol * 1.15, exp(-length(vW - uCam) * .03)), 1.); }`;

const CABLES = [[0.84, 0.2, 0.18], [0.95, 0.76, 0.18], [0.18, 0.44, 0.84], [0.94, 0.54, 0.14]];

export function createAssembly(gl, ext, { density = 1 } = {}) {
  const P = {
    stat: new Program(gl, STATIC_VS, STATIC_FS, ext),
    arm: new Program(gl, ARM_VS, ARM_FS, ext),
    cable: new Program(gl, CABLE_VS, CABLE_FS, ext),
  };
  const V = {};
  const rand = rng(11);

  function build() {
    return [
      () => {                                           // static boxes: floor, rails, belts, chips, frame, boards, cabinets
        const I = [];
        const add = (x, y, z, sx, sy, sz, m, a = 0, b = 0) => I.push(x, y, z, sx, sy, sz, m, rand(), a, b);
        add(0, -0.01, -60, 34, 0.02, 160, 5);
        for (const x of [-0.95, -0.15, 0.15, 0.95]) add(x, 0.32, -60, 0.06, 0.06, 150, 1);
        for (const x of [-0.55, 0.55]) add(x, 0.2, -60, 0.78, 0.16, 150, 2);
        const step = 1.25;
        for (const x of [-0.55, 0.55]) for (let k = 0; k < 140 / step; k++) add(x, 0.305, 6, 0.5, 0.05, 0.5, 0, k * step + (x > 0 ? 0.6 : 0));
        for (let z = 6; z > -130; z -= 4) for (const x of [-1, 1]) add(x * 1.02, 0.1, z, 0.08, 0.2, 0.08, 3);
        const nb = Math.round(70 * density);
        for (let k = 0; k < nb; k++) { const sx = rand() < 0.5 ? -1 : 1; add(sx * (3.2 + rand() * 5), 0.03, 4 - rand() * 130, 0.5 + rand() * 0.7, 0.04, 0.4 + rand() * 0.6, 4); }
        for (let z = 2; z > -130; z -= 6 / Math.max(0.5, density)) for (const sx of [-1, 1]) add(sx * (9 + rand() * 2), 0.9, z, 1.6, 1.8 + rand() * 1.4, 2.2, 3);
        V.stat = vao(gl, { mesh: boxMesh(), instances: new Float32Array(I), layout: [[2, 3], [3, 3], [4, 4]] });
      },
      () => {                                           // robot arms: pedestal, three segments, three joints (7 instances each)
        const I = [];
        const gap = density < 1 ? 7 : 3.2;
        for (let z = 3; z > -118; z -= gap) for (const side of [1, -1]) {
          const ph = rand() * 6.28, s = 0.62 + rand() * 0.16;
          for (let seg = 0; seg < 7; seg++) I.push(-side * 1.85, 0, z + (side > 0 ? 0 : gap / 2), side, ph, seg, s);
        }
        V.arm = vao(gl, { mesh: boxMesh(), instances: new Float32Array(I), layout: [[2, 3], [3, 4]] });
        V.armBases = I;
      },
      () => {                                           // tanks (cylinders) on the floor, sharing the static shader
        const I = [];
        const n = Math.round(46 * density);
        for (let k = 0; k < n; k++) { const sx = rand() < 0.5 ? -1 : 1, r = 0.5 + rand() * 0.7, h = 0.6 + rand() * 1.4; I.push(sx * (4 + rand() * 4), h / 2, 2 - rand() * 128, r, h, r, 3, rand(), 0, 0); }
        V.tank = vao(gl, { mesh: cylinderMesh(18), instances: new Float32Array(I), layout: [[2, 3], [3, 3], [4, 4]] });
      },
      () => {                                           // cable bundles: from each pedestal top to the floor behind it
        const strip = [];
        for (let i = 0; i <= 16; i++) strip.push(i / 16, -1, 0, i / 16, 1, 0);
        const I = [];
        const A = V.armBases;
        for (let k = 0; k < A.length; k += 7 * 7) {
          const x = A[k], z = A[k + 2], side = A[k + 3];
          for (let c = 0; c < 3; c++) {
            const col = CABLES[Math.floor(rand() * CABLES.length)];
            I.push(x, 0.4, z + (c - 1) * 0.1, x - side * (0.7 + rand() * 0.6), 0.02, z + (c - 1) * 0.25 + (rand() - 0.5), ...col, rand());
          }
        }
        V.cable = vao(gl, { mesh: new Float32Array(strip), stride: 3, instances: new Float32Array(I), layout: [[2, 3], [3, 3], [4, 4]] });
      },
    ];
  }

  function render(p, f) {
    const z = 4 - (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2) * 80;
    const sway = Math.sin(f.time * 0.45) * 0.0105;        // ±0.6°
    const speed = Math.min(1, Math.abs(f.vel) / 2600);
    const eye = [Math.sin(f.time * 0.3) * 0.04, 1.15 + Math.sin(f.time * 0.7) * 0.02, z];
    const cam = camera(eye, [Math.sin(sway), -0.15, -Math.cos(sway)], { fov: 54 + 2 * speed, aspect: f.aspect, near: 0.05, far: 160, roll: Math.sin(f.time * 0.4) * 0.004 + f.vel * 1e-6 });
    gl.clearColor(0.0196, 0.0196, 0.0275, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    P.stat.use().m4('uVP', cam.vp).f('uTime', f.time).v3('uCam', eye);
    gl.bindVertexArray(V.stat.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, V.stat.count, V.stat.n);
    gl.bindVertexArray(V.tank.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, V.tank.count, V.tank.n);
    P.arm.use().m4('uVP', cam.vp).f('uTime', f.time).v3('uCam', eye);
    gl.bindVertexArray(V.arm.va); gl.drawArraysInstanced(gl.TRIANGLES, 0, V.arm.count, V.arm.n);
    P.cable.use().m4('uVP', cam.vp).f('uTime', f.time).v3('uCam', eye);
    gl.bindVertexArray(V.cable.va); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, V.cable.count, V.cable.n);
    gl.bindVertexArray(null);
  }

  return { programs: Object.values(P), build, render, dispose() { Object.values(P).forEach((p) => p.dispose()); Object.values(V).forEach((v) => v?.dispose?.()); } };
}
