// E6 · CSAW CTF 2026. The prompt types out, the title fades in, then the 20–25% band on a 0–100 percentile
// track lights up with a marker for the team's 260th place. The source only gives "top ≈20–25% of 1,000+
// teams", so the marker sits in the band rather than at a computed point. Category chips light up in turn
// (hover only highlights: there is no per-category data). The bottom line counts up and is labelled as a
// team result. All values come from data/csaw.json.
import { s, html, raw, frag, countUp, wait, typeText, scale, inspect } from './svg.js';

export async function mount(stage) {
  const d = await (await fetch('/data/csaw.json')).json();
  const [lo, hi] = d.band;
  const W = 600, H = 70, x = scale(0, 100, 16, W - 16);
  stage.append(frag(html`
    <div class="ctf">
      <p class="ctf-prompt"><span class="ctf-user">nick@utd-csg</span>:~$ <span class="ctf-cmd">./ctf --status</span><span class="caret-block" aria-hidden="true"></span></p>
      <p class="ctf-title glow">CSAW <em>CTF</em> 2026</p>
      <p class="ctf-sub"><b>${d.role}</b> / ${d.team} / ${d.group}</p>
      <div class="ctf-hero">
        <p class="ctf-top glow"><span class="sr-only">Top ${lo} to ${hi} percent</span><span aria-hidden="true">TOP <span class="ctf-band">${lo}–${hi}%</span></span></p>
        <p class="ctf-of">of <b>1,000+</b> scoring teams, historically · ${d.about}</p>
      </div>
      <div class="ctf-trackwrap"></div>
      <p class="ctf-label label">Categories solved</p>
      <ul class="ctf-chips">${raw(d.categories.map((c) => html`<li class="ctf-chip">${c}</li>`).join(''))}</ul>
      <p class="ctf-line"><b><span class="ctf-n" data-to="${d.teamTotals.points}">${d.teamTotals.points}</span> points</b> · <span class="ctf-n" data-to="${d.teamTotals.challenges}">${d.teamTotals.challenges}</span> challenges solved · <span class="ctf-n" data-to="${d.teamTotals.hours}">${d.teamTotals.hours}</span> hours · ${d.teamTotals.when} <span class="ex-tag ctf-team">Team result</span></p>
    </div>`));
  const root = stage.querySelector('.ctf');

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Placement track: top ${lo} to ${hi} percent, ${d.place}th place` });
  svg.append(s('line', { x1: x(0), x2: x(100), y1: 34, y2: 34, class: 'ctf-axis' }));
  for (const v of [0, 25, 50, 75, 100]) svg.append(s('line', { x1: x(v), x2: x(v), y1: 29, y2: 39, class: 'ctf-axis' }), s('text', { x: x(v), y: 58, 'text-anchor': 'middle', class: 'ctf-tick' }, `${v}%`));
  const band = s('rect', { x: x(lo), y: 24, width: x(hi) - x(lo), height: 20, class: 'ctf-bandrect' });
  const mid = (lo + hi) / 2;
  const mark = s('path', { d: `M${x(mid)} 22 l-6 -10 h12 z`, class: 'ctf-marker' });
  svg.append(band, mark, s('text', { x: x(mid), y: 9, 'text-anchor': 'middle', class: 'ctf-mlabel' }, `${d.place}th`));
  root.querySelector('.ctf-trackwrap').append(svg);
  const items = () => [band, mark].map((el, i) => {
    const a = el.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top, text: i ? `${d.place}th place · team ${d.team}` : `Top ${lo}–${hi}% of ${d.field}` };
  });
  inspect(svg, items, { box: root, label: 'Placement track. Arrow keys step between the band and the marker.', onFocus: (i) => svg.classList.toggle('is-inspecting', i >= 0) });

  const chips = [...root.querySelectorAll('.ctf-chip')];
  const nums = [...root.querySelectorAll('.ctf-n')];
  const cmd = root.querySelector('.ctf-cmd');
  const final = () => {
    root.classList.add('is-final', 'is-lit');
    chips.forEach((c) => c.classList.add('is-on'));
    nums.forEach((n) => { n.textContent = n.dataset.to; });
  };
  const play = async (signal) => {
    root.classList.remove('is-final', 'is-lit', 'is-shown');
    chips.forEach((c) => c.classList.remove('is-on'));
    await typeText(cmd, './ctf --status', { speed: 45, signal });
    root.classList.add('is-shown');                       // title, subtitle and hero fade in
    await wait(350, signal);
    root.classList.add('is-lit');                         // the 20–25% band lights up
    for (const c of chips) { if (signal.aborted) break; c.classList.add('is-on'); await wait(110, signal); }
    await Promise.all(nums.map((n) => countUp(n, Number(n.dataset.to), { dur: 1000, signal })));
    final();
  };
  return { play, final };
}
