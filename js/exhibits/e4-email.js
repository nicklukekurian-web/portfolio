// E4 · The flagged moderation email. The score, level, reasons and per-signal points are computed live by
// the same ported scorer that powers "Try the detector" (js/detector-demo.js); nothing is typed in here.
// Scroll-in: a scan line sweeps the email, the five signals evaluate one by one, the meter counts up and the
// level badge pulses once. Hover or focus a reason chip to light up the fields that triggered it.
import { scoreReview, SIGNAL_RULES } from '../detector-demo.js';
import { html, raw, frag, countUp, wait } from './svg.js';

// Which parts of the email each signal reads.
const FIELDS = {
  length: ['[data-row="pros"]', '[data-row="cons"]', '[data-row="day"]'],
  templated: ['[data-row="pros"] dd', '[data-row="cons"] dd', '[data-row="day"] dd'],
  rating: ['[data-row="rating"]'],
  duplicate: ['[data-row="pros"] dd', '[data-row="cons"] dd', '[data-row="day"] dd'],
  links: [],
};

export async function mount(stage) {
  const e = (await (await fetch('/data/internlog-demo.json')).json()).flaggedEmail;
  const r = scoreReview({ pros: e.pros, cons: e.cons, dayInLife: e.dayInLife, rating: e.rating });
  const level = r.level.toUpperCase();
  const row = (key, label, value, cls = '') => html`<div class="em-row ${cls}" data-row="${key}"><dt>${label}:</dt><dd>${value}</dd></div>`;
  stage.append(frag(html`
    <div class="em">
      <p class="em-kicker">Moderation email · automatic quality flag</p>
      <div class="em-win">
        <div class="em-bar" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="em-head">
          <p class="em-subj">New Internlog review — ${e.company}</p>
          <p class="em-from"><span class="em-av" aria-hidden="true">I</span><b>Internlog</b> to me</p>
        </div>
        <div class="em-body">
          <p class="em-lead">A new review was just posted.</p>
          <div class="em-flag" data-level="${r.level}">
            <p class="em-flag-title"><span aria-hidden="true">⚠</span> Quality flag: <b class="em-level">${level}</b> (score <span class="em-score">${r.score}</span>/100)</p>
            <div class="em-meter" aria-hidden="true"><i class="em-fill"></i><b class="at30"></b><b class="at60"></b></div>
            <p class="em-label">Reasons <span class="em-hint">· hover one</span></p>
            <ul class="em-chips">${raw(r.details.map((d) => html`<li><button type="button" class="em-chip" data-signal="${d.signal}">${d.reason} <span class="em-pts">+${d.points}</span></button></li>`).join(''))}</ul>
          </div>
          <ol class="em-signals" aria-label="The five signals">${raw(SIGNAL_RULES.map((s) => {
            const pts = r.signals[s.id];
            return html`<li data-signal="${s.id}" class="${pts ? 'is-hit' : 'is-clear'}"><span class="em-mark" aria-hidden="true">${pts ? '✓' : '–'}</span><span class="em-sig">${s.label}</span><span class="em-sig-pts">${pts ? `+${pts}` : '0'}</span></li>`;
          }).join(''))}</ol>
          <dl class="em-fields">
            ${raw(row('company', 'Company', `${e.company} (${e.companyId})`))}${raw(row('role', 'Role', e.role))}
            ${raw(row('rating', 'Rating', `${e.rating}/10`, 'is-amber'))}${raw(row('difficulty', 'Difficulty to get', e.difficulty))}
            ${raw(row('pay', 'Hourly pay', e.pay))}${raw(row('location', 'Location', e.location))}${raw(row('dates', 'Dates', e.dates))}
            ${raw(row('pros', 'Pros', e.pros, 'gap'))}${raw(row('cons', 'Cons', e.cons))}${raw(row('day', 'Day in the life', e.dayInLife))}
          </dl>
          <p class="em-id">Review ID: ${e.reviewId}</p>
          <p class="em-remove">Removal needs the admin key.</p>
        </div>
        <div class="em-foot"><span>Flagged by Internlog's rule-based scorer · flag only, the review stays up until a human decides</span><span>Demo data</span></div>
        <i class="em-scan" aria-hidden="true"></i>
      </div>
      <a class="em-try link-cmd" href="#detector">Try your own <span aria-hidden="true">→</span></a>
    </div>`));

  const root = stage.querySelector('.em');
  const scoreEl = root.querySelector('.em-score');
  const fill = root.querySelector('.em-fill');
  const sigs = [...root.querySelectorAll('.em-signals li')];

  // Reason chips light up the fields that triggered them.
  const light = (signal) => {
    root.querySelectorAll('.is-lit').forEach((n) => n.classList.remove('is-lit'));
    root.classList.toggle('is-inspecting', !!signal);
    if (!signal) return;
    for (const sel of FIELDS[signal] || []) root.querySelectorAll(sel).forEach((n) => n.classList.add('is-lit'));
    root.querySelector(`.em-signals li[data-signal="${signal}"]`)?.classList.add('is-lit');
    root.querySelector(`.em-chip[data-signal="${signal}"]`)?.classList.add('is-lit');
  };
  for (const chip of root.querySelectorAll('.em-chip')) {
    chip.addEventListener('pointerenter', () => light(chip.dataset.signal));
    chip.addEventListener('focus', () => light(chip.dataset.signal));
    chip.addEventListener('pointerleave', () => light(null));
    chip.addEventListener('blur', () => light(null));
    chip.addEventListener('click', () => light(chip.dataset.signal));
  }
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') light(null); });

  const final = () => {
    root.classList.remove('is-scanning', 'is-pulse');
    sigs.forEach((li) => li.classList.add('is-done'));
    scoreEl.textContent = String(r.score);
    fill.style.setProperty('--v', String(r.score));
    root.classList.add('is-final');
  };
  const play = async (signal) => {
    root.classList.remove('is-final', 'is-pulse');
    sigs.forEach((li) => li.classList.remove('is-done'));
    fill.style.setProperty('--v', '0');
    scoreEl.textContent = '0';
    root.classList.remove('is-scanning'); void root.offsetWidth; root.classList.add('is-scanning');
    await wait(500, signal);
    for (const li of sigs) { if (signal.aborted) break; li.classList.add('is-done'); await wait(200, signal); }
    fill.style.setProperty('--v', String(r.score));
    await countUp(scoreEl, r.score, { dur: 900, signal });
    root.classList.add('is-pulse');
    await wait(700, signal);
    final();
  };
  return { play, final };
}
