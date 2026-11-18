// E3 · Internlog on a phone (DEMO). The hamburger really opens a menu panel, and a width handle under the
// phone drags the inner viewport between 320, 380 and 430px so the responsive collapse (including the
// small-phone 380px breakpoint) is visible. The inner page uses container queries, so it reacts to the
// phone's width, not the window's. On touch screens the handle is three tap buttons instead.
import { html, frag, inspect } from './svg.js';

const STOPS = [320, 380, 430];

export async function mount(stage) {
  stage.append(frag(html`
    <div class="ph">
      <div class="ph-frame"><div class="ph-screen">
        <div class="ph-page">
          <div class="ph-nav"><span class="il-logo">Internlog</span><button type="button" class="ph-burger" aria-expanded="false" aria-controls="ph-menu" aria-label="Open the demo menu"><i></i><i></i><i></i></button></div>
          <ul class="ph-menu" id="ph-menu" hidden><li>Search</li><li>Write a review</li><li>Leaderboards</li><li>Contact us</li></ul>
          <div class="ph-hero">
            <p class="ph-h">Know what you’re walking into.</p>
            <p class="ph-p">Real reviews from real interns — pay, difficulty to land the role, day-to-day work, and honest pros and cons, organized by company tier.</p>
            <button type="button" class="ph-btn is-gold">Write a review</button>
            <button type="button" class="ph-btn is-ghost">See leaderboards</button>
            <span class="ph-in">Search a company (e.g. Google, a local…)</span>
            <span class="ph-in">Advanced: filter by role</span>
            <button type="button" class="ph-btn is-gold">Search</button>
          </div>
        </div>
      </div></div>
      <div class="ph-size">
        <label class="ph-range"><span class="label">Viewport <b class="ph-w">380</b>px</span>
          <input type="range" min="320" max="430" step="1" value="380" list="ph-stops" aria-valuetext="380 pixels, small-phone breakpoint">
        </label>
        <datalist id="ph-stops"><option value="320"></option><option value="380"></option><option value="430"></option></datalist>
        <div class="ph-taps" role="group" aria-label="Phone width">${STOPS.map((w) => `<button type="button" data-w="${w}" aria-pressed="${w === 380}">${w}px</button>`).join('')}</div>
        <p class="ph-bp label" aria-live="polite"></p>
      </div>
    </div>`));
  const root = stage.querySelector('.ph');
  const screen = root.querySelector('.ph-screen');
  const range = root.querySelector('input');
  const out = root.querySelector('.ph-w');
  const bp = root.querySelector('.ph-bp');
  const burger = root.querySelector('.ph-burger');
  const menu = root.querySelector('.ph-menu');

  const fit = () => {                         // scale the phone down if the frame is narrower than the viewport
    const avail = root.clientWidth - 8, w = Number(range.value) + 20;
    root.style.setProperty('--ph-scale', String(Math.min(1, avail / w)));
  };
  const setW = (w, snap = false) => {
    if (snap) w = STOPS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
    range.value = String(w);
    screen.style.setProperty('--ph-w', `${w}px`);
    out.textContent = String(w);
    const label = w <= 380 ? 'small-phone layout (≤ 380px)' : 'standard phone layout';
    bp.textContent = label;
    range.setAttribute('aria-valuetext', `${w} pixels, ${label}`);
    root.querySelectorAll('.ph-taps button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.w) === w)));
    fit();
  };
  range.addEventListener('input', () => setW(Number(range.value)));
  range.addEventListener('change', () => setW(Number(range.value), true));
  root.querySelectorAll('.ph-taps button').forEach((b) => b.addEventListener('click', () => setW(Number(b.dataset.w))));
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') !== 'true';
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close the demo menu' : 'Open the demo menu');
    menu.hidden = !open;
  });
  new ResizeObserver(fit).observe(root);
  setW(380);

  // Inspect the three breakpoints on the handle.
  const sizeBox = root.querySelector('.ph-size');
  inspect(range, () => STOPS.map((w) => {
    const r = range.getBoundingClientRect(), b = range.getBoundingClientRect();
    return { x: ((w - 320) / 110) * r.width, y: 0, text: `${w}px · ${w <= 380 ? 'small-phone breakpoint' : 'standard phone'}` };
  }), { box: sizeBox, axis: 'x' });

  const final = () => { setW(380); root.classList.add('is-final'); };
  const play = async (signal) => {
    for (const w of [430, 320, 380]) {             // show the collapse once
      if (signal.aborted) break;
      setW(w);
      await new Promise((r) => setTimeout(r, 520));
    }
    final();
  };
  return { play, final };
}
