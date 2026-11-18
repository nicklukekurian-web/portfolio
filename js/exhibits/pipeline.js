// Detector pipeline diagram (Fig. 05): when it scrolls in, a packet travels SUBMISSION → VALIDATION →
// FIVE-SIGNAL SCORER → SCORE/LEVEL/REASONS STORED → MODERATION EMAIL → HUMAN DECISION, and each box glows as it
// passes. Hovering (or arrowing to) one of the five signals shows its rule and point value, taken from the
// ported scorer's SIGNAL_RULES, never retyped. Reduced motion: no packet; inspecting still works.
import { SIGNAL_RULES } from '../detector-demo.js';
import { s, inspect, reducedMotion } from './svg.js';

const STEP = 280;   // ms per hop: six boxes ≈ 1.7s

function run(svg) {
  const boxes = [...svg.querySelectorAll('rect.bp-box')];
  if (boxes.length < 6) return;
  const centers = boxes.map((b) => [Number(b.getAttribute('x')) + Number(b.getAttribute('width')) / 2, Number(b.getAttribute('y')) + Number(b.getAttribute('height')) / 2]);
  const dot = s('circle', { r: 6, class: 'bp-packet is-on', cx: centers[0][0], cy: centers[0][1] });
  svg.append(dot);
  const t0 = performance.now();
  const frame = (now) => {
    const t = (now - t0) / STEP, i = Math.min(centers.length - 1, Math.floor(t)), f = Math.min(1, t - i);
    const [ax, ay] = centers[i], [bx, by] = centers[Math.min(centers.length - 1, i + 1)];
    dot.setAttribute('cx', ax + (bx - ax) * f);
    dot.setAttribute('cy', ay + (by - ay) * f);
    boxes.forEach((b, k) => b.classList.toggle('is-pass', k <= i));
    if (t < centers.length) requestAnimationFrame(frame);
    else { dot.remove(); setTimeout(() => boxes.forEach((b) => b.classList.remove('is-pass')), 900); }
  };
  requestAnimationFrame(frame);
}

export function initPipeline() {
  const fig = document.querySelector('.bp-pipe');
  if (!fig) return;
  for (const svg of fig.querySelectorAll('svg')) {
    // The five signal labels, in diagram order, match SIGNAL_RULES order.
    const labels = [...svg.querySelectorAll('.bp-dim text')].filter((t) => /^[1-5] /.test(t.textContent.trim()));
    const scorer = svg.querySelectorAll('rect.bp-box')[2];
    inspect(svg, () => labels.map((t, i) => {
      const a = t.getBoundingClientRect(), b = svg.getBoundingClientRect(), r = SIGNAL_RULES[i];
      return { x: a.left - b.left + a.width / 2, y: a.top - b.top, text: `${r.label}: ${r.rule} (up to +${r.max})` };
    }), { box: fig, onFocus: (i) => {
      labels.forEach((t, j) => t.classList.toggle('is-hot', j === i));
      scorer?.classList.toggle('is-pass', i >= 0);
    } });
    if (reducedMotion()) continue;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(svg); }
    }, { threshold: 0.35 });
    io.observe(svg);
  }
}
