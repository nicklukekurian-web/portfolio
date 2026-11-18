// E2 · A company page with reviews (DEMO DATA: Meridian Cloud Systems is fictional). The stats are computed
// from the four reviews (9 + 9 + 8 + 8 = 34 / 4 = 8.5), never typed in. Sort and the role filter really
// reorder and filter the cards with FLIP; Report shows what the live site would do.
import { html, raw, frag, flip, countUp, wait, inspect } from './svg.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const posted = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}/${y}`; };

export async function mount(stage) {
  const d = await (await fetch('/data/internlog-demo.json')).json();
  const reviews = d.meridianReviews;
  const avg = mean(reviews.map((r) => r.rating)), diff = mean(reviews.map((r) => r.difficulty));
  const roles = reviews.reduce((m, r) => m.set(r.role, (m.get(r.role) || 0) + 1), new Map());
  const commonRole = [...roles].sort((a, b) => b[1] - a[1])[0][0];
  const card = (r) => html`
    <li class="il-rv" data-id="${r.id}" data-role="${r.role.toLowerCase()}" data-rating="${r.rating}" data-posted="${r.posted}">
      <div class="il-rv-head"><b>${r.role}</b><span class="il-pill is-big">${r.rating}/10</span><button type="button" class="il-report">Report</button></div>
      <p class="il-rv-meta">Difficulty to get position: <b>${r.difficulty}/10</b> · Hourly pay: <b>$${r.pay}/hr</b> · ${r.location} · ${r.dates} · Posted ${posted(r.posted)}</p>
      <div class="il-rv-cols"><div><p class="il-k">Pros</p><p>${r.pros}</p></div><div><p class="il-k">Cons</p><p>${r.cons}</p></div></div>
      <p class="il-day"><b>A day in the life:</b> ${r.day}</p>
    </li>`;
  stage.append(frag(html`
    <div class="il il-company">
      <div class="il-nav"><span class="il-logo">Internlog</span><span class="il-links" aria-hidden="true"><span>Search</span><span>Write a review</span><span>Leaderboards</span></span></div>
      <div class="il-co-head">
        <p class="il-badges"><svg class="il-trophy is-gold" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><use href="/assets/icons/sprite.svg#trophy"/></svg><span class="il-verified">✓ Verified</span></p>
        <p class="il-title">Meridian Cloud Systems</p>
        <p class="il-industry">Technology</p>
        <dl class="il-stats">
          <div><dt>Avg rating /10</dt><dd class="is-green"><span data-to="${avg}">${avg.toFixed(1)}</span></dd></div>
          <div><dt>Difficulty to get /10</dt><dd><span data-to="${diff}">${diff.toFixed(1)}</span></dd></div>
          <div><dt>Reviews</dt><dd><span data-to="${reviews.length}" data-int>${reviews.length}</span></dd></div>
          <div class="il-role-stat"><dt>Most common role</dt><dd>${commonRole}</dd></div>
        </dl>
      </div>
      <div class="il-controls">
        <label class="il-filter"><span class="sr-only">Filter reviews by role</span><input type="search" placeholder="Filter reviews by role…" autocomplete="off" spellcheck="false"></label>
        <button type="button" class="il-sort" aria-label="Sort: newest first. Activate to sort by highest rated">Sort: Newest first ▾</button>
      </div>
      <p class="il-count">Reviews (<span data-shown>${reviews.length}</span>)</p>
      <ul class="il-rvs">${raw(reviews.map(card).join(''))}</ul>
      <p class="il-toast" role="status" hidden></p>
    </div>`));
  const root = stage.querySelector('.il-company');
  const list = root.querySelector('.il-rvs');
  const cards = [...list.children];
  const sortBtn = root.querySelector('.il-sort');
  const input = root.querySelector('input');
  const toast = root.querySelector('.il-toast');
  let order = 'newest', toastTimer = 0;

  const apply = () => flip(cards, () => {
    const q = input.value.trim().toLowerCase();
    const sorted = [...cards].sort((a, b) => (order === 'newest' ? b.dataset.posted.localeCompare(a.dataset.posted) : b.dataset.rating - a.dataset.rating || b.dataset.posted.localeCompare(a.dataset.posted)));
    sorted.forEach((c) => { c.hidden = !!q && !c.dataset.role.includes(q); list.append(c); });
    root.querySelector('[data-shown]').textContent = String(cards.filter((c) => !c.hidden).length);
  });
  sortBtn.addEventListener('click', () => {
    order = order === 'newest' ? 'rated' : 'newest';
    sortBtn.textContent = order === 'newest' ? 'Sort: Newest first ▾' : 'Sort: Highest rated ▾';
    sortBtn.setAttribute('aria-label', order === 'newest' ? 'Sort: newest first. Activate to sort by highest rated' : 'Sort: highest rated. Activate to sort by newest first');
    apply();
  });
  input.addEventListener('input', apply);
  list.addEventListener('click', (e) => {
    if (!e.target.closest('.il-report')) return;
    toast.textContent = 'On the live site this flags the review for moderators.';
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
  });

  inspect(list, () => cards.filter((c) => !c.hidden).map((c) => {
    const a = c.getBoundingClientRect(), b = list.getBoundingClientRect(), r = reviews.find((x) => x.id === c.dataset.id);
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + 8, text: `${r.rating}/10 · difficulty ${r.difficulty}/10 · $${r.pay}/hr · posted ${posted(r.posted)}` };
  }), { box: root, label: 'Demo reviews. Arrow keys step through them.', onFocus: (i) => {
    cards.filter((c) => !c.hidden).forEach((c, j) => c.classList.toggle('is-hot', j === i));
    list.classList.toggle('is-inspecting', i >= 0);
  } });

  const stats = [...root.querySelectorAll('[data-to]')];
  const fmt = (el) => (v) => (el.hasAttribute('data-int') ? String(Math.round(v)) : v.toFixed(1));
  const final = () => { root.classList.add('is-final'); stats.forEach((el) => { el.textContent = fmt(el)(Number(el.dataset.to)); }); cards.forEach((c) => c.classList.add('is-in')); };
  const play = async (signal) => {
    root.classList.remove('is-final');
    cards.forEach((c) => c.classList.remove('is-in'));
    stats.forEach((el) => countUp(el, Number(el.dataset.to), { dur: 1100, format: fmt(el), signal }));
    for (const c of cards) { if (signal.aborted) break; c.classList.add('is-in'); await wait(110, signal); }
    await wait(700, signal);
    final();
  };
  return { play, final };
}
