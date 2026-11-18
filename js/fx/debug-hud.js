// ?debug=fps: a small corner readout of frame time (fps, p50, p95 over the last 2s), long tasks, and any
// stats the effects report (active particles, scene, render scale). Loaded only when the query asks for it.
// Also mirrors the numbers on window.__fps so a scripted run can read them.
let hud = null;

export function debugHud() {
  if (hud) return hud;
  const el = document.createElement('pre');
  el.className = 'debug-hud';
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  const dts = [], stats = new Map();
  let last = 0, longTasks = 0, shown = 0;
  try {
    new PerformanceObserver((list) => { longTasks += list.getEntries().length; }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask timing not supported */ }
  const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
  const tick = (now) => {
    if (last) { dts.push(now - last); if (dts.length > 120) dts.shift(); }
    last = now;
    if (now - shown > 250) {
      shown = now;
      const p50 = pct(dts, 0.5), p95 = pct(dts, 0.95);
      window.__fps = { fps: p50 ? 1000 / p50 : 0, p50, p95, longTasks, stats: Object.fromEntries(stats) };
      el.textContent = [`fps ${(p50 ? 1000 / p50 : 0).toFixed(0)}  p50 ${p50.toFixed(1)}ms  p95 ${p95.toFixed(1)}ms`, `long tasks ${longTasks}`,
        ...[...stats].map(([k, v]) => `${k}: ${v}`)].join('\n');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  hud = { stat: (k, v) => stats.set(k, v) };
  return hud;
}
