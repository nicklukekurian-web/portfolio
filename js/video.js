// The Checkpoint demo: a muted, looping autoplay video that costs nothing until you get near it.
//  - No source is attached until the card is within about one screen of the viewport.
//  - It plays when at least 40% is visible and pauses when scrolled away or the tab is hidden.
//  - Under prefers-reduced-motion it never starts by itself: the poster shows with a Play button.
//  - PAUSE (WCAG 2.2.2) and UNMUTE are real buttons with announced state. No browser controls bar.
export function initVideo() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const card of document.querySelectorAll('[data-video]')) setup(card, reduced);
}

function setup(card, reduced) {
  const video = card.querySelector('video');
  // The controls live in the card, or (Home's Checkpoint panel) in a row outside the picture named by data-controls.
  const bar = (card.dataset.controls && document.getElementById(card.dataset.controls)) || card;
  const playBtn = card.querySelector('.video-play');
  const pauseBtn = bar.querySelector('[data-video-pause]');
  const muteBtn = bar.querySelector('[data-video-mute]');
  const status = bar.querySelector('[data-video-status]');
  if (!video || !pauseBtn || !muteBtn) return;

  let attached = false;
  let inView = false;            // at least 40% visible
  let userPaused = false;        // the reader pressed Pause: never auto-resume
  let started = !reduced;        // under reduced motion, nothing plays until the reader asks

  const say = (msg) => { if (status) status.textContent = msg; };
  const labels = () => {
    pauseBtn.textContent = video.paused ? 'Play' : 'Pause';
    pauseBtn.setAttribute('aria-label', video.paused ? 'Play the demo video' : 'Pause the demo video');
    muteBtn.textContent = video.muted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-label', video.muted ? 'Unmute the demo video' : 'Mute the demo video');
    muteBtn.setAttribute('aria-pressed', String(!video.muted));
  };

  function attach() {
    if (attached) return;
    attached = true;
    video.autoplay = false;       // the observer decides when to play, so it never starts below 40% visible
    for (const [type, src] of [['video/mp4', video.dataset.mp4], ['video/webm', video.dataset.webm]]) {
      if (!src) continue;
      const source = document.createElement('source');
      source.src = src;
      source.type = type;
      video.append(source);
    }
    video.load();
  }

  function play() {
    if (!started || userPaused || document.hidden || !inView) return;
    attach();
    const p = video.play();
    if (p && p.catch) p.catch((err) => { if (err.name === 'NotAllowedError' && playBtn) playBtn.hidden = false; });   // autoplay blocked: offer a button
  }
  const pause = () => video.pause();

  video.addEventListener('play', () => { if (playBtn) playBtn.hidden = true; labels(); });
  video.addEventListener('pause', labels);

  pauseBtn.addEventListener('click', () => {
    if (video.paused) {
      userPaused = false; started = true; attach();
      video.play().then(() => say('Video playing')).catch(() => {});
    } else {
      userPaused = true; pause(); say('Video paused');
    }
  });
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    labels();
    say(video.muted ? 'Sound off' : 'Sound on');
  });
  playBtn?.addEventListener('click', () => {
    userPaused = false; started = true; attach();
    video.play().then(() => say('Video playing')).catch(() => {});
  });

  if (reduced) {
    video.removeAttribute('autoplay');
    if (playBtn) playBtn.hidden = false;
  }
  labels();

  if (!('IntersectionObserver' in window)) { if (playBtn) playBtn.hidden = false; return; }
  // On Home the card sits in a scroll-driven panel (js/journey/panels.js) that stays in a sticky stage just below
  // the fold while invisible; there the panel's own events decide (panel:near, panel:visibility). In the static
  // layout (reduced motion, no WebGL, no JS styling) the panels are a plain list and the observers decide.
  const panel = card.closest('.sw-panel');
  const driven = () => !!panel && !document.documentElement.classList.contains('journey-static');
  let ratioOk = false, panelShown = false;
  const update = () => { inView = ratioOk && (!driven() || panelShown); inView ? play() : pause(); };
  if (panel) {
    panel.addEventListener('panel:near', () => { if (!reduced) attach(); }, { once: true });
    panel.addEventListener('panel:visibility', (e) => { panelShown = e.detail.shown; update(); });
  }
  // Attach the source only when the card is within about one screen of the viewport.
  const near = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting) || driven()) return;
    if (!reduced) { attach(); play(); }
    near.disconnect();
  }, { rootMargin: '100% 0px' });
  near.observe(card);
  // Play at 40% visible, pause when it leaves.
  new IntersectionObserver((entries) => { ratioOk = entries[entries.length - 1].intersectionRatio >= 0.4; update(); }, { threshold: [0, 0.4] }).observe(video);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
}
