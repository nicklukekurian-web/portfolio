// E5 · NCL Fall 2026 terminal report. Rank, total and every number about Nick come from data/ncl.json
// (the percentile is computed from it). Other participants' values (timeline series, bubbles, histogram)
// were read off the Cyber Skyline report image and live in data/ncl-charts.json: they are approximate,
// and every tooltip that shows one says "≈". Nick's marks are amber; everything else is the blue family.
// TODO(nick): name these series (the timeline panel in the report has no legend).
import { s, html, raw, frag, countUp, wait, typeText, scale, linePath, inspect, fmtInt } from './svg.js';

const AXES = ['osint', 'cryptography', 'password_cracking', 'log_analysis', 'network_traffic', 'forensics', 'scanning_recon', 'exploitation', 'web_app_exploit'];
const BLUES = ['#3d7bff', '#5aa9ff', '#8fe3ff'];

const box = (svg, el, text) => ({ el, get item() { const a = el.getBoundingClientRect(), b = svg.getBoundingClientRect(); return { x: a.left - b.left + a.width / 2, y: a.top - b.top, text: text() }; } });

export async function mount(stage) {
  const [n, c] = await Promise.all([fetch('/data/ncl.json').then((r) => r.json()), fetch('/data/ncl-charts.json').then((r) => r.json())]);
  const top = Math.round((n.rank / n.total) * 100);
  const cats = Object.fromEntries(n.categories.map((k) => [k.key, k]));
  const weakest = n.categories.reduce((w, k) => (k.completion < w.completion ? k : w));
  const W = Math.max(300, Math.min(720, stage.clientWidth - 36));

  stage.append(frag(html`
    <div class="term">
      <div class="term-bar" aria-hidden="true"><i></i><i></i><i></i><span>nickkurian@ncl-fall2026: ~/individual-game</span></div>
      <div class="term-body">
        <p class="t-line t-cmd">$ ./ncl --season fall2026 --game individual --report</p>
        <p class="t-line t-ok"><b>[OK]</b> authenticating operator nickkurian ... access granted</p>
        <p class="t-line t-ok"><b>[OK]</b> decrypting scoreboard ... done</p>
        <p class="t-rank glow"><span class="sr-only">Rank ${n.rank} of ${fmtInt(n.total)}</span><span aria-hidden="true">RANK <span class="t-rank-n">${n.rank}</span> <span class="t-slash">/</span> <span class="t-rank-t">${fmtInt(n.total)}</span></span></p>
        <p class="t-pct">&gt; placement: <b>top ~<span class="t-top">${top}</span>%</b></p>
        <dl class="t-stats">
          <div><dt>Points</dt><dd><b class="t-num" data-to="${n.points}">${fmtInt(n.points)}</b> / ${fmtInt(n.maxPoints)}</dd></div>
          <div><dt>Accuracy</dt><dd><b class="t-num" data-to="${n.accuracy}" data-dec="1">${n.accuracy}</b>%</dd></div>
          <div><dt>Completion</dt><dd><b class="t-num" data-to="${n.completion}" data-dec="1">${n.completion}</b>%</dd></div>
          <div><dt>Correct</dt><dd><b class="t-num" data-to="${n.correct}">${n.correct}</b> / ${n.questions}</dd></div>
          <div><dt>Skipped</dt><dd><b class="t-num" data-to="${n.skipped}">${n.skipped}</b></dd></div>
          <div><dt>Hints</dt><dd><b class="t-num" data-to="${n.hints}">${n.hints}</b></dd></div>
        </dl>
        <div class="t-pair">
          <section class="t-chart"><h5>// completion_map [9 domains]</h5><div class="t-svg" data-chart="completion"></div></section>
          <section class="t-chart"><h5>// skill_matrix (points scored %)</h5><div class="t-svg" data-chart="radar"></div></section>
        </div>
        <section class="t-chart"><h5>// comparative_timeline <span class="t-legend"><i class="me"></i>you <i></i>comparison series ≈</span></h5><div class="t-svg" data-chart="timeline"></div></section>
        <section class="t-chart"><h5>// composite_performance <span class="t-legend"><i class="me"></i>you <i></i>other participants ≈</span></h5><div class="t-svg" data-chart="bubbles"></div></section>
        <section class="t-chart"><h5>// score_distribution</h5><div class="t-svg" data-chart="hist"></div></section>
        <p class="t-note">Approximate: read from the Cyber Skyline report. The official numbers are in the NCL Scouting Report. Bubble counts are estimated by scaling bubble areas to the field size.</p>
        <p class="t-prompt" aria-hidden="true">$ <span class="caret-block"></span></p>
        <p class="t-foot"><span>OPERATOR: Nicholas Kurian // CS @ UT Dallas</span><span>STATUS: not final until NCL's official announcement</span></p>
      </div>
    </div>`));
  const root = stage.querySelector('.term');
  const slot = (k) => root.querySelector(`[data-chart="${k}"]`);
  const charts = [];

  // ── completion map: nine bars, the weakest in amber
  {
    const host = slot('completion'), w = Math.min(W, 380), rowH = 20, lab = 128, bx = lab + 6, bw = w - bx - 46;
    const svg = s('svg', { viewBox: `0 0 ${w} ${rowH * 9 + 4}`, role: 'img', 'aria-label': 'Completion by domain' });
    const marks = n.categories.slice().sort((a, b) => b.completion - a.completion).map((k, i) => {
      const y = i * rowH + 4, weak = k === weakest;
      svg.append(s('text', { x: 0, y: y + 12, class: 't-axis' }, `${k.key}${'.'.repeat(Math.max(2, 17 - k.key.length))}`));
      svg.append(s('rect', { x: bx, y, width: bw, height: 12, class: 't-track' }));
      const bar = s('rect', { x: bx, y, width: (bw * k.completion) / 100, height: 12, class: `t-bar${weak ? ' is-me' : ''}`, style: undefined });
      bar.style.setProperty('--d', `${i * 50}ms`);
      svg.append(bar, s('text', { x: w, y: y + 11, class: 't-val', 'text-anchor': 'end' }, `${k.completion}%`));
      return box(svg, bar, () => `${k.label} · ${k.completion}% complete`);
    });
    host.append(svg);
    charts.push({ svg, marks, label: 'Completion map. Arrow keys step through the nine domains.' });
  }

  // ── skill matrix radar: points scored % per category, computed from the category scores
  {
    const host = slot('radar'), size = Math.min(W, 340), cx = size / 2, cy = size / 2, R = size / 2 - 42;
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'Points scored by category' });
    const pt = (i, f) => { const a = (-90 + i * (360 / AXES.length)) * (Math.PI / 180); return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
    for (const f of [0.25, 0.5, 0.75, 1]) svg.append(s('path', { d: `${linePath(AXES.map((_, i) => pt(i, f)))}Z`, class: 't-grid' }));
    AXES.forEach((k, i) => {
      const [x, y] = pt(i, 1), [lx, ly] = pt(i, 1.2);
      svg.append(s('line', { x1: cx, y1: cy, x2: x, y2: y, class: 't-grid' }));
      svg.append(s('text', { x: lx, y: ly + 3, 'text-anchor': 'middle', class: `t-axis${cats[k] === weakest ? ' is-me' : ''}` }, cats[k].short));
    });
    const poly = AXES.map((k, i) => pt(i, cats[k].points / cats[k].max));
    svg.append(s('path', { d: `${linePath(poly)}Z`, class: 't-poly', pathLength: 1 }));
    const marks = AXES.map((k, i) => {
      const dot = s('circle', { cx: poly[i][0], cy: poly[i][1], r: 3.5, class: `t-dot${cats[k] === weakest ? ' is-me' : ''}` });
      svg.append(dot);
      const pct = Math.round((cats[k].points / cats[k].max) * 100);
      return box(svg, dot, () => `${cats[k].label} · ${cats[k].points}/${cats[k].max} · ${pct}%`);
    });
    host.append(svg);
    charts.push({ svg, marks, label: 'Skill matrix. Arrow keys step through the nine categories.' });
  }

  // ── comparative timeline: four lines, Nick's exact (amber), the rest approximate (blue)
  {
    const host = slot('timeline'), h = 220, m = { l: 40, r: 10, t: 10, b: 26 }, t = c.timeline;
    const x = scale(0, t.labels.length - 1, m.l, W - m.r), y = scale(0, 2500, h - m.b, m.t);
    const svg = s('svg', { viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': 'Points over the weekend' });
    for (const v of [0, 500, 1000, 1500, 2000, 2500]) { svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 't-grid' }), s('text', { x: m.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 't-axis' }, fmtInt(v))); }
    [[1, 'Oct 23'], [2, 'Oct 24'], [6, 'Oct 25']].forEach(([i, l]) => svg.append(s('text', { x: x(i), y: h - 8, 'text-anchor': 'middle', class: 't-axis' }, l)));
    const cross = s('line', { x1: 0, x2: 0, y1: m.t, y2: h - m.b, class: 't-cross' });
    svg.append(cross);
    let b = 0;
    t.series.forEach((ser) => {
      const p = s('path', { d: linePath(ser.points.map((v, i) => [x(i), y(v)])), class: `t-line-s${ser.mine ? ' is-me' : ''}`, pathLength: 1 });
      if (!ser.mine) p.style.setProperty('--c', BLUES[b++ % BLUES.length]);
      svg.append(p);
    });
    const mine = t.series.find((ser) => ser.mine);
    const marks = t.labels.map((l, i) => {
      const dot = s('circle', { cx: x(i), cy: y(mine.points[i]), r: 3, class: 't-dot is-me' });
      svg.append(dot);
      return { el: dot, get item() { const a = dot.getBoundingClientRect(), r = svg.getBoundingClientRect(); return { x: a.left - r.left + a.width / 2, y: a.top - r.top, text: `${l} · you ${i === t.labels.length - 1 ? fmtInt(n.points) : `≈${fmtInt(mine.points[i])}`} · ${t.series.filter((q) => !q.mine).map((q) => `${q.name.replace('Comparison series ', '')} ≈${fmtInt(q.points[i])}`).join(' · ')}` }; }, x: x(i) };
    });
    host.append(svg);
    charts.push({ svg, marks, axis: 'x', label: 'Comparative timeline. Arrow keys step through the samples.', onFocus: (i) => { cross.classList.toggle('is-on', i >= 0); if (i >= 0) { cross.setAttribute('x1', marks[i].x); cross.setAttribute('x2', marks[i].x); } } });
  }

  // ── composite performance: accuracy vs points; counts estimated from bubble areas
  {
    const host = slot('bubbles'), h = 250, m = { l: 40, r: 10, t: 10, b: 26 };
    const x = scale(0, 100, m.l, W - m.r), y = scale(0, 3200, h - m.b, m.t), k = Math.max(1.6, W / 260);
    const area = c.bubbles.reduce((a, q) => a + q.r * q.r, 0);
    const svg = s('svg', { viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': 'Accuracy versus points for all participants' });
    for (const v of [0, 1000, 2000, 3000]) svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 't-grid' }), s('text', { x: m.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 't-axis' }, fmtInt(v)));
    for (const v of [0, 25, 50, 75, 100]) svg.append(s('text', { x: x(v), y: h - 8, 'text-anchor': 'middle', class: 't-axis' }, `${v}%`));
    const marks = c.bubbles.map((q, i) => {
      const dot = s('circle', { cx: x(q.accuracy), cy: y(q.points), r: q.r * k, class: 't-bub' });
      dot.style.setProperty('--d', `${(i % 40) * 12}ms`);
      svg.append(dot);
      const est = Math.max(1, Math.round(((q.r * q.r) / area) * n.total));
      return box(svg, dot, () => `≈ ${fmtInt(est)} participants · ≈${q.accuracy}% accuracy · ≈${fmtInt(q.points)} pts`);
    });
    svg.append(s('line', { x1: x(n.accuracy), x2: x(n.accuracy), y1: m.t, y2: h - m.b, class: 't-mine-line' }), s('line', { x1: m.l, x2: W - m.r, y1: y(n.points), y2: y(n.points), class: 't-mine-line' }));
    const me = s('circle', { cx: x(n.accuracy), cy: y(n.points), r: 3.4 * k, class: 't-bub is-me' });
    svg.append(me);
    marks.push(box(svg, me, () => `You · ${n.accuracy}% accuracy · ${fmtInt(n.points)} pts`));
    host.append(svg);
    charts.push({ svg, marks, label: 'Composite performance. Arrow keys step through the bubbles; yours is last.' });
  }

  // ── score distribution: ten bins, Nick's bin in amber
  {
    const host = slot('hist'), h = 210, m = { l: 40, r: 10, t: 10, b: 26 }, hg = c.histogram;
    const mineBin = Math.min(9, Math.floor(((n.points / n.maxPoints) * 100) / hg.binWidth));
    const bw = (W - m.l - m.r) / hg.counts.length, y = scale(0, 650, h - m.b, m.t);
    const svg = s('svg', { viewBox: `0 0 ${W} ${h}`, role: 'img', 'aria-label': 'Participants by percentage of points scored' });
    for (const v of [0, 250, 500]) svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 't-grid' }), s('text', { x: m.l - 6, y: y(v) + 3, 'text-anchor': 'end', class: 't-axis' }, String(v)));
    const myPct = ((n.points / n.maxPoints) * 100).toFixed(1);
    const marks = hg.counts.map((v, i) => {
      const lo = i * hg.binWidth, bar = s('rect', { x: m.l + i * bw + 2, y: y(v), width: bw - 4, height: y(0) - y(v), class: `t-hbar${i === mineBin ? ' is-me' : ''}` });
      bar.style.setProperty('--d', `${i * 70}ms`);
      svg.append(bar);
      if (i % 2 === 0 || W > 520) svg.append(s('text', { x: m.l + i * bw + bw / 2, y: h - 8, 'text-anchor': 'middle', class: 't-axis' }, `${lo}%`));
      return box(svg, bar, () => `${lo}–${lo + hg.binWidth}% · ≈ ${fmtInt(v)} participants${i === mineBin ? ` · you: ${myPct}%` : ''}`);
    });
    host.append(svg);
    charts.push({ svg, marks, label: 'Score distribution. Arrow keys step through the ten bins.' });
  }

  // Inspect every chart: the hovered mark brightens, the rest dim.
  for (const ch of charts) {
    inspect(ch.svg, () => ch.marks.map((mk) => mk.item), {
      box: root, axis: ch.axis || 'xy', label: ch.label,
      onFocus: (i) => { ch.svg.classList.toggle('is-inspecting', i >= 0); ch.marks.forEach((mk, j) => mk.el.classList.toggle('is-hot', j === i)); ch.onFocus?.(i); },
    });
  }

  const nums = [...root.querySelectorAll('.t-num')];
  const fmt = (el) => (v) => (el.dataset.dec ? v.toFixed(1) : fmtInt(v));
  const lines = [...root.querySelectorAll('.t-line')];
  const final = () => {
    root.classList.add('is-final');
    root.querySelector('.t-rank-n').textContent = String(n.rank);
    nums.forEach((el) => { el.textContent = fmt(el)(Number(el.dataset.to)); });
    charts.forEach((ch) => ch.svg.classList.add('is-drawn'));
  };
  const play = async (signal) => {
    root.classList.remove('is-final');
    root.classList.add('is-playing');
    charts.forEach((ch) => ch.svg.classList.remove('is-drawn'));
    lines.forEach((l) => l.classList.remove('is-on'));
    lines[0].classList.add('is-on');
    await typeText(lines[0], lines[0].textContent, { speed: 12, signal });
    for (const l of lines.slice(1)) { l.classList.add('is-on'); await wait(120, signal); }
    root.classList.add('is-ranked');
    const rank = countUp(root.querySelector('.t-rank-n'), n.rank, { from: n.total, dur: 900, signal });   // climbs the leaderboard
    nums.forEach((el) => countUp(el, Number(el.dataset.to), { dur: 1000, format: fmt(el), signal }));
    for (const ch of charts) { if (signal.aborted) break; ch.svg.classList.add('is-drawn'); await wait(140, signal); }
    await rank;
    root.classList.remove('is-playing');
    final();
  };
  return { play, final };
}
