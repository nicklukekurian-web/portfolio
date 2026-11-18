// The preloader is pure CSS and dismisses itself by 1.2s, so it never blocks
// reading. This only removes it early: on repeat visits in the same session,
// or as soon as the fonts are ready.
const KEY = 'nk-preloaded';

export function initPreloader() {
  const el = document.querySelector('.preloader');
  if (!el) return;
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
  const done = () => { el.classList.add('is-done'); setTimeout(() => el.remove(), 260); };
  if (seen) { el.remove(); return; }
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).then(done);
}
