// Scramble: a vanilla port of the "Scramble Hover" behavior (no React, no Motion).
//
// Options (data attributes on the element, or opts passed to scramble()):
//   data-scramble-speed        ms per tick (50)
//   data-scramble-iterations   ticks before settling, non-sequential only (10)
//   data-scramble-sequential   reveal one character per tick
//   data-scramble-direction    start | end | center (sequential only)
//   data-scramble-chars        "original" (default: the element's own letters) or a custom pool string
//   data-scramble-class        class for still-scrambled characters (default .is-scrambling)
//   data-scramble-trigger      hover | view | load, space-separated
//   data-scramble-lock         lock the element's width while it runs (buttons)
//
// Rules: only letters scramble (digits, spaces and punctuation like ↗ ≡ > never change, so no number is
// ever shown wrong). The accessible name is pinned to the original in aria-label and the animated glyphs
// are aria-hidden, so screen readers, find-in-page and view-source always get the real text. One shared
// rAF scheduler runs everything, at most 12 at once. prefers-reduced-motion: nothing scrambles.

export const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/\\[]{}#$%&*+=-_';
// Runs that start without the visitor's input (scroll-in, load, chapter change) use letters and digits only:
// measured in Round 4, the symbols made the browser record a layout shift as the cells changed, and shifts that
// don't follow input count toward CLS. Hover runs follow input, so they keep the symbols.
export const SAFE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const STOCK_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
const LETTER = /[A-Za-z]/;
const MAX_ACTIVE = 12;

// Where it runs. Each rule only fills in attributes the element doesn't already set.
const TARGETS = [
  ['.site-header .brand', { trigger: 'hover', sequential: '', direction: 'center', speed: '35', chars: SAFE_POOL }],   // also runs on chapter change
  ['.site-nav > a, .menu-toggle > span, .menu-rows a, .rail-list a', { trigger: 'hover', sequential: '', direction: 'start', chars: POOL }],
  ['.btn, .link-cmd, .footer-top, .back-top, .video-controls button, .video-play', { trigger: 'hover', iterations: '8', chars: 'original', lock: '' }],
  ['.hero-name', { trigger: 'load hover', sequential: '', direction: 'center', chars: SAFE_POOL }],
  // On screen at load, so it shuffles in once the fonts settle (Nick asked for it on Contact too).
  ['h1.contact-title', { trigger: 'load', sequential: '', direction: 'start', chars: SAFE_POOL }],
  ['h1.display, h2.h2, h2.display, h3.h3, .eyebrow, .hero-open', { trigger: 'view', sequential: '', direction: 'start', chars: SAFE_POOL }],
];
const NEVER = '[data-no-scramble]';   // anything opted out

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const prepared = new WeakMap();   // el -> { cells }
const active = new Map();         // el -> run
let raf = 0;

export const activeCount = () => active.size;

function hidden(node, root) {
  for (let n = node.parentElement; n && n !== root.parentElement; n = n.parentElement) {
    if (n.getAttribute('aria-hidden') === 'true' || n.classList.contains('sr-only')) return true;
  }
  return false;
}

// The text a screen reader announces today: everything except aria-hidden subtrees and display:none parts.
function accessibleText(el) {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { out.push(n.data); return; }
    if (n.nodeType !== 1 || n.getAttribute('aria-hidden') === 'true') return;
    const display = getComputedStyle(n).display;
    if (display === 'none') return;
    const gap = n !== el && display !== 'inline';            // grid cells, blocks: "Home" + "01" reads "Home 01"
    if (gap) out.push(' ');
    n.childNodes.forEach(walk);
    if (gap) out.push(' ');
  };
  walk(el);
  return out.join('').replace(/\s+/g, ' ').trim();
}

// Elements that may carry an aria-label. Plain spans, paragraphs and divs may not (ARIA prohibits naming
// generic elements), so for those the original text is kept in a visually hidden copy while a run is active.
const NAMEABLE = 'a[href], button, h1, h2, h3, h4, h5, h6, [role]';

// Split the visible text into per-letter cells once. textContent is unchanged.
function prepare(el) {
  if (prepared.has(el)) return prepared.get(el);
  const named = el.matches(NAMEABLE);
  const original = accessibleText(el);
  if (named && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) el.setAttribute('aria-label', original);
  const cells = [];
  const texts = [];
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) if (t.data.trim() && !hidden(t, el)) texts.push(t);
  for (const t of texts) {
    const wrap = document.createElement('span');
    wrap.className = 'scr';
    if (named) wrap.setAttribute('aria-hidden', 'true');      // the label carries the name
    for (const ch of t.data) {
      if (LETTER.test(ch)) {
        const c = document.createElement('span');
        c.className = 'scr-c';
        c.textContent = ch;
        wrap.append(c);
        cells.push({ node: c, ch });
      } else wrap.append(ch);
    }
    t.replaceWith(wrap);
  }
  const p = { cells, named, original, wraps: [...el.querySelectorAll(':scope .scr')] };
  prepared.set(el, p);
  return p;
}

function optionsFor(el, opts = {}) {
  const d = el.dataset;
  const pick = (k, attr, def) => (opts[k] !== undefined ? opts[k] : d[attr] !== undefined ? d[attr] : def);
  const chars = pick('chars', 'scrambleChars', 'original');
  return {
    speed: Number(pick('speed', 'scrambleSpeed', 50)) || 50,
    iterations: Number(pick('iterations', 'scrambleIterations', 10)) || 10,
    sequential: opts.sequential !== undefined ? !!opts.sequential : d.scrambleSequential !== undefined,
    direction: pick('direction', 'scrambleDirection', 'start'),
    chars: chars === 'stock' ? STOCK_POOL : chars,
    cls: pick('cls', 'scrambleClass', 'is-scrambling'),
    lock: opts.lock !== undefined ? !!opts.lock : d.scrambleLock !== undefined,
  };
}

function settle(run) {
  for (const c of run.cells) { c.node.textContent = c.ch; c.node.classList.remove(run.o.cls); }
  if (run.copy) { run.copy.remove(); run.wraps.forEach((w) => w.removeAttribute('aria-hidden')); }
  if (run.locked) run.el.style.width = '';
  active.delete(run.el);
}

// Stop any run on el and show the original text right away.
export function restore(el) {
  const run = active.get(el);
  if (run) settle(run);
}

function step(run) {
  const { cells, o } = run;
  const pool = o.chars === 'original' ? run.own : o.chars;
  const rand = () => pool[(Math.random() * pool.length) | 0];
  if (o.sequential) {
    const done = run.tick + 1;                    // characters revealed after this tick
    run.order.forEach((ci, k) => {
      const c = cells[ci];
      if (k < done) { c.node.textContent = c.ch; c.node.classList.remove(o.cls); }
      else { c.node.textContent = rand(); c.node.classList.add(o.cls); }
    });
    run.tick++;
    return done >= cells.length;
  }
  if (run.tick >= o.iterations) return true;
  for (const c of cells) { c.node.textContent = rand(); c.node.classList.add(o.cls); }
  run.tick++;
  return false;
}

function loop(now) {
  raf = 0;
  for (const run of [...active.values()]) {
    if (now < run.next) continue;
    run.next = now + run.o.speed;
    if (step(run)) settle(run);
  }
  if (active.size) raf = requestAnimationFrame(loop);
}

function orderFor(n, direction) {
  const idx = [...Array(n).keys()];
  if (direction === 'end') return idx.reverse();
  if (direction === 'center') { const mid = (n - 1) / 2; return idx.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b); }
  return idx;
}

export function scramble(el, opts = {}) {
  if (!el || reduced()) return;
  const { cells } = prepare(el);
  if (!cells.length) return;
  restore(el);                                      // re-triggering restarts cleanly
  if (active.size >= MAX_ACTIVE) settle(active.values().next().value);   // drop the oldest
  const o = optionsFor(el, opts);
  const p = prepared.get(el);
  const run = { el, cells, o, tick: 0, next: 0, order: orderFor(cells.length, o.direction), own: [...new Set(cells.map((c) => c.ch))].join(''), wraps: p.wraps };
  if (!p.named) {                                   // generic element: hide the scrambling glyphs, expose a clean copy
    run.copy = document.createElement('span');
    run.copy.className = 'sr-only scr-copy';
    run.copy.textContent = p.original;
    p.wraps.forEach((w) => w.setAttribute('aria-hidden', 'true'));
    el.append(run.copy);
  }
  if (o.lock) { run.locked = true; el.style.width = `${el.getBoundingClientRect().width}px`; }
  el.dataset.scrambleRuns = String(Number(el.dataset.scrambleRuns || 0) + 1);
  active.set(el, run);
  if (!raf) raf = requestAnimationFrame(loop);
}

// ── Triggers ────────────────────────────────────────────────────────────────
// Home's CSS preloader covers the page for ~1.1s on the first visit; anything that scrambles on load or
// on first view waits for it, so the effect is never played unseen. It also waits for the web fonts: wrapping
// letters while a font swap is in flight can register as a layout shift.
const afterFonts = (fn) => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(fn, preloaderDelay()));
const preloaderDelay = () => {
  const p = document.querySelector('.preloader');
  const settle = 1000;                    // never wrap letters while the first layout is still settling (CLS)
  const until = p && getComputedStyle(p).display !== 'none' ? 1150 : settle;
  return Math.max(0, until - performance.now());
};
let viewIO = null;
function bind(el) {
  if (el.__scrambleBound) return;
  el.__scrambleBound = true;
  const triggers = (el.dataset.scrambleTrigger || 'hover').split(/\s+/);
  const host = el.closest('a, button') || el;
  if (triggers.includes('hover')) {
    host.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') scramble(el); });
    host.addEventListener('pointerleave', () => restore(el));
    host.addEventListener('focus', () => scramble(el));
    host.addEventListener('pointerdown', (e) => {         // touch: once, on the first tap only
      if (e.pointerType === 'touch' && !el.__tapped) { el.__tapped = true; scramble(el); }
    });
  }
  if (triggers.includes('view')) {
    viewIO ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.intersectionRatio < 0.4) { e.target.__seenOut = true; continue; }   // not 40% visible yet
        viewIO.unobserve(e.target);                                    // once per element
        // On screen when the page opened (never scrolled to): leave it alone. Wrapping letters in text that has
        // already painted above the fold registers as a layout shift, and it isn't "scrolling to it" anyway.
        if (!e.target.__seenOut && scrollY === 0) { e.target.dataset.scrambleSkipped = 'in-view-at-load'; continue; }
        const el = e.target;
        afterFonts(() => scramble(el));
      }
    }, { threshold: 0.4 });
    viewIO.observe(el);
  }
  if (triggers.includes('load')) afterFonts(() => scramble(el));
}

export function initScramble(root = document) {
  if (reduced()) return;
  for (const [selector, opts] of TARGETS) {
    for (const el of root.querySelectorAll(selector)) {
      if (el.closest(NEVER)) continue;
      const d = el.dataset;
      if (d.scrambleTrigger === undefined) d.scrambleTrigger = opts.trigger;
      if (opts.sequential !== undefined && d.scrambleSequential === undefined) d.scrambleSequential = '';
      if (opts.direction && d.scrambleDirection === undefined) d.scrambleDirection = opts.direction;
      if (opts.speed && d.scrambleSpeed === undefined) d.scrambleSpeed = opts.speed;
      if (opts.iterations && d.scrambleIterations === undefined) d.scrambleIterations = opts.iterations;
      if (opts.chars && d.scrambleChars === undefined) d.scrambleChars = opts.chars;
      if (opts.lock !== undefined && d.scrambleLock === undefined) d.scrambleLock = '';
    }
  }
  for (const el of root.querySelectorAll('[data-scramble-trigger]')) if (!el.closest(NEVER)) bind(el);
}

// The header name also scrambles once per chapter change, at most every 1.5s.
let lastChapterRun = -Infinity;
document.addEventListener('chapterchange', () => {
  const now = performance.now();
  if (now - lastChapterRun < 1500) return;
  lastChapterRun = now;
  scramble(document.querySelector('.site-header .brand'));
});
