// Theme: dark by default, OS preference on first visit, explicit choice remembered.
const KEY = 'nk-theme';

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function write(value) {
  try { localStorage.setItem(KEY, value); } catch { /* private mode: choice lasts this page only */ }
}

export function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('[data-theme-set]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === theme));
  });
  document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function initTheme() {
  const saved = read();
  if (saved === 'light' || saved === 'dark') applyTheme(saved);
  else applyTheme(currentTheme());
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-set]');
    if (!btn) return;
    write(btn.dataset.themeSet);
    applyTheme(btn.dataset.themeSet);
  });
}
