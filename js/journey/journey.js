// The Selected Work → About journey. One scroll driver (js/core/scroll-driver.js) feeds three things from
// the same smoothed scroll value each frame: the CRT panel stack and portal (panels.js), the three About text
// blocks (rising at 1.25× scroll speed), and the shared WebGL renderer (gl/renderer.js). Layout is read only
// on resize. Reduced motion or no WebGL2 switches to the static layout (posters, a plain list) live, without
// a reload. ?debug=fps shows frame time, resolution scale and draw calls.
import { driver } from '../core/scroll-driver.js';
import { initPanels, lengths, smoother, FADE, PORTAL_VH } from './panels.js';
import { exp } from '../core/experiments.js';
import { smoothScrollTo } from '../utils/scroll.js';
import { DEV } from '../core/env.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const MIDS = [1.5, 4.8, 8.05];                 // where each About block crosses the middle (journey units)
const T_END = 8.7;

export async function initJourney() {
  const work = document.querySelector('.journey-work');
  const about = document.querySelector('.journey-about');
  const canvas = document.querySelector('.journey-gl');
  if (!work || !about || !canvas) return null;
  const root = document.documentElement;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMq = matchMedia('(max-width: 720px)');
  const hud = DEV && new URLSearchParams(location.search).get('debug') === 'fps' ? (await import('../fx/debug-hud.js')).debugHud() : null;
  let mobile = mobileMq.matches;
  const panels = initPanels(work, { mobile });
  const blocks = [...about.querySelectorAll('.about-block')];
  const poster = document.createElement('div');
  poster.className = 'journey-poster';
  poster.setAttribute('aria-hidden', 'true');
  canvas.after(poster);

  let geo = null, renderer = null, glFailed = !('WebGL2RenderingContext' in window), off = null;
  let canvasO = 0, lowPower = false, slowFor = 0, blockKeys = ['', '', ''], blockIn = [false, false, false], warmed = false;

  const isStatic = () => reducedMq.matches || glFailed;
  function applyMode() {
    const st = isStatic();
    root.classList.toggle('journey-static', st);
    driver.setSnap(reducedMq.matches);
    if (st) {
      off?.(); off = null;
      for (const el of [...work.querySelectorAll('.sw-panel, .sw-index, .sw-ground, .sw-ripple i, .sw-bezel'), ...blocks]) el.removeAttribute('style');
      canvas.classList.remove('is-on'); poster.className = 'journey-poster';
      return;
    }
    measure();
    off ??= driver.add(frame);
  }

  // Layout reads: only here (load, resize, fonts, mode changes).
  function measure() {
    // ?exp=portal:N (dev only): the section height follows the portal length ((4.8 + portal) × L + 1 viewports).
    if (exp.portal) work.style.setProperty('height', `${((4.8 + PORTAL_VH) * lengths(mobile).L + 1) * 100}vh`);
    const vh = work.querySelector('.stage').clientHeight || innerHeight;
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    geo = { vh, workTop: top(work), aboutTop: top(about), aboutH: about.offsetHeight, L: lengths(mobile).L, bh: blocks.map((b) => b.offsetHeight) };
    panels.measure(geo.workTop, innerWidth, vh);
    renderer?.resize(innerWidth, innerHeight);
    blockKeys = ['', '', ''];
    driver.sync();
  }

  const gAt = (y) => (y - (geo.aboutTop - geo.vh)) / (geo.vh * geo.L);       // journey position (scene units)
  const yAt = (g) => geo.aboutTop - geo.vh + g * geo.vh * geo.L;

  function placeBlocks(g) {
    const { vh, L } = geo;
    blocks.forEach((b, i) => {
      const h = geo.bh[i];
      let ty = vh / 2 - h / 2 - 1.25 * (g - MIDS[i]) * L * vh;              // 1.25× the scroll speed
      if (i === blocks.length - 1) ty = Math.max(vh / 2 - h / 2, ty);      // the last block rests for the hand-off
      ty = clamp(ty, -h - 40, vh + 40);
      const key = ty.toFixed(1);
      if (key === blockKeys[i]) return;
      blockKeys[i] = key;
      b.style.setProperty('--ty', `${key}px`);
      const inside = ty < vh - 2 && ty > -h + 2;
      if (inside !== blockIn[i]) {                                         // a short slice glitch on entry and exit
        blockIn[i] = inside;
        b.classList.remove('is-glitch');
        requestAnimationFrame(() => b.classList.add('is-glitch'));         // restart without forcing a reflow
      }
    });
  }

  function frame(y, vel, dt, now) {
    if (!geo) return false;
    const { vh, workTop, aboutTop } = geo;
    let busy = false;
    if (y > workTop - vh && y < aboutTop + vh) busy = panels.update(y, vel, now) || busy;
    const g = gAt(y);
    const inAbout = g > -0.05 && y < aboutTop + geo.aboutH;
    if (inAbout) placeBlocks(g);
    // The canvas cross-fade is a function of scroll, not time (Round 5 A3): it rises over the portal's last 30%
    // on one smootherstep curve, so scrubbing back and forth is the same both ways. Past About the scene has
    // already faded to black (renderer uFade), so the canvas simply switches off there.
    const entry = g < 0 ? smoother(FADE, 1, panels.portal) : 1;
    const want = y > workTop && g < T_END + 1.02 && entry > 0;
    canvasO = want ? entry : 0;
    canvas.classList.toggle('is-on', want);
    canvas.style.opacity = canvasO.toFixed(4);
    poster.style.opacity = canvasO.toFixed(4);
    // Pre-warm (A3): once panel [03] is on its way in, draw every scene once, invisibly, in idle time, so the
    // first visible frame of scene 1 has nothing left to compile or upload.
    // Only while the scene is still hidden: a reader who lands mid-scene (a deep link, a refresh) needs no warm-up,
    // and the extra draws would pile onto the scene's own first frames.
    if (!warmed && renderer?.ready && panels.progress > 1.2) { warmed = true; if (!want) renderer.warm(); }
    if (canvasO > 0) {
      if (!renderer && !glFailed) startGL();
      const scene = g < 3.25 ? 1 : g < 6.3 ? 2 : 3;
      const usePoster = !renderer?.ready || (lowPower && scene > 1);
      poster.dataset.scene = String(scene);
      poster.classList.toggle('is-shown', usePoster);
      if (!usePoster) {
        // Scene 1 eases in: exposure 0.15 → 1 with the cross-fade, and the glitch (water ripple, RGB split)
        // holds at 30% through the portal, then rises to full over the first 0.6 viewport of the scene.
        const glitch = g < 0 ? 0.3 : 0.3 + 0.7 * smoother(0, 0.6, g);
        renderer.render(clamp(g, 0, T_END), vel, dt * 1000, now, { exposure: 0.15 + 0.85 * entry, glitch });
        // Phones: if frames stay above 22ms for 2s, scenes 2 and 3 fall back to their posters.
        if (mobile && dt * 1000 > 22 && dt < 0.1) slowFor += dt; else slowFor = Math.max(0, slowFor - dt);
        if (mobile && slowFor > 2) lowPower = true;
      }
      busy = true;                                                         // scenes animate with time while visible
    }
    hud?.stat('journey', `g ${g.toFixed(2)} · portal ${panels.portal.toFixed(2)} · ${renderer?.ready ? 'gl' : 'poster'}`);
    return busy;
  }

  function startGL() {
    import('./gl/renderer.js').then(({ createRenderer }) => {
      if (renderer) return;
      renderer = createRenderer(canvas, { mobile, hud, tier: exp.tier });
      if (!renderer) { glFailed = true; applyMode(); return; }
      renderer.resize(innerWidth, innerHeight);
      renderer.started.then(() => { if (renderer.failed) { glFailed = true; applyMode(); } driver.sync(); });
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glFailed = true; applyMode(); }, { once: true });
      window.__journey.renderer = renderer;
    });
  }

  // Keyboard: a focused link in an About block that is off screen glides its block to the middle.
  blocks.forEach((b, i) => b.addEventListener('focusin', () => {
    if (!geo || isStatic()) return;
    const ty = Number(b.style.getPropertyValue('--ty').replace('px', ''));
    if (ty > geo.vh * 0.1 && ty < geo.vh * 0.9 - geo.bh[i]) return;
    smoothScrollTo(yAt(MIDS[i]), { focus: false });
  }));

  // Start the scenes early: when the Selected Work section is within a viewport (idle time, spread over frames).
  new IntersectionObserver((entries, io) => {
    if (entries[entries.length - 1].isIntersecting && !isStatic()) { io.disconnect(); startGL(); }
  }, { rootMargin: '100% 0px' }).observe(work);

  lowPower = mobile && 'deviceMemory' in navigator && navigator.deviceMemory <= 4;
  reducedMq.addEventListener('change', applyMode);
  mobileMq.addEventListener('change', () => { mobile = mobileMq.matches; panels.setMobile(mobile); measure(); });
  let rz = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => !isStatic() && measure()); });
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => !isStatic() && measure());
  addEventListener('load', () => !isStatic() && measure());

  // Test and poster hooks.
  window.__journey = { yAt, gAt, get geo() { return geo; }, renderer: null, panels, T_END,
    /** Scroll (instantly) to journey position g and let the smoothing settle. */
    jump: (g) => { scrollTo({ top: yAt(g), behavior: 'instant' }); driver.sync(); } };
  applyMode();
  return window.__journey;
}
