// Round 5 A4: the two "Find me here and let's connect" headings type themselves in, then a block caret blinks.
// - The full text is in the DOM the whole time. The untyped part is hidden by a CSS Custom Highlight
//   (::highlight(type-in) { color: transparent }), a paint-only mask: no spans are added, nothing is re-laid out,
//   textContent and the accessible name never change. Where Highlight is unsupported the text simply shows.
// - About 40 ms per character. The caret follows the last typed character with a transform, then rests after
//   the last glyph (it is absolutely placed inside the nowrap last word, so it never moves the centering).
// - data-type-in="load": on screen when the page opens (Contact); starts once the fonts are ready.
//   data-type-in="view": starts the first time 40% of it is on screen (Home's contact chapter).
// - Until this runs, css/components.css holds the text back for at most 2.5 s, so it can't flash in and back out.
// - prefers-reduced-motion: the full text and a steady caret.
export const MS_PER_CHAR = 40;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const supported = () => typeof Highlight === 'function' && !!globalThis.CSS?.highlights;

export function initTypeIn(root = document) {
  const els = [...root.querySelectorAll('[data-type-in]')];
  if (!els.length) return;
  let hl = null;
  if (!reduced() && supported()) {
    hl = CSS.highlights.get('type-in') || new Highlight();
    CSS.highlights.set('type-in', hl);
  }
  for (const el of els) setup(el, hl);
}

function textNodes(el) {
  const out = [];
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) if (!t.parentElement.closest('[aria-hidden="true"]')) out.push(t);
  return out;
}

function setup(el, hl) {
  if (el.dataset.typed) return;
  const caret = el.querySelector('.ti-caret');
  const finish = () => {
    el.dataset.typed = 'done';
    el.classList.remove('is-typing');
    if (caret) caret.style.transform = '';
  };
  if (!hl) { finish(); return; }

  // Every character from the first visible one to the last, as (text node, offset).
  const nodes = textNodes(el);
  const chars = [];
  for (const n of nodes) for (let i = 0; i < n.data.length; i++) if (!/\s/.test(n.data[i]) || chars.length) chars.push([n, i]);
  while (chars.length && /\s/.test(chars.at(-1)[0].data[chars.at(-1)[1]])) chars.pop();
  if (!chars.length) { finish(); return; }
  const last = nodes.at(-1);
  const mask = new Range();
  mask.setStart(chars[0][0], chars[0][1]);
  mask.setEnd(last, last.data.length);
  hl.add(mask);
  el.dataset.typed = 'masked';                     // releases the CSS hold; the highlight hides the text now
  el.classList.add('is-typing');

  const charRect = (k) => { const r = new Range(); r.setStart(chars[k][0], chars[k][1]); r.setEnd(chars[k][0], chars[k][1] + 1); return r.getBoundingClientRect(); };
  // Before the first character the caret waits at the start of the first line.
  const place = (k) => {
    if (!caret) return;
    const end = charRect(chars.length - 1);
    const r = k < 0 ? charRect(0) : charRect(k);
    const x = (k < 0 ? r.left : r.right) - end.right;
    caret.style.transform = `translate(${x.toFixed(1)}px, ${(r.top - end.top).toFixed(1)}px)`;
  };
  place(-1);

  function type() {
    let shown = 0, t0 = 0;
    const tick = (now) => {
      t0 ||= now;
      const k = Math.min(chars.length, Math.floor((now - t0) / MS_PER_CHAR) + 1);
      if (k !== shown) {
        shown = k;
        if (k >= chars.length) { hl.delete(mask); finish(); return; }
        mask.setStart(chars[k][0], chars[k][1]);
        place(k - 1);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  if (el.dataset.typeIn === 'load') {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(type, 120));
    return;
  }
  new IntersectionObserver((entries, io) => {
    if (entries.some((e) => e.intersectionRatio >= 0.4)) { io.disconnect(); type(); }
  }, { threshold: 0.4 }).observe(el);
}
