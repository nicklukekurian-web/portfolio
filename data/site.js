// Every link and flag on the site lives here. Copy comes from docs/build/CONTENT.md.
export const DOMAIN = 'https://nickkurian.dev';

export const site = {
  name: 'Nicholas Kurian',
  shortName: 'Nick',
  email: 'nick.luke.kurian@gmail.com',
  location: 'Allen, TX (Dallas–Fort Worth)',
  resume: 'assets/Nicholas_Kurian_Resume.pdf',
  links: {
    github: 'https://github.com/nicklukekurian-web',
    linkedin: 'https://www.linkedin.com/in/nick-kurian/',
    internlogRepo: 'https://github.com/nicklukekurian-web/Internlog',
    internlogLive: 'https://internlog-onrender-com.onrender.com/',
    flyrankRepo: 'https://github.com/nicklukekurian-web/flyrank-ml-internship',
    checkpointRepo: 'https://github.com/nicklukekurian-web/checkpoint-study-path',
    mindsoftRepo: 'https://github.com/nicklukekurian-web/mindsoft-solutions-website',
    source: 'https://github.com/nicklukekurian-web/portfolio',
    // Leave empty until NCL issues Scouting Reports. While it is empty the Proof page shows no report link.
    // TODO(nick): paste the Scouting Report link here when you have it, and use it to confirm the NCL rank and total.
    nclScoutingReport: '',
  },
  huggingface: {
    // Off until the profile has a public model, dataset or Space. The URL is deliberately not stored here:
    // add it together with `enabled: true` when the profile is ready (tests fail if it appears anywhere before).
    enabled: false,
    url: '',
  },
  // NCL digital badge, issued 2026-11-18 (Round 6). Proof renders it from this object (js/site-links.js): a <picture>
  // with the WebP and the PNG fallback, the real pixel size, this alt text and this caption. Set it to '' to hide the
  // slot again. Wording rule: the exact word "Diamond" only; no tier number, and the badge image's own percentile line
  // is never repeated in page text (tests/content-guard.test.js).
  nclBadge: {
    webp: '/assets/img/ncl-digital-badge.webp',
    png: '/assets/img/ncl-digital-badge.png',
    width: 575,
    height: 835,
    alt: 'NCL Fall 2026 Individual Game Diamond badge for nickkurian, earned 2026-11-18.',
    caption: 'Digital badge issued by NCL (Cyber Skyline), earned 2026-11-18.',
    earned: '2026-11-18',
  },
  updated: 'Nov 2026',
};
