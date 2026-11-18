// B1 + B2: the white CRT panel stack and the portal into the About scenes.
// Every pose is a pure function of the smoothed scroll: panel i's progress u = q − i is −1 entering from the
// lower right, 0 resting, +1 leaving upward. Writes registered custom properties (transform and opacity only).
// After [04] rests it grows to cover the viewport while its CRT bulge relaxes to flat and the ground goes to
// black; journey.js cross-fades to the WebGL canvas over the portal's last 30%. Round 5 A3: the portal is
// 150vh (was 70vh) and every part of it follows one smootherstep curve of scroll progress, so it is the same
// in both directions and has no time-based step.
import { scramble } from '../components/scramble.js';
import { smoothScrollTo } from '../utils/scroll.js';
import { initPreviews } from './previews.js';
import { exp } from '../core/experiments.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);   // easeInOutCubic
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/** smootherstep (zero speed and acceleration at both ends) of v over [a, b]. */
export const smoother = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;
const TILT = [[0, 0], [1.4, 0.9], [-1, -0.7], [0.7, 0.5]];       // hand-placed: each rest pose differs a little
const f4 = (v) => +v.toFixed(4);
export const crtPath = (b) => `M${f4(b)} ${f4(b)}Q.5 ${f4(-b)} ${f4(1 - b)} ${f4(b)}Q${f4(1 + b)} .5 ${f4(1 - b)} ${f4(1 - b)}Q.5 ${f4(1 + b)} ${f4(b)} ${f4(1 - b)}Q${f4(-b)} .5 ${f4(b)} ${f4(b)}Z`;
export const BULGE = 0.025;

// Scroll lengths in viewport heights (×0.7 on phones): 120vh per panel, then a 150vh portal
// (css/journey.css sizes the section to match: (stack + portal) × L + 100vh).
export const PORTAL_VH = exp.portal ? Number(exp.portal) / 100 : 1.5;   // ?exp=portal:N (dev only, js/core/experiments.js)
export const lengths = (mobile) => { const L = mobile ? 0.7 : 1; return { L, lead: 0.3 * L, per: 1.2 * L, stack: 4.8 * L, portal: PORTAL_VH * L }; };
// Portal phases (fractions of the portal): the panel grows and the ground darkens over [0, GROW]; the WebGL
// scene cross-fades in over [FADE, 1].
export const GROW = 0.85, FADE = 0.7;

export function initPanels(section, { mobile = false } = {}) {
  const panels = [...section.querySelectorAll('.sw-panel')];
  const links = [...section.querySelectorAll('.sw-index a')];
  const ground = section.querySelector('.sw-ground');
  const index = section.querySelector('.sw-index');
  const legend = section.querySelector('.hud-br');
  const portal = panels[panels.length - 1];
  const portalPaths = [section.querySelector('.crt-portal-path'), ...portal.querySelectorAll('.sw-bezel path')];
  const bezel = portal.querySelector('.sw-bezel');
  const previews = initPreviews(section);
  let len = lengths(mobile);
  const state = panels.map(() => ({ key: '', moving: false, nextRipple: 0, near: false, shown: null }));
  let geo = null, active = 0, lastB = BULGE, played = new Set(), portalP = 0, progress = 0;

  // Layout reads happen here only (resize), never in the frame loop.
  function measure(top, vw, vh) {
    const r = portal.offsetWidth;
    geo = { top, vw, vh, pw: r, ph: portal.offsetHeight, left: portal.offsetLeft, ptop: portal.offsetTop, band: portal.offsetHeight * 0.22 - 6 };
  }
  const restY = (i) => geo.top + (len.lead + i * len.per) * geo.vh + 1;

  function pose(i, u) {
    const { vw, vh } = geo;
    const rest = { tx: 0, ty: 0, rx: 0, ry: mobile ? 0 : -4 + TILT[i][0], rz: -1.5 + TILT[i][1], sc: 1 };
    if (u <= 0) {
      const e = ease(1 + u);
      const from = { tx: 0.38 * vw, ty: 0.72 * vh, rx: 18, ry: mobile ? 0 : -14, rz: 5, sc: 1 };
      return { ...mix(from, rest, e), o: sstep(-1, -0.55, u) };
    }
    const e = ease(u);
    const to = { tx: -0.04 * vw, ty: -0.9 * vh, rx: -12, ry: rest.ry, rz: -4, sc: 1 };
    return { ...mix(rest, to, e), o: 1 - sstep(0.62, 1, u) };
  }
  const mix = (a, b, t) => ({ tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), rx: lerp(a.rx, b.rx, t), ry: lerp(a.ry, b.ry, t), rz: lerp(a.rz, b.rz, t), sc: lerp(a.sc, b.sc, t) });

  function write(i, p) {
    const el = panels[i], st = state[i];
    const key = `${p.tx.toFixed(1)}|${p.ty.toFixed(1)}|${p.rx.toFixed(2)}|${p.ry.toFixed(2)}|${p.rz.toFixed(2)}|${p.sc.toFixed(4)}|${p.o.toFixed(3)}`;
    if (key === st.key) return false;
    st.key = key;
    const sty = el.style;
    sty.setProperty('--tx', `${p.tx.toFixed(1)}px`); sty.setProperty('--ty', `${p.ty.toFixed(1)}px`);
    sty.setProperty('--rx', `${p.rx.toFixed(2)}deg`); sty.setProperty('--ry', `${p.ry.toFixed(2)}deg`); sty.setProperty('--rz', `${p.rz.toFixed(2)}deg`);
    sty.setProperty('--sc', p.sc.toFixed(4)); sty.setProperty('--o', p.o.toFixed(3));
    el.classList.toggle('is-hidden', p.o < 0.01);
    return true;
  }

  // Water-ripple band: 3–5 slices displaced ±2–6px, re-randomised every 90–140ms while the panel moves.
  function ripple(i, moving, now) {
    const st = state[i];
    const slices = panels[i].querySelectorAll('.sw-ripple i');
    if (!moving) {
      if (st.moving) slices.forEach((sl) => { sl.style.opacity = '0'; });
      st.moving = false;
      return;
    }
    st.moving = true;
    if (now < st.nextRipple) return;
    st.nextRipple = now + 90 + Math.random() * 50;
    const n = 3 + Math.floor(Math.random() * 3);
    slices.forEach((sl, k) => {
      if (k >= n) { sl.style.opacity = '0'; return; }
      const dx = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4);
      sl.style.transform = `translate3d(${dx.toFixed(1)}px, ${(Math.random() * geo.band).toFixed(1)}px, 0) scaleY(${(1 + Math.random() * 2).toFixed(2)})`;
      sl.style.opacity = (0.55 + Math.random() * 0.45).toFixed(2);
    });
  }

  function setActive(i) {
    if (i === active) return;
    links[active]?.removeAttribute('aria-current');
    links[i].setAttribute('aria-current', 'true');
    active = i;
    scramble(links[i].querySelector('.sw-line'));
  }

  /** y: smoothed scroll (px). Returns true while something still moves on its own (the ripple). */
  function update(y, vel, now) {
    if (!geo) return false;
    const s = (y - geo.top) / geo.vh;
    const q = clamp((s - len.lead) / len.per, 0, panels.length - 1);
    const pp = clamp((s - len.stack) / len.portal);
    portalP = pp;
    progress = q;
    let busy = false;
    panels.forEach((el, i) => {
      const u = clamp(q - i, -1, 1);
      let p = pose(i, u);
      if (i === panels.length - 1 && pp > 0) {
        // Portal: from the resting rect to a cover-fit of the viewport, rotations to zero.
        const e = smoother(0, GROW, pp), { vw, vh, pw, ph, left, ptop } = geo;
        const cover = Math.max(vw / pw, vh / ph) * 1.02;
        p = { tx: lerp(p.tx, vw / 2 - (left + pw / 2), e), ty: lerp(p.ty, vh / 2 - (ptop + ph / 2), e), rx: lerp(p.rx, 0, e), ry: lerp(p.ry, 0, e), rz: lerp(p.rz, 0, e), sc: lerp(1, cover, e), o: 1 };
      }
      write(i, p);
      // Tell the panel's content when it is about to be needed and when it shows (js/video.js waits for these:
      // the panels sit in a sticky stage just below the fold, so an IntersectionObserver would load them at once).
      const st = state[i];
      if (!st.near && q > i - 1.6) { st.near = true; el.dispatchEvent(new CustomEvent('panel:near')); }
      const shown = p.o > 0.5;
      if (shown !== st.shown) { st.shown = shown; el.dispatchEvent(new CustomEvent('panel:visibility', { detail: { shown } })); }
      const moving = Math.abs(u) > 0.02 && Math.abs(u) < 0.98 && Math.abs(vel) > 1;
      el.classList.toggle('is-moving', Math.abs(u) > 0.15 && Math.abs(u) < 0.98);
      if (el.classList.contains('is-dark')) ripple(i, moving, now);
      if (moving) busy = true;
      if (Math.abs(u) < 0.08 && !played.has(i)) { played.add(i); previews.play(i); }
    });
    setActive(Math.round(q));
    // Portal: the bulge relaxes in step with the growth, the bezel and index fade, the ground goes to black.
    // The bulge is quantised to 48 steps, so the clip path is rewritten at most 48 times across the portal
    // (measured: the rewrite costs ~0.1 ms of paint, against a screen that repaints for its video anyway).
    const grow = smoother(0, GROW, pp);
    const b = BULGE * Math.round(48 * (1 - grow)) / 48;
    if (b !== lastB) {
      lastB = b;
      const d = crtPath(b);
      portalPaths.forEach((path) => path?.setAttribute('d', d));
    }
    bezel.style.opacity = (1 - smoother(0.45, GROW, pp)).toFixed(3);
    ground.style.setProperty('--o', grow.toFixed(3));
    index.style.setProperty('--o', (1 - smoother(0, 0.35, pp)).toFixed(3));
    legend?.style.setProperty('--o', (1 - smoother(0, 0.35, pp)).toFixed(3));
    portal.classList.toggle('is-portal', pp > 0.25);
    section.toggleAttribute('data-dark', pp > 0.5);
    return busy;
  }

  // The index: clicking a line glides to that panel's resting point (the Round 2 eased scroll).
  links.forEach((a, i) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (!geo) return;
    smoothScrollTo(restY(i), { hash: `#${panels[i].id}`, focus: false }).then((arrived) => { if (arrived) panels[i].querySelector('.sw-link').focus({ preventScroll: true }); });
  }));
  // The screen sits above the link (so its buttons work): any other click on it follows the panel's link.
  panels.forEach((el) => el.querySelector('.sw-screen').addEventListener('click', (e) => {
    if (!e.target.closest('a, button')) el.querySelector('.sw-link').click();
  }));
  // Keyboard: tabbing into a panel that isn't the resting one brings it to rest.
  panels.forEach((el, i) => el.addEventListener('focusin', () => {
    if (geo && i !== active) smoothScrollTo(restY(i), { focus: false });
  }));

  return { measure, update, restY, setMobile(m) { mobile = m; len = lengths(m); state.forEach((st) => { st.key = ''; }); }, get portal() { return portalP; }, get progress() { return progress; } };
}
