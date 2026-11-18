// Chapter cut: a ~400ms glitch when the active chapter changes (hero > work > about > contact).
// One SVG filter (#cut, in index.html) runs over the live stages, so it displaces real pixels:
// a stepped noise map moves horizontal slices sideways by different amounts, the red and blue
// channels slide apart, and a scanline/noise surge flashes over the top; then it settles to the
// untouched stage. The barrel edges and vignette are separate layers, so they never change.
// Reduced motion: no glitch, only a plain 150ms cross-fade (.cut-fade).

const STEP = 50;                                            // ms per step: stepped, like a bad signal
const ENVELOPE = [0.35, 1, 0.55, 0.9, 0.4, 0.7, 0.2, 0];   // intensity at each step: 8 steps = 400ms
const MAX_SHIFT = 110;                                      // feDisplacementMap scale: slices move up to about 40px
const MAX_SPLIT = 9;                                        // px each colour channel slides

export function createCut({ reduced = false } = {}) {
  const filter = document.getElementById('cut');
  const noise = filter?.querySelector('feTurbulence');
  const shift = filter?.querySelector('feDisplacementMap');
  const red = filter?.querySelector('[data-split="r"]');
  const blue = filter?.querySelector('[data-split="b"]');
  const surge = document.querySelector('.cut-surge');
  let running = false;

  const visibleStages = () => [...document.querySelectorAll('.stage-hero, .chapter .stage')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight;
  });

  function fade(stages) {
    for (const s of stages) {
      s.classList.remove('cut-fade');
      void s.offsetWidth;                                   // restart the animation
      s.classList.add('cut-fade');
      setTimeout(() => s.classList.remove('cut-fade'), 200);
    }
  }

  function apply(level) {
    const side = Math.random() < 0.5 ? -1 : 1;
    noise.setAttribute('seed', String(1 + Math.floor(Math.random() * 500)));   // new slices every step
    shift.setAttribute('scale', String(Math.round(MAX_SHIFT * level)));
    red.setAttribute('dx', String((-side * MAX_SPLIT * level * (0.6 + Math.random() * 0.4)).toFixed(1)));
    blue.setAttribute('dx', String((side * MAX_SPLIT * level * (0.6 + Math.random() * 0.4)).toFixed(1)));
  }

  return function play() {
    const stages = visibleStages();
    if (!stages.length) return;
    if (reduced || !filter || !noise || !shift || !red || !blue) { fade(stages); return; }
    if (running) return;
    running = true;
    for (const s of stages) s.classList.add('is-cutting');
    surge?.classList.add('is-on');
    const t0 = performance.now();
    let last = -1;
    const frame = (now) => {
      const i = Math.floor((now - t0) / STEP);
      if (i >= ENVELOPE.length) {                           // settle: remove the filter entirely
        for (const s of stages) s.classList.remove('is-cutting');
        surge?.classList.remove('is-on');
        apply(0);
        running = false;
        return;
      }
      if (i !== last) { last = i; apply(ENVELOPE[i]); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
}
