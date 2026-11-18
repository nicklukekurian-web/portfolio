// E1 · Internlog home, rebuilt in its own navy and gold (DEMO DATA: fictional companies).
// The headline types in over a light particle field, the "Recent reviews" strip runs as a marquee that pauses
// on hover, and the tier pills and the search box really filter the company cards (with a FLIP animation).
import { html, raw, frag, flip, typeText, inspect, reducedMotion } from './svg.js';

const TIER = { 3: ['Gold', 'gold'], 2: ['Silver', 'silver'], 1: ['Bronze', 'bronze'] };
const trophy = (tier) => html`<svg class="il-trophy is-${TIER[tier][1]}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><use href="/assets/icons/sprite.svg#trophy"/></svg>`;

function particles(canvas) {
  if (reducedMotion()) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const colors = ['#e0b44a', '#6fe3a1', '#ff6fb1', '#8fb4ff', '#c9d3ea'];
  let w = 0, h = 0, raf = 0, on = false;
  const pts = Array.from({ length: 40 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.00012, vy: (Math.random() - 0.5) * 0.00012, s: 1 + Math.random() * 1.6, c: colors[(Math.random() * colors.length) | 0] }));
  const size = () => { const r = canvas.getBoundingClientRect(); w = canvas.width = Math.max(1, r.width * dpr); h = canvas.height = Math.max(1, r.height * dpr); };
  const frame = (t) => {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x = (p.x + p.vx * 16 + 1) % 1; p.y = (p.y + p.vy * 16 + 1) % 1;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t / 900 + p.x * 9);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x * w, p.y * h, p.s * dpr, p.s * dpr);
    }
    if (on) raf = requestAnimationFrame(frame);
  };
  size();
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver((es) => { on = es[es.length - 1].isIntersecting; cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(frame); }).observe(canvas);
}

// opts.preview (Home's Selected Work panel): the same page with no focusable controls (the panel content is
// aria-hidden; the panel itself is the link), the tier filter cycling by itself, and hover highlights.
export async function mount(stage, { preview = false } = {}) {
  const d = await (await fetch('/data/internlog-demo.json')).json();
  const byId = Object.fromEntries(d.companies.map((c) => [c.id, c]));
  const card = (r) => html`<li class="il-rc"><p class="il-rc-head">${raw(trophy(byId[r.company].tier))}<b>${byId[r.company].name}</b><span class="il-pill">${r.rating}/10</span></p><p class="il-role">${r.role}</p><p class="il-quote">${r.text}</p></li>`;
  stage.append(frag(html`
    <div class="il il-home">
      <canvas class="il-particles" aria-hidden="true"></canvas>
      <div class="il-nav"><span class="il-logo">Internlog</span><span class="il-links" aria-hidden="true"><span class="is-on">Search</span><span>Write a review</span><span>Leaderboards</span><span>Contact us</span></span></div>
      <div class="il-hero">
        <p class="il-h">Know what you’re walking into.</p>
        <p class="il-p">Real reviews from real interns — pay, difficulty to land the role, day-to-day work, and honest pros and cons, organized by company tier.</p>
        <div class="il-cta" aria-hidden="true"><span class="il-btn is-gold">Write a review</span><span class="il-btn is-ghost">See leaderboards</span></div>
        ${raw(preview ? '<span class="il-search"><span class="il-fake-input">Search a company</span></span>' : '<label class="il-search"><span class="sr-only">Search the demo companies</span><input type="search" placeholder="Search a company" autocomplete="off" spellcheck="false"></label>')}
      </div>
      <div class="il-recent">
        <p class="il-kicker">Recent reviews from Internlog</p>
        <div class="il-marquee" ${raw(preview ? '' : 'tabindex="0" aria-label="Recent reviews (scrolling; hover or focus to pause)"')}>
          <ul class="il-track">${raw(d.recent.map(card).join(''))}</ul><ul class="il-track" aria-hidden="true">${raw(d.recent.map(card).join(''))}</ul>
        </div>
      </div>
      <div class="il-tiers" ${raw(preview ? '' : 'role="group" aria-label="Filter the demo companies by tier"')}>
        ${raw(preview
          ? [`<span class="il-tier" data-tier="all" aria-pressed="true">All tiers</span>`, ...d.tiers.map((t) => html`<span class="il-tier" data-tier="${t.id}" aria-pressed="false">${t.label} — ${t.scope}</span>`)].join('')
          : [`<button type="button" class="il-tier" data-tier="all" aria-pressed="true">All tiers</button>`, ...d.tiers.map((t) => html`<button type="button" class="il-tier" data-tier="${t.id}" aria-pressed="false">${t.label} — ${t.scope}</button>`)].join(''))}
      </div>
      <ul class="il-cos">${raw(d.companies.map((c) => html`<li class="il-co" data-tier="${c.tier}" data-name="${c.name.toLowerCase()}"><b>${c.name}</b>${raw(trophy(c.tier))}<span class="il-co-meta">${c.industry} · Tier ${c.tier} · ${TIER[c.tier][0]}</span></li>`).join(''))}</ul>
      <p class="il-empty" hidden>No demo company matches that search.</p>
      <p class="sr-only" aria-live="polite" data-count></p>
    </div>`));
  const root = stage.querySelector('.il-home');
  particles(root.querySelector('.il-particles'));
  const cos = [...root.querySelectorAll('.il-co')];
  const input = root.querySelector('input') || { value: '', addEventListener() {} };
  const count = root.querySelector('[data-count]');
  let tier = 'all';
  if (preview) root.classList.add('is-preview');
  const apply = () => {
    const q = input.value.trim().toLowerCase();
    flip(cos, () => {
      for (const c of cos) c.hidden = !((tier === 'all' || c.dataset.tier === tier) && (!q || c.dataset.name.includes(q)));
    });
    const shown = cos.filter((c) => !c.hidden).length;
    root.querySelector('.il-empty').hidden = shown > 0;
    count.textContent = `${shown} demo ${shown === 1 ? 'company' : 'companies'} shown`;
  };
  const pick = (b) => {
    tier = b.dataset.tier;
    root.querySelectorAll('.il-tier').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    apply();
  };
  root.querySelectorAll('.il-tier').forEach((b) => b.addEventListener('click', () => pick(b)));
  input.addEventListener('input', apply);

  const list = root.querySelector('.il-cos');
  if (preview) {                                   // hover highlight only, and the filter steps through the tiers by itself
    list.addEventListener('pointerover', (e) => cos.forEach((c) => c.classList.toggle('is-hot', c === e.target.closest('.il-co'))));
    list.addEventListener('pointerleave', () => cos.forEach((c) => c.classList.remove('is-hot')));
    const tiers = [...root.querySelectorAll('.il-tier')];
    let k = 0;
    if (!reducedMotion()) setInterval(() => { if (stage.isConnected && !document.hidden) pick(tiers[(k = (k + 1) % tiers.length)]); }, 2600);
  } else inspect(list, () => cos.filter((c) => !c.hidden).map((c) => {
    const a = c.getBoundingClientRect(), b = list.getBoundingClientRect(), co = d.companies.find((x) => x.name.toLowerCase() === c.dataset.name);
    const rec = d.recent.find((r) => r.company === co.id);
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top, text: `${co.name} · Tier ${co.tier} ${TIER[co.tier][0]}${rec ? ` · latest review ${rec.rating}/10` : ''}` };
  }), { box: root, label: 'Demo company cards. Arrow keys step through them.', onFocus: (i) => {
    const vis = cos.filter((c) => !c.hidden);
    vis.forEach((c, j) => c.classList.toggle('is-hot', j === i));
    list.classList.toggle('is-inspecting', i >= 0);
  } });

  const h = root.querySelector('.il-h');
  const text = h.textContent;
  const final = () => { h.textContent = text; root.classList.add('is-final'); };
  const play = async (signal) => {
    root.classList.remove('is-final');
    root.classList.add('is-playing');
    await typeText(h, text, { speed: 34, signal });
    root.classList.remove('is-playing');
    final();
  };
  return { play, final };
}
