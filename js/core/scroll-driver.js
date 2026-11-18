// The one scroll controller for the Selected Work → About journey.
// - Never hijacks scrolling: the document scrolls natively; this only *reads* scrollY, once per frame.
// - Critically damped smoothing: y += (scrollY − y)·(1 − e^(−dt·k)), k ≈ 10, so wheel notches and trackpad
//   flicks glide with ~100 ms of lag. Uses real dt, so it is frame-rate independent. Snaps under reduced motion.
// - Subscribers get (y, velocity px/s, dt s, now ms) and return true while they need more frames (a scene
//   that animates with time), so the loop sleeps when nothing moves and wakes on the next scroll.
const K = 10;
const subs = new Set();
let y = typeof scrollY === 'number' ? scrollY : 0, vel = 0, last = 0, raf = 0, snap = false;

function frame(now) {
  raf = 0;
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
  last = now;
  const target = scrollY;                                   // the only scroll read
  const prev = y;
  y = snap ? target : y + (target - y) * (1 - Math.exp(-dt * K));
  if (Math.abs(target - y) < 0.05) y = target;
  vel = (y - prev) / dt;
  let more = y !== target;
  for (const fn of subs) if (fn(y, vel, dt, now)) more = true;
  if (more) raf = requestAnimationFrame(frame); else last = 0;
}

export function wake() { if (!raf) raf = requestAnimationFrame(frame); }

export const driver = {
  get y() { return y; },
  get velocity() { return vel; },
  /** fn(y, vel, dt, now) → true to keep frames coming. Returns an unsubscribe function. */
  add(fn) { subs.add(fn); wake(); return () => subs.delete(fn); },
  setSnap(on) { snap = on; if (on) y = scrollY; wake(); },
  /** Jump without gliding (after a resize or a layout change). */
  sync() { y = scrollY; wake(); },
};

addEventListener('scroll', wake, { passive: true });
addEventListener('resize', wake);
