// Sticky stages: one rAF-throttled scroll handler writes --progress (0–1) per chapter, keeps the header fade
// in step with the surface under it, and plays the ~400ms chapter cut (glitch.js) at the two edges of the
// Selected Work → About journey: into Selected Work (from the hero) and from Contact to the footer. Inside the
// journey the hand-offs are continuous (the portal and the WebGL transitions), so no cut plays there.
// Normal document scroll throughout.
import { createCut } from './glitch.js';
const clamp = (v) => Math.max(0, Math.min(1, v));

export function initChapters({ reduced = false } = {}) {
  const chapters = [...document.querySelectorAll('.chapter')];
  if (!chapters.length) return;
  const cut = createCut({ reduced });
  // Positions: 0 hero, 1 work, 2 about, 3 contact, 4 footer (the page bottom reached).
  const sections = [document.querySelector('.stage-hero'), ...chapters].filter(Boolean);
  const FOOTER = sections.length;
  const edge = (a, b) => ((a === 0) !== (b === 0)) || ((a === FOOTER) !== (b === FOOTER));   // crossed the hero/work or contact/footer edge
  let current = -1, auto = false, autoFrom = -1, lastCut = -Infinity, ticking = false;

  const position = () => {
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return FOOTER;
    const mid = innerHeight / 2;
    return sections.findIndex((el) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
  };

  function update() {
    ticking = false;
    const vh = innerHeight;
    let surface = '';
    const idx = position();
    if (idx >= 0 && idx !== current) {
      const from = current;
      current = idx;
      if (from >= 0 && !auto && edge(from, idx) && performance.now() - lastCut > 600) { lastCut = performance.now(); cut(); }
      if (from >= 0) document.dispatchEvent(new CustomEvent('chapterchange', { detail: { index: idx } }));   // the header name scrambles (throttled there)
    }
    for (const ch of chapters) {
      const r = ch.getBoundingClientRect();
      const span = Math.max(1, r.height - vh);
      if (r.top <= 40 && r.bottom > 40 && ch.classList.contains('surface-paper') && !ch.hasAttribute('data-dark')) surface = 'paper';   // the portal turns the paper black
      ch.style.setProperty('--progress', clamp(-r.top / span).toFixed(3));
    }
    if (surface) document.documentElement.dataset.surface = surface; else delete document.documentElement.dataset.surface;   // the header fade matches the surface under it
  }
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  document.addEventListener('autoscroll', (e) => {
    if (e.detail.state === 'start') { auto = true; autoFrom = current; return; }
    auto = false;
    update();                                                   // settle `current` before comparing
    if (current !== autoFrom && edge(autoFrom, current)) { lastCut = performance.now(); cut(); }
  });
  update();
}
