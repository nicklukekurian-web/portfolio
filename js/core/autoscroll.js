// Round 5 A2: SCROLL ↓ starts a steady automatic scroll down the page.
// - One rAF loop with real dt (clamped to 50 ms so a stalled frame can't jump). The position is a float written to
//   the document scroll, which is the target the Round 4 scroll driver smooths, so the journey glides with it.
// - Eases in over 700 ms, then holds a constant speed; STOP ■ or Escape eases out over 500 ms. Near the bottom the
//   ease-out starts early enough to settle exactly on the last pixel.
// - Hands control back at once (no further writes) on wheel, touch, scroll keys, a scrollbar grab, a hidden tab,
//   leaving the page, or another in-page scroll. It never resumes by itself.
// - prefers-reduced-motion: no auto-scroll. The button reads NEXT ↓ and jumps to the next chapter (instantly).
// With JS off the original link to #work stays.
import { smoothScrollTo, cancelSmoothScroll } from '../utils/scroll.js';
import { exp } from './experiments.js';

/** The one place to tune the pace: px/s = vh × viewport height, clamped to [min, max]; ramps in ms. */
export const PACE = { vh: 0.28, min: 180, max: 340, rampIn: 700, rampOut: 500 };
export const paceFor = (viewportHeight) => (exp.pace ? Number(exp.pace) : Math.min(PACE.max, Math.max(PACE.min, PACE.vh * viewportHeight)));   // ?exp=pace:N (dev only)

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'PageUp', 'PageDown', 'Home', 'End']);
const root = document.documentElement;
const maxScroll = () => Math.max(0, root.scrollHeight - innerHeight);

function setLabel(el, word, glyph) {
  const g = document.createElement('span');
  g.setAttribute('aria-hidden', 'true');
  g.textContent = glyph;
  el.replaceChildren(`${word} `, g);
}

export function initAutoScroll(cue) {
  if (!cue || cue.dataset.autoscroll !== undefined) return null;
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = cue.className;
  btn.dataset.autoscroll = '';
  cue.replaceWith(btn);

  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'label autoscroll-stop';
  stopBtn.setAttribute('aria-label', 'Stop auto-scroll');
  setLabel(stopBtn, 'Stop', '■');
  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  document.body.append(stopBtn, live);

  let state = 'idle';                 // idle | running | stopping
  let v = 0, vFrom = 0, pos = 0, t0 = 0, last = 0, raf = 0, statusInView = true;

  const ours = (t) => t instanceof Node && (btn.contains(t) || stopBtn.contains(t));
  const say = (text) => { live.textContent = text; };

  function render() {
    const on = state === 'running';
    if (reducedMq.matches) {
      btn.removeAttribute('aria-pressed');
      btn.setAttribute('aria-label', 'Next chapter');
      setLabel(btn, 'Next', '↓');
    } else {
      btn.setAttribute('aria-pressed', String(on));
      // The name carries the visible word (WCAG 2.5.3, found by axe in Round 5 B5): "Auto-scroll" while it reads
      // SCROLL, "Stop auto-scroll" while it reads STOP.
      btn.setAttribute('aria-label', on ? 'Stop auto-scroll' : 'Auto-scroll');
      setLabel(btn, on ? 'Stop' : 'Scroll', on ? '■' : '↓');
    }
    btn.dataset.state = state;
    stopBtn.classList.toggle('is-on', on && !statusInView);
  }

  // ── Input that hands control back ───────────────────────────────────────
  const onWheel = () => halt();
  const onTouch = (e) => { if (!ours(e.target)) halt(); };
  const onPointer = (e) => {                                  // a grab on the page scrollbar
    if (e.clientX >= root.clientWidth || e.clientY >= root.clientHeight) halt();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { soften(); return; }
    if (!SCROLL_KEYS.has(e.key)) return;                      // Tab and the rest are fine
    if (ours(e.target) && (e.key === ' ' || e.key === 'Spacebar')) return;   // that press activates our button
    halt();
  };
  const onHidden = () => { if (document.hidden) halt(); };
  const onOtherScroll = (e) => { if (e.detail?.state === 'start') halt(); };
  const LISTEN = [['wheel', onWheel], ['touchstart', onTouch], ['pointerdown', onPointer], ['keydown', onKey], ['pagehide', () => halt()]];
  function listen(on) {
    const m = on ? 'addEventListener' : 'removeEventListener';
    for (const [type, fn] of LISTEN) window[m](type, fn, { passive: true, capture: true });
    document[m]('visibilitychange', onHidden);
    document[m]('autoscroll', onOtherScroll);
  }

  // ── The loop ────────────────────────────────────────────────────────────
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const max = maxScroll();
    if (Math.abs(scrollY - pos) > 3 && scrollY < max - 1) { halt(); return; }   // moved by someone else
    const V = paceFor(innerHeight);
    if (state === 'running') {
      const p = Math.min(1, (now - t0) / PACE.rampIn);
      v = V * (1 - Math.cos(Math.PI * p)) / 2;
      if (max - pos <= v * (PACE.rampOut / 1000) / 2) soften(now);          // a cosine ease-out covers v·T/2
    }
    if (state === 'stopping') {
      const p = Math.min(1, (now - t0) / PACE.rampOut);
      v = p >= 1 ? 0 : vFrom * (1 + Math.cos(Math.PI * p)) / 2;
    }
    pos = Math.min(max, pos + v * dt);
    if (state === 'stopping' && max - pos < 1.5) pos = max;                 // settle on the last pixel
    scrollTo({ top: pos, behavior: 'instant' });
    if (pos >= max || (state === 'stopping' && v === 0)) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelSmoothScroll();
    pos = scrollY;
    if (pos >= maxScroll() - 1) return;
    const V = paceFor(innerHeight);
    const now = performance.now();
    // Resuming during an ease-out keeps the current speed (no jolt): pick the ramp time that gives speed v.
    t0 = state === 'stopping' && v > 0 ? now - PACE.rampIn * Math.acos(Math.max(-1, 1 - (2 * v) / V)) / Math.PI : now;
    if (state === 'idle') { last = 0; listen(true); }
    state = 'running';
    root.setAttribute('data-autoscrolling', '');
    render();
    say('Auto-scroll on');
    if (!raf) raf = requestAnimationFrame(frame);
  }

  // A deliberate stop (STOP, Escape, the bottom): the control flips now, the motion eases out.
  function soften(now = performance.now()) {
    if (state !== 'running') return;
    state = 'stopping';
    vFrom = v;
    t0 = now;
    render();
    say('Auto-scroll off');
  }

  // The reader took over: no more writes from this frame on.
  function halt() {
    if (state === 'idle') return;
    const was = state;
    cancelAnimationFrame(raf);
    finish();
    if (was === 'running') say('Auto-scroll off');
  }

  function finish() {
    state = 'idle';
    v = 0;
    raf = 0;
    listen(false);
    root.removeAttribute('data-autoscrolling');
    render();
  }

  const nextChapter = () => [...document.querySelectorAll('main > section[id]')].find((s) => s.getBoundingClientRect().top > 4);

  btn.addEventListener('click', () => {
    if (reducedMq.matches) {
      const next = nextChapter();
      if (next) smoothScrollTo(next, { hash: `#${next.id}` });
      return;
    }
    if (state === 'running') soften(); else start();
  });
  stopBtn.addEventListener('click', () => { soften(); btn.focus({ preventScroll: true }); });

  // The floating STOP shows only once the status bar (and the button in it) has scrolled away.
  const bar = btn.closest('.hero-status') || btn;
  new IntersectionObserver(([e]) => { statusInView = e.isIntersecting; render(); }).observe(bar);
  reducedMq.addEventListener('change', () => { halt(); render(); });

  render();
  const api = {
    get state() { return state; }, get speed() { return v; }, get pos() { return pos; },
    start, stop: () => soften(), halt,
  };
  window.__autoscroll = api;
  return api;
}
