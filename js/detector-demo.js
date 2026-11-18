// "Try the detector": a simplified, client-side port of Internlog's rule-based
// spamScorer.js. Same five signals and thresholds; no network, synthetic data only.

export const THRESHOLDS = {
  extremelyShort: 20, veryShort: 60, minTokensForTtr: 6, ttr: 0.4,
  dup: [0.8, 0.5, 0.3], extremeRatingChars: 100, medium: 30, high: 60,
};
const GENERIC = ['very good', 'really good', 'pretty good', 'so good', 'good experience', 'great experience',
  'good company', 'great company', 'nice people', 'learned a lot', 'chill', 'easy job', 'not bad',
  'it was fine', 'good job', 'na', 'none', 'nothing', 'no comment'];
const URL_RE = /(https?:\/\/|www\.)[^\s]+/gi;
const ABUSED_TLD = /\.(xyz|top|click|loan|work|men|gq|tk|ml|cf|ga)(\/|\s|$)/i;

// Three synthetic "existing reviews" for the near-duplicate check.
export const SAMPLES = [
  { id: 'r-101', text: 'Great team and a real project from day one. My manager checked in twice a week and code reviews were thorough.' },
  { id: 'r-102', text: 'The internship was mostly data cleaning in spreadsheets, but the analysts were patient and explained the business side.' },
  { id: 'r-103', text: 'Interview had two rounds: a take-home SQL task and a 45 minute call about the take-home with the hiring manager.' },
];
export const EXAMPLES = {
  junk: { pros: 'Very good company, learned a lot', cons: 'none', dayInLife: 'chill', rating: 10 },
  real: {
    pros: 'I shipped a small feature to the internal dashboard in week four, and my mentor reviewed every pull request the same day.',
    cons: 'Onboarding docs were out of date, so the first two days went to setting up the VPN and local database.',
    dayInLife: 'Standup at 9:30, then tickets until lunch. Afternoons were pairing on the reporting service and writing tests.',
    rating: 8,
  },
};

const normalize = (t) => (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokenize = (t) => { const n = normalize(t); return n ? n.split(' ') : []; };
function shingles(text, n = 3) {
  const tk = tokenize(text);
  if (tk.length < n) return new Set(tk.length ? [tk.join(' ')] : []);
  const s = new Set();
  for (let i = 0; i <= tk.length - n; i++) s.add(tk.slice(i, i + n).join(' '));
  return s;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

// The five signals in the order the diagram lists them, with the rule each applies (from THRESHOLDS, never retyped).
export const SIGNAL_RULES = [
  { id: 'length', label: 'Length + vocabulary', rule: `Under ${THRESHOLDS.extremelyShort} chars +30, under ${THRESHOLDS.veryShort} +15; under ${THRESHOLDS.ttr * 100}% unique words (${THRESHOLDS.minTokensForTtr}+ words) +15; identical fields +20`, max: 65 },
  { id: 'duplicate', label: 'Near-duplicate (Jaccard)', rule: `Word 3-gram overlap with existing reviews: ${THRESHOLDS.dup[0] * 100}%+ +40, ${THRESHOLDS.dup[1] * 100}%+ +20, ${THRESHOLDS.dup[2] * 100}%+ +8`, max: 40 },
  { id: 'rating', label: 'Rating extremity', rule: `A 1 or 10 rating with under ${THRESHOLDS.extremeRatingChars} chars of text +15`, max: 15 },
  { id: 'templated', label: 'Templated phrasing', rule: 'Generic phrases ("none", "learned a lot"…) in short text: +15 each, up to 2', max: 30 },
  { id: 'links', label: 'Links + abused domains', rule: 'Any URL +25; a commonly abused TLD +20 more', max: 45 },
];

export const levelFor = (score) => (score >= THRESHOLDS.high ? 'high' : score >= THRESHOLDS.medium ? 'medium' : 'low');

export const MAX_FIELD = 1500;   // the textareas' maxlength, enforced here too (bounded work per keystroke)
export function scoreReview(review, existing = SAMPLES) {
  const fields = [review.pros, review.cons, review.dayInLife].filter(Boolean).map((f) => String(f).slice(0, MAX_FIELD));
  const text = fields.join(' ');
  const tokens = tokenize(text);
  const len = text.trim().length;
  const reasons = [];
  const signals = { length: 0, duplicate: 0, rating: 0, templated: 0, links: 0 };   // points per signal
  let pts = 0;
  const details = [];                                                                // [{ signal, points, reason }] in order
  const add = (signal, points, reason) => { pts += points; signals[signal] += points; reasons.push(reason); details.push({ signal, points, reason }); };
  // 1. Length and vocabulary diversity
  if (len < THRESHOLDS.extremelyShort) add('length', 30, 'Extremely short review text (<20 chars)');
  else if (len < THRESHOLDS.veryShort) add('length', 15, 'Very short review text (<60 chars)');
  if (tokens.length >= THRESHOLDS.minTokensForTtr) {
    const ttr = new Set(tokens).size / tokens.length;
    if (ttr < THRESHOLDS.ttr) add('length', 15, `Low vocabulary diversity (${Math.round(ttr * 100)}% unique words)`);
  }
  const norm = fields.map(normalize).filter(Boolean);
  if (norm.length >= 2 && new Set(norm).size === 1) add('length', 20, 'Pros/cons/day-in-life fields are identical');
  // 2. Generic or templated phrasing
  const flat = normalize(text);
  const hits = GENERIC.filter((p) => new RegExp(`(^|\\s)${p}($|\\s)`).test(flat));
  if (hits.length) {
    if (tokens.length <= 15) add('templated', 15 * Math.min(hits.length, 2), `Generic/templated phrasing ("${hits[0]}")`);
    else if (tokens.length <= 30 && hits.length >= 2) add('templated', 15, `Multiple generic/templated phrases ("${hits.join('", "')}")`);
    else if (hits.length >= 3) add('templated', 10, 'Multiple generic/templated phrases');
  }
  // 3. Near-duplicate (Jaccard on word 3-grams)
  const mine = shingles(text);
  let best = 0, bestId = '';
  if (mine.size) for (const r of existing) { const s = jaccard(mine, shingles(r.text)); if (s > best) { best = s; bestId = r.id; } }
  const pct = Math.round(best * 100);
  if (best >= THRESHOLDS.dup[0]) add('duplicate', 40, `Near-duplicate of existing review ${bestId} (${pct}% similar)`);
  else if (best >= THRESHOLDS.dup[1]) add('duplicate', 20, `Overlaps significantly with existing review ${bestId} (${pct}% similar)`);
  else if (best >= THRESHOLDS.dup[2]) add('duplicate', 8, `Some overlap with an existing review (${pct}% similar)`);
  // 4. Links
  const urls = text.match(URL_RE) || [];
  if (urls.length) {
    add('links', 25, `Contains ${urls.length} URL${urls.length > 1 ? 's' : ''} in review text`);
    if (urls.some((u) => ABUSED_TLD.test(u))) add('links', 20, 'Link uses a commonly-abused TLD');
  }
  // 5. Extreme rating with thin text
  const rating = Number(review.rating);
  if ((rating === 1 || rating === 10) && len < THRESHOLDS.extremeRatingChars) {
    add('rating', 15, `Extreme rating (${rating}/10) paired with thin review text`);
  }
  const score = Math.max(0, Math.min(100, Math.round(pts)));
  return { score, level: levelFor(score), reasons, signals, details };
}

// DOM wiring. Expects the markup in proof.html (#detector).
export function initDetectorDemo(root) {
  const field = (name) => root.querySelector(`[name="${name}"]`);
  const form = { pros: field('pros'), cons: field('cons'), dayInLife: field('dayInLife'), rating: field('rating') };
  const out = { score: root.querySelector('[data-score]'), meter: root.querySelector('.meter'), level: root.querySelector('.level-chip'), reasons: root.querySelector('.reasons'), rating: root.querySelector('[data-rating-value]') };
  const item = (text, cls) => { const li = document.createElement('li'); if (cls) li.className = cls; li.textContent = text; return li; };
  const read = () => ({ pros: form.pros.value, cons: form.cons.value, dayInLife: form.dayInLife.value, rating: form.rating.value });
  function render() {
    const input = read();
    if (![input.pros, input.cons, input.dayInLife].some((t) => t.trim())) {   // empty: prompt, don't score
      out.rating.textContent = `${form.rating.value}/10`;
      out.score.textContent = '--';
      out.meter.style.setProperty('--score', 0);
      out.level.dataset.level = 'low';
      out.level.textContent = 'waiting';
      out.reasons.replaceChildren(item('Type a review, or try one of the examples.', 'none'));
      return;
    }
    const r = scoreReview(input);
    out.rating.textContent = `${form.rating.value}/10`;
    out.score.textContent = String(r.score);
    out.meter.style.setProperty('--score', r.score);
    out.level.dataset.level = r.level;
    out.level.textContent = r.level;
    // Reasons can quote what the visitor typed: text nodes only, never HTML (Round 5 B7).
    out.reasons.replaceChildren(...(r.reasons.length ? r.reasons.map((x) => item(x)) : [item('No signals fired.', 'none')]));
  }
  function fill(example) {
    for (const k of ['pros', 'cons', 'dayInLife', 'rating']) form[k].value = example[k];
    render();
  }
  root.addEventListener('input', render);
  root.querySelector('[data-example="junk"]').addEventListener('click', () => fill(EXAMPLES.junk));
  root.querySelector('[data-example="real"]').addEventListener('click', () => fill(EXAMPLES.real));
  render();
}
