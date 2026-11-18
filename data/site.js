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
    nclScoutingReport: '',
  },
  huggingface: {
    // Off until the profile has a public model, dataset or Space. The URL is deliberately not stored here:
    // add it together with `enabled: true` when the profile is ready (tests fail if it appears anywhere before).
    enabled: false,
    url: '',
  },
  // NCL digital badge image (a path under /assets/img/). Leave empty until NCL issues the badge:
  // while it is empty the Proof page renders no badge slot at all.
  nclBadge: '',
  updated: 'Nov 2026',
};
