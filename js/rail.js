// Proof page index rail: highlight the section in view and show reading progress.
export function initRail() {
  const links = new Map([...document.querySelectorAll('.rail-list a')].map((a) => [a.hash.slice(1), a]));
  const bar = document.querySelector('.rail-progress');
  const setActive = (id) => {
    for (const [key, a] of links) {
      if (key === id) {
        a.setAttribute('aria-current', 'true');
        const list = a.closest('.rail-list');
        if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' });
      } else a.removeAttribute('aria-current');
    }
  };
  const io = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) setActive(visible[0].target.id);
  }, { rootMargin: '-30% 0px -60% 0px' });
  for (const id of links.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }

  let ticking = false;
  const progress = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar?.style.setProperty('--read', max > 0 ? (scrollY / max).toFixed(3) : '0');
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(progress); } }, { passive: true });
  progress();
}
