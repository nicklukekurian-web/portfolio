// SVG bar charts drawn from the <table> inside each figure[data-chart].
// The table stays in the DOM (visually hidden) as the accessible data; the SVG is aria-hidden.
import { inspect } from './exhibits/svg.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs, text) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

function rows(table) {
  return [...table.tBodies[0].rows].map((r) => [r.cells[0].textContent.trim(), ...[...r.cells].slice(1).map((c) => Number(c.textContent))]);
}

// Zero-based: a bar is `value / max` of the track, clamped to the track.
export function barLength(value, max, width) {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return width * Math.min(Math.max(value / max, 0), 1);
}

export function axisTicks() {
  return [0, 0.25, 0.5, 0.75, 1].map((value) => ({ value, label: value === 0 ? '0' : value === 1 ? '1.0' : String(value) }));
}

// One horizontal bar per row. `value` and `max` pick columns; `tone` picks a fill class;
// `axis` adds gridlines and tick labels along the bottom.
function barChart(figure, data, { value, max, fmt, tone, stamp, axis }) {
  const narrow = figure.clientWidth < 480;
  const W = narrow ? 360 : 640, labelW = narrow ? 0 : 170, rowH = narrow ? 44 : 30, top = stamp ? 30 : 6;
  const barX = labelW, barW = W - labelW - 56;
  const rowsBottom = top + data.length * rowH;
  const height = rowsBottom + (axis ? 30 : 6);
  const svg = el('svg', { viewBox: `0 0 ${W} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
  if (stamp) svg.append(el('text', { x: W, y: 14, 'text-anchor': 'end', class: 'stamp' }, stamp));
  if (axis) {
    for (const t of axisTicks()) {
      const x = barX + barW * t.value;
      svg.append(el('line', { class: 'tick-line grid', x1: x, x2: x, y1: top - 2, y2: rowsBottom + 2 }));
      svg.append(el('text', { class: 'tick', x, y: rowsBottom + 18, 'text-anchor': 'middle' }, t.label));
    }
  }
  data.forEach((row, i) => {
    const y = top + i * rowH + (narrow ? 18 : 6);
    const len = barLength(value(row), max(row), barW);
    svg.append(el('text', { x: 0, y: narrow ? y - 6 : y + 13 }, row[0]));
    svg.append(el('rect', { class: 'bar-track', x: barX, y, width: barW, height: 16 }));
    svg.append(el('rect', { class: `bar ${tone(row, i)}`, x: barX, y, width: len, height: 16 }));
    svg.append(el('text', { class: 'val', x: barX + len + 8, y: y + 13 }, fmt(row)));
  });
  return svg;
}

// NCL points by category: an HTML grid (label | bar | value) so labels wrap and are never clipped.
// Each bar has its own neon (decoration only: the value is always printed), the weakest category carries
// a "NEXT FOCUS" text marker, and hover or keyboard focus shows "Category · points / out of · percent".
function nclBars(figure, data) {
  const wrap = document.createElement('div');
  wrap.className = 'ncl-bars';
  wrap.setAttribute('role', 'list');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  const weakest = data.reduce((w, r) => (r[1] / r[2] < w[1] / w[2] ? r : w), data[0]);
  const show = (row, text) => {
    tip.textContent = text;
    tip.hidden = false;
    const f = row.querySelector('.ncl-fill').getBoundingClientRect(), box = figure.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 8, Math.max(8, f.right - box.left))}px`;
    tip.style.top = `${f.top - box.top}px`;
  };
  data.forEach((r, i) => {
    const [label, pts, max] = r;
    const pct = Math.round((pts / max) * 100);
    const row = document.createElement('div');
    row.className = 'ncl-row';
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${label}: ${pts} of ${max} points, ${pct}%${r === weakest ? ', next focus' : ''}`);
    row.style.setProperty('--c', `var(--neon-${i + 1})`);
    row.style.setProperty('--p', String(pts / max));
    row.style.setProperty('--i', String(i));
    const name = document.createElement('span');
    name.className = 'ncl-label';
    name.textContent = label;
    if (r === weakest) { const n = document.createElement('span'); n.className = 'ncl-next'; n.textContent = '▸ NEXT FOCUS'; name.append(' ', n); }
    const track = document.createElement('span');
    track.className = 'ncl-track';
    const fill = document.createElement('span');
    fill.className = 'ncl-fill';
    track.append(fill);
    const val = document.createElement('span');
    val.className = 'ncl-val';
    val.textContent = `${pts}/${max}`;
    row.append(name, track, val);
    const text = `${label} · ${pts} / ${max} · ${pct}%`;
    row.addEventListener('pointerenter', () => show(row, text));
    row.addEventListener('focus', () => show(row, text));
    row.addEventListener('pointerleave', () => { tip.hidden = true; });
    row.addEventListener('blur', () => { tip.hidden = true; });
    wrap.append(row);
  });
  wrap.append(tip);
  return wrap;
}

const CHARTS = {
  ncl: (figure, data) => nclBars(figure, data),
  // Neutral colors only: the rule in grey, both trees in the accent. No bar is singled out as the winner.
  p50: (figure, data) => barChart(figure, data, {
    value: (r) => r[1], max: () => 1, fmt: (r) => r[1].toFixed(2), stamp: 'IN-SAMPLE', axis: true,
    tone: (r) => (/rule/i.test(r[0]) ? 'is-rule' : 'is-tree'),
  }),
};

// Grow the bars once, the first time the chart is mostly on screen. Stepped, off under reduced motion.
function growOnView(figure) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) return;
  figure.classList.add('js-grow');
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      figure.classList.add('is-in');
      io.disconnect();
    }
  }, { threshold: 0.4 });
  io.observe(figure);
}

export function initCharts() {
  for (const figure of document.querySelectorAll('figure[data-chart]')) {
    const make = CHARTS[figure.dataset.chart];
    const table = figure.querySelector('table');
    if (!make || !table) continue;
    const data = rows(table);
    let svg = null, lastNarrow = null;
    const draw = () => {
      const narrow = figure.clientWidth < 480;
      if (narrow === lastNarrow) return;
      lastNarrow = narrow;
      const next = make(figure, data);
      if (svg) svg.replaceWith(next); else table.after(next);
      svg = next;
      figure.classList.add('is-rendered');
    };
    draw();
    growOnView(figure);
    // FlyRank: neutral hover and keyboard tooltips ("Rule · Precision@50 0.68 · in-sample"). No winner is singled out.
    if (figure.dataset.chart === 'p50') {
      inspect(figure, () => [...figure.querySelectorAll('svg .bar')].map((bar, i) => {
        const a = bar.getBoundingClientRect(), b = figure.getBoundingClientRect();
        return { x: a.left - b.left + a.width, y: a.top - b.top, text: `${data[i][0]} · Precision@50 ${data[i][1].toFixed(2)} · in-sample` };
      }), { label: 'Precision@50 chart, in-sample. Arrow keys read each bar.', onFocus: (i) => {
        figure.querySelectorAll('svg .bar').forEach((bar, j) => bar.classList.toggle('is-hot', j === i));
      } });
    }
    new ResizeObserver(draw).observe(figure);
  }
}
