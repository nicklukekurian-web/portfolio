// Entry point. Shared chrome is static HTML; this wires behavior, then loads
// each page's own modules (by body[data-page]) after first paint.
import { initTheme } from './theme.js';
import { initMenu } from './menu.js';
import { initSmoothScroll } from './utils/scroll.js';
import { initScramble } from './components/scramble.js';

document.documentElement.classList.add('js');
const page = document.body.dataset.page;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (page === 'styleguide') (await import('./styleguide.js')).initStyleguide();

initTheme();
initMenu();
initSmoothScroll();
initScramble();

// Header fade: once the page has scrolled, headings must not run under the fixed header.
{
  let queued = false;
  const mark = () => { queued = false; document.documentElement.classList.toggle('is-scrolled', scrollY > 8); };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(mark); } }, { passive: true });
  mark();
}
if (page === 'home') (await import('./preloader.js')).initPreloader();
if (document.querySelector('[data-copy-email]')) (await import('./copy-email.js')).initCopyEmail();

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
idle(() => {
  // Fetch every module this page needs at once (a serial chain of awaits delays the last ones), then start each.
  const jobs = [];
  const load = (needed, path, start) => { if (needed) jobs.push(import(path).then(start)); };
  const portrait = document.querySelector('[data-portrait]');
  const detector = document.getElementById('detector');
  load(portrait, './portrait.js', (m) => m.initPortrait(portrait, { reduced }));
  load(document.querySelector('.chapter'), './chapters.js', (m) => m.initChapters({ reduced }));
  load(document.querySelector('.journey-work'), './journey/journey.js', (m) => m.initJourney());
  load(document.querySelector('[data-type-in]'), './components/type-in.js', (m) => m.initTypeIn());
  load(document.querySelector('.scroll-cue'), './core/autoscroll.js', (m) => m.initAutoScroll(document.querySelector('.scroll-cue')));
  load(document.querySelector('canvas[data-scene]'), './scenes.js', (m) => m.initScenes({ reduced }));
  load(detector, './detector-demo.js', (m) => m.initDetectorDemo(detector));
  load(document.querySelector('[data-chart]'), './charts.js', (m) => m.initCharts());
  load(document.querySelector('[data-site-link-row], [data-site-image]'), './site-links.js', (m) => m.initSiteLinks());
  load(document.querySelector('[data-exhibit]'), './exhibits/exhibit.js', (m) => m.initExhibits());
  load(document.querySelector('.bp-pipe'), './exhibits/pipeline.js', (m) => m.initPipeline());
  load(document.querySelector('[data-video]'), './video.js', (m) => m.initVideo());
  load(document.querySelector('[data-lightbox]'), './lightbox.js', (m) => m.initLightbox());
  load(page === 'proof', './rail.js', (m) => m.initRail());
  return Promise.all(jobs);
});
