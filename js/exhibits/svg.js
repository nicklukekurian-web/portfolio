// Shared helpers for the exhibits: DOM/SVG builders, scales, count-up, typing, FLIP, a clamped tooltip and
// pointer + keyboard + touch inspection. Everything respects prefers-reduced-motion.
import { escapeHtml } from '../utils/escape.js';

export const NS = 'http://www.w3.org/2000/svg';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function s(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

// Tagged template: interpolations are escaped, so data can never inject markup. raw() opts a value out.
export function html(strings, ...vals) {
  return strings.reduce((out, str, i) => out + str + (i < vals.length ? (vals[i]?.__raw ?? escapeHtml(vals[i])) : ''), '');
}
export const raw = (str) => ({ __raw: str });
// The site's one HTML sink (Round 5 B7). Under the CSP's `require-trusted-types-for 'script'` only this policy may
// create HTML, and it is only ever given markup built by html`` above, whose interpolations are escaped.
const policy = globalThis.trustedTypes?.createPolicy?.('portfolio-html', { createHTML: (markup) => markup });
export function frag(markup) {
  const t = document.createElement('template');
  t.innerHTML = policy ? policy.createHTML(markup) : markup;
  return t.content;
}

export const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const linePath = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

export function wait(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// Count a number up with easeOutCubic. format(v) renders each frame; the final frame is always exact.
export function countUp(el, to, { dur = 1100, from = 0, format = fmtInt, signal } = {}) {
  return new Promise((resolve) => {
    if (reducedMotion()) { el.textContent = format(to); resolve(); return; }
    const t0 = performance.now();
    const tick = (now) => {
      if (signal?.aborted) { el.textContent = format(to); resolve(); return; }
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = format(p < 1 ? from + (to - from) * easeOutCubic(p) : to);
      if (p < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}

// Reveal text one character at a time; it always ends on the exact string.
export function typeText(el, text, { speed = 32, signal } = {}) {
  el.textContent = text;
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) => {
    let i = 0;
    el.textContent = '';
    const timer = setInterval(() => {
      if (signal?.aborted || i >= text.length) { clearInterval(timer); el.textContent = text; resolve(); return; }
      el.textContent = text.slice(0, ++i);
    }, speed);
  });
}

// FLIP: measure, change the DOM, then animate each element from where it was.
export function flip(els, mutate, { dur = 320 } = {}) {
  const before = new Map(els.map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  if (reducedMotion()) return;
  for (const e of els) {
    if (e.hidden) continue;
    const a = before.get(e), b = e.getBoundingClientRect();
    if (!a.width && !a.height) { e.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: 'ease-out' }); continue; }
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.2,.7,.1,1)' });
  }
}

// One tooltip per exhibit, positioned inside `box` and clamped so it never leaves the frame.
export function tooltip(box) {
  const tip = document.createElement('div');
  tip.className = 'ex-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  box.append(tip);
  return {
    show(text, x, y) {
      tip.textContent = text;
      tip.hidden = false;
      const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = `${Math.max(4, Math.min(bw - tw - 4, x - tw / 2))}px`;
      tip.style.top = `${Math.max(4, y - th - 10)}px`;
    },
    hide() { tip.hidden = true; },
    el: tip,
  };
}

// Inspect a set of marks: pointer move snaps to the nearest, arrows step, Esc clears, a tap pins.
// items() returns [{ x, y, text }] in `surface` CSS px. onFocus(i | -1) styles the marks. A polite live
// region repeats the value for screen-reader users who step with the arrow keys.
export function inspect(surface, items, { box = surface, onFocus = () => {}, axis = 'xy', label } = {}) {
  const tt = tooltip(box);
  const live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  box.append(live);
  let cur = -1, pinned = false;
  surface.tabIndex = 0;
  if (label) surface.setAttribute('aria-label', label);
  const at = (i, announce = false) => {
    cur = i;
    onFocus(i);
    if (i < 0) { tt.hide(); return; }
    const it = items()[i];
    const sr = surface.getBoundingClientRect(), br = box.getBoundingClientRect();
    tt.show(it.text, it.x + sr.left - br.left, it.y + sr.top - br.top);
    if (announce) live.textContent = it.text;
  };
  const nearest = (e) => {
    const r = surface.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = Infinity;
    items().forEach((it, i) => {
      const d = axis === 'x' ? Math.abs(it.x - x) : axis === 'y' ? Math.abs(it.y - y) : Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };
  surface.addEventListener('pointermove', (e) => { if (!pinned && e.pointerType !== 'touch') at(nearest(e)); });
  surface.addEventListener('pointerleave', () => { if (!pinned) at(-1); });
  surface.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { pinned = true; at(nearest(e)); } });
  surface.addEventListener('keydown', (e) => {
    const n = items().length;
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); at((cur + 1) % n, true); }
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); at((cur - 1 + n) % n, true); }
    else if (e.key === 'Escape') { pinned = false; at(-1); }
  });
  surface.addEventListener('blur', () => { pinned = false; at(-1); });
  return { at, clear: () => at(-1) };
}
