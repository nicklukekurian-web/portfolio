// Live panel content for Home's Selected Work (Round 4 D1): no screenshots.
//  - Internlog: the Proof E1 replica in preview mode (no controls; it plays by itself; still hover-reactive).
//  - FlyRank: a mini bar chart drawn from data/flyrank.json; the hand-written rule is the amber BASELINE bar.
//  - NCL: the rank counter and the nine completion bars, read from data/ncl.json (never a stale number).
// Each preview sits in an aria-hidden layer; a click on it follows the panel's own link (panels.js).
import { s, html, raw, frag, countUp, fmtInt, reducedMotion } from '../exhibits/svg.js';
import { loadCss } from '../exhibits/exhibit.js';

const json = (url) => fetch(url).then((r) => r.json());

function tipFor(box) {
  const tip = document.createElement('div');
  tip.className = 'sw-tip';
  tip.hidden = true;
  box.append(tip);
  return (text, x, y) => {
    if (!text) { tip.hidden = true; return; }
    tip.textContent = text;
    tip.hidden = false;
    tip.style.setProperty('--x', `${x}px`);
    tip.style.setProperty('--y', `${y}px`);
  };
}

async function flyrank(live) {
  const d = await json('/data/flyrank.json');
  const W = 640, H = 360, x0 = 70, x1 = 610, y0 = 300, y1 = 64;
  const y = (v) => y0 - (y0 - y1) * v;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pv-chart', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(s('text', { x: x0, y: 34, class: 'pv-title' }, `${d.metric} · K=${d.k} · in-sample`));
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(s('line', { x1: x0, x2: x1, y1: y(v), y2: y(v), class: v ? 'pv-grid' : 'pv-axis' }));
    svg.append(s('text', { x: x0 - 12, y: y(v) + 4, class: 'pv-tick', 'text-anchor': 'end' }, v.toFixed(2)));
  }
  const band = (x1 - x0) / d.results.length;
  const bars = d.results.map((r, i) => {
    const cx = x0 + band * (i + 0.5), bw = band * 0.46;
    const g = s('g', { class: `pv-bar${r.baseline ? ' is-baseline' : ''}` });
    g.append(s('rect', { x: cx - bw / 2, y: y(r.value), width: bw, height: y0 - y(r.value) }));
    g.append(s('text', { x: cx, y: y(r.value) - 10, 'text-anchor': 'middle', class: 'pv-val' }, r.value.toFixed(2)));
    g.append(s('text', { x: cx, y: y0 + 22, 'text-anchor': 'middle', class: 'pv-lab' }, r.baseline ? 'BASELINE' : r.short));
    if (r.baseline) g.append(s('text', { x: cx, y: y0 + 40, 'text-anchor': 'middle', class: 'pv-sub' }, r.label));
    g.dataset.tip = `${r.label} · ${d.metric} ${r.value.toFixed(2)} · in-sample`;
    svg.append(g);
    return g;
  });
  live.append(svg);
  live.classList.add('pv-flyrank');
  const tip = tipFor(live);
  live.addEventListener('pointermove', (e) => {
    const g = e.target.closest('.pv-bar');
    bars.forEach((b) => b.classList.toggle('is-hot', b === g));
    if (!g) return tip('');
    const r = live.getBoundingClientRect(), b = g.querySelector('rect').getBoundingClientRect();
    tip(g.dataset.tip, b.left - r.left + b.width / 2, b.top - r.top);
  });
  live.addEventListener('pointerleave', () => { tip(''); bars.forEach((b) => b.classList.remove('is-hot')); });
  return () => live.classList.add('is-grown');              // bars grow on view
}

async function ncl(live) {
  const d = await json('/data/ncl.json');
  const top = Math.round((d.rank / d.total) * 100);
  const cats = [...d.categories].sort((a, b) => b.completion - a.completion);
  live.classList.add('pv-ncl');
  live.append(frag(html`
    <div class="pv-ncl-head">
      <p class="pv-k">NCL Fall 2026 · Individual Game</p>
      <p class="pv-rank"><span class="pv-rank-n">${fmtInt(d.rank)}</span><span class="pv-rank-of"> / ${fmtInt(d.total)}</span></p>
      <p class="pv-k">Top ~${top}% · ${fmtInt(d.points)} / ${fmtInt(d.maxPoints)} points</p>
    </div>
    <ul class="pv-bars">${raw(cats.map((c, i) => html`<li class="n${i + 1}" data-tip="${c.label} · ${c.completion}% complete · ${c.points} / ${c.max}"><span class="pv-bl">${c.short}</span><span class="pv-bt"><i class="pv-bf" data-w="${c.completion}"></i></span><span class="pv-bv">${c.completion}%</span></li>`).join(''))}</ul>`));
  live.querySelectorAll('.pv-bf').forEach((f) => f.style.setProperty('--w', `${f.dataset.w}%`));
  const tip = tipFor(live);
  live.addEventListener('pointermove', (e) => {
    const li = e.target.closest('.pv-bars li');
    live.querySelectorAll('.pv-bars li').forEach((x) => x.classList.toggle('is-hot', x === li));
    if (!li) return tip('');
    const r = live.getBoundingClientRect(), b = li.getBoundingClientRect();
    tip(li.dataset.tip, b.left - r.left + b.width / 2, b.top - r.top);
  });
  live.addEventListener('pointerleave', () => tip(''));
  const n = live.querySelector('.pv-rank-n');
  return () => {
    live.classList.add('is-grown');
    if (!reducedMotion()) countUp(n, d.rank, { from: d.total, dur: 1400 });
  };
}

async function internlog(live) {
  await loadCss();
  const mod = await import('../exhibits/e1-home.js');
  const stage = document.createElement('div');
  stage.className = 'ex-stage pv-il';
  live.append(stage);
  const api = await mod.mount(stage, { preview: true });
  let played = false;
  return () => { if (played) return; played = true; reducedMotion() ? api.final() : api.play(new AbortController().signal); };
}

const BUILD = { internlog, flyrank, ncl };

// Mount every preview once the section is near; play each the first time its panel comes to rest.
export function initPreviews(section) {
  const lives = [...section.querySelectorAll('[data-preview]')];
  const ready = new Map();
  const mountAll = () => lives.forEach((live) => {
    const build = BUILD[live.dataset.preview];
    if (build && !ready.has(live)) ready.set(live, build(live).catch(() => null));
  });
  new IntersectionObserver((entries, io) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); mountAll(); }
  }, { rootMargin: '100% 0px' }).observe(section);
  return {
    /** Panel i came to rest: play its preview (once). */
    play(i) {
      const live = section.querySelector(`.sw-panel[data-panel="${i}"] [data-preview]`);
      if (!live) return;
      if (!ready.has(live)) mountAll();
      ready.get(live)?.then((go) => go?.());
    },
  };
}
