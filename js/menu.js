// Compact menu panel: aria-expanded, focus trap, Esc closes, focus returns to the toggle.
import { linksToThisPage } from './utils/scroll.js';
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function initMenu() {
  const toggle = document.querySelector('.menu-toggle');
  const panel = document.getElementById('menu-panel');
  const backdrop = document.querySelector('.menu-backdrop');
  if (!toggle || !panel) return;

  const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  // A stable name (Round 5 B5): the visible MENU / CLOSE labels scramble on hover, and axe caught the button
  // nameless mid-scramble. Each name is its visible word (WCAG 2.5.3); aria-expanded says the rest.
  toggle.setAttribute('aria-label', 'Menu');
  function open() {
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close');
    panel.hidden = false;
    document.body.classList.add('menu-open');
    const first = panel.querySelector(FOCUSABLE);
    if (first) first.focus();
  }
  function close({ restoreFocus = true } = {}) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menu');
    panel.hidden = true;
    document.body.classList.remove('menu-open');
    if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  if (backdrop) backdrop.addEventListener('click', () => close());

  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // Trap focus inside toggle + panel.
    const items = [toggle, ...panel.querySelectorAll(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // A link to this same page scrolls (see utils/scroll.js): close the menu first so the page can move.
  panel.addEventListener('click', (e) => {
    if (linksToThisPage(e.target.closest('a[href]'))) close({ restoreFocus: false });
  });
}
