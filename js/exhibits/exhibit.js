// Exhibit frame: every figure[data-exhibit] is a small animated, inspectable replica built in HTML/SVG.
// - Its module and css/exhibits.css load (dynamic import) the first time it comes within 200px of the viewport.
// - It draws itself in once, when 35% visible. ↻ REPLAY runs it again. A hint chip disappears on first use.
// - Reduced motion: the final state renders at once; inspecting still works.
// Module contract: export function mount(stage, { reduced }) -> { play(signal), final() }.
import { reducedMotion } from './svg.js';

const MODULES = {
  'e1-home': () => import('./e1-home.js'),
  'e2-company': () => import('./e2-company.js'),
  'e3-mobile': () => import('./e3-mobile.js'),
  'e4-email': () => import('./e4-email.js'),
  'e5-ncl': () => import('./e5-ncl.js'),
  'e6-csaw': () => import('./e6-csaw.js'),
};

let css = null;
export function loadCss() {
  css ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/exhibits.css';
    link.onload = resolve;
    link.onerror = resolve;
    document.head.append(link);
  });
  return css;
}

function controls(fig, stage, run) {
  const head = fig.querySelector('.ex-head');
  const hint = document.createElement('span');
  hint.className = 'ex-hint label';
  hint.textContent = 'Hover / tap to inspect';
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'ex-replay label';
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = '↻';
  replay.append(glyph, ' Replay');
  replay.setAttribute('aria-label', `Replay: ${fig.querySelector('.ex-cap')?.textContent.trim() || 'exhibit'}`);
  replay.addEventListener('click', run);
  head.append(hint, replay);
  const dismiss = () => { hint.classList.add('is-gone'); stage.removeEventListener('pointerdown', dismiss); stage.removeEventListener('pointermove', dismiss); stage.removeEventListener('keydown', dismiss); };
  stage.addEventListener('pointerdown', dismiss);
  stage.addEventListener('pointermove', dismiss);
  stage.addEventListener('keydown', dismiss);
}

async function mount(fig) {
  const load = MODULES[fig.dataset.exhibit];
  if (!load || fig.dataset.mounted) return;
  fig.dataset.mounted = 'loading';
  const [mod] = await Promise.all([load(), loadCss()]);
  const stage = fig.querySelector('.ex-stage');
  const reduced = reducedMotion();
  const api = await mod.mount(stage, { reduced, fig });
  let ctrl = null;
  const run = () => {
    ctrl?.abort();
    ctrl = new AbortController();
    if (reduced) { api.final(); return; }
    fig.dataset.state = 'playing';
    Promise.resolve(api.play(ctrl.signal)).then(() => { if (!ctrl.signal.aborted) fig.dataset.state = 'done'; });
  };
  controls(fig, stage, run);
  fig.dataset.mounted = 'true';
  if (reduced) { api.final(); fig.dataset.state = 'done'; return; }
  // 35% visible, or (for exhibits taller than the screen) filling half the viewport.
  const once = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.intersectionRatio >= 0.35 || e.intersectionRect.height >= innerHeight * 0.5)) { once.disconnect(); run(); }
  }, { threshold: [0, 0.1, 0.2, 0.35, 0.5] });
  once.observe(stage);
}

export function initExhibits(root = document) {
  const figs = [...root.querySelectorAll('[data-exhibit]')];
  if (!figs.length) return;
  const near = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { near.unobserve(e.target); mount(e.target); }
  }, { rootMargin: '200px 0px' });
  figs.forEach((f) => near.observe(f));
}
