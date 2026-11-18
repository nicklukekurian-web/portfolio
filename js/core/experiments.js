// Offline A/B switches (Round 5 B8). Dev and test builds only: scripts/build.sh sets DEV = false in dist/, so
// production always serves the defaults and reads nothing from the URL. No random assignment, nothing stored.
//   ?exp=header:solid,tier:low,portal:190,pace:320
// Only these names and values are accepted; anything else is ignored (never reflected into the page).
import { DEV } from './env.js';

const ALLOWED = {
  header: ['xray', 'solid'],          // the X-ray gradient + blur header (default) or a solid backdrop
  tier: ['full', 'medium', 'low'],    // particle and scene quality, fixed (default: adaptive)
  portal: ['100', '150', '190'],      // portal length in vh (default 150)
  pace: ['200', '250', '320'],        // auto-scroll px/s, fixed (default 0.28 × viewport height, clamped)
};

function parse() {
  if (!DEV) return {};
  const out = {};
  const raw = new URLSearchParams(location.search).get('exp');
  if (!raw || raw.length > 120) return out;
  for (const pair of raw.split(',')) {
    const [name, value] = pair.split(':');
    if (Object.hasOwn(ALLOWED, name) && ALLOWED[name].includes(value)) out[name] = value;
  }
  return out;
}

export const exp = Object.freeze(parse());
if (exp.header === 'solid') document.documentElement.classList.add('exp-header-solid');
