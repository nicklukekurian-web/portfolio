// One eased scroll for every in-page jump: the header name, SCROLL, the Proof index rail,
// #anchors, the Home menu item and BACK TO TOP. Works with the sticky-stage layout (it just
// moves the document), cancels the moment the reader wheels, touches or presses a key, and
// jumps instantly under prefers-reduced-motion.
//
// While it runs, <html data-autoscroll> is set and an `autoscroll` event fires
// (detail.state: 'start' | 'end' | 'cancel') so the chapter glitch can skip the
// in-between cuts and play one on arrival.

const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Ease-in-out cubic.
export const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);
// Scaled to distance: about 0.3 ms per pixel on top of 300 ms, never under 450 ms or over 1400 ms.
export const durationFor = (distance) => clamp(300 + Math.abs(distance) * 0.3, 450, 1400);

export const TOP = Symbol('top');
let run = null;
export const isAutoScrolling = () => run !== null;

const root = document.documentElement;
function announce(state) {
  if (state === 'start') root.setAttribute('data-autoscroll', '');
  else root.removeAttribute('data-autoscroll');
  document.dispatchEvent(new CustomEvent('autoscroll', { detail: { state } }));
}

const CANCEL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'];
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
function onUserInput(e) {
  if (e.type === 'keydown' && MODIFIERS.has(e.key)) return;
  cancelSmoothScroll();
}

export function cancelSmoothScroll() {
  if (!run) return;
  cancelAnimationFrame(run.raf);
  for (const t of CANCEL_EVENTS) removeEventListener(t, onUserInput);
  run.settle(false);
  run = null;
  announce('cancel');
}

// Where the document should scroll for `el`, leaving room for the fixed header.
function topFor(el) {
  if (el === TOP) return 0;
  const cs = getComputedStyle(el);
  const margin = parseFloat(cs.scrollMarginTop) || 0;
  // Sticky stages sit flush with the top of the viewport; other targets keep the page's scroll-padding.
  const padding = el.classList.contains('chapter') ? 0 : parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
  return el.getBoundingClientRect().top + scrollY - (margin || padding);
}

function focusTarget(el) {
  if (el === TOP) el = document.getElementById('main') || document.body;
  if (!el.matches('a[href], button, input, select, textarea, summary, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

// target: an element, TOP, or a y offset in px. Resolves true on arrival, false if the reader interrupts.
// opts.hash: the URL hash to push ('' pushes the page URL without a hash); omit to leave the URL alone.
// opts.focus: move focus to the target on arrival (default true; skipped if the reader interrupts).
export function smoothScrollTo(target, { hash, focus = true } = {}) {
  cancelSmoothScroll();
  const max = Math.max(0, root.scrollHeight - innerHeight);
  const to = clamp(typeof target === 'number' ? target : topFor(target), 0, max);
  if (hash !== undefined) {
    const next = location.pathname + location.search + hash;
    if (next !== location.pathname + location.search + location.hash) history.pushState(null, '', next);
  }
  const arrive = () => { if (focus && typeof target !== 'number') focusTarget(target); };

  const from = scrollY;
  if (prefersReduced() || Math.abs(to - from) < 2) {
    scrollTo({ top: to, behavior: 'instant' });
    arrive();
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const duration = durationFor(to - from);
    const t0 = performance.now();
    run = { raf: 0, settle: resolve };
    announce('start');
    for (const t of CANCEL_EVENTS) addEventListener(t, onUserInput, { passive: true });
    const step = (now) => {
      const p = clamp((now - t0) / duration, 0, 1);
      scrollTo({ top: from + (to - from) * ease(p), behavior: 'instant' });
      if (p < 1) { run.raf = requestAnimationFrame(step); return; }
      for (const t of CANCEL_EVENTS) removeEventListener(t, onUserInput);
      run = null;
      announce('end');
      arrive();
      resolve(true);
    };
    run.raf = requestAnimationFrame(step);
  });
}

// ── Links ───────────────────────────────────────────────────────────────────
const normal = (path) => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1');

// Does this link point at the page we are already on (with or without a #hash)?
export function linksToThisPage(a) {
  if (!a || !a.href || a.hasAttribute('download') || (a.target && a.target !== '_self')) return false;
  const url = new URL(a.href, location.href);
  return url.origin === location.origin && normal(url.pathname) === normal(location.pathname);
}

// Turn same-page links into eased scrolls. A link with no hash, or #main / #top, goes to the top of the page.
export function initSmoothScroll() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!linksToThisPage(a)) return;
    const hash = decodeURIComponent(new URL(a.href, location.href).hash.slice(1));
    const toTop = !hash || hash === 'main' || hash === 'top';
    const el = toTop ? TOP : document.getElementById(hash);
    if (!el) return;                                          // unknown anchor: leave it to the browser
    e.preventDefault();
    smoothScrollTo(el, { hash: toTop ? '' : `#${hash}` });
  });
}
