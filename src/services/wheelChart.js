// Maturity wheel — concentric-circle, sectioned visualization of a cycle's
// ratings. Requested directly: "concentric circles for levels and being
// sectioned for each indicator." Pure server-side SVG generation, no chart
// library — consistent with the app's "no frontend build step" approach.
//
// Two modes:
//   'indicators' — 19 sectors (one per indicator), grouped contiguously by
//                  domain, radius = that indicator's level (0-5).
//   'domains'    — 4 sectors (one per domain), radius = the domain's
//                  average level. Used for the public tier, which only
//                  discloses domain-level bands, not raw indicator scores.

// DigiProf palette: two cyan shades + two purple shades, no other hues.
// The hex values are the light-theme truth (used by anything that needs a
// literal colour, e.g. a legend swatch); the SVG itself paints through
// --wheel-a..--wheel-d, which style.css re-points for dark and high-contrast
// themes so the wheel stays readable instead of turning into four dark
// smudges on a dark background.
const DOMAIN_COLORS = { A: '#1f4b53', B: '#307e8c', C: '#622582', D: '#4a1c63' };
const DOMAIN_VARS = { A: 'var(--wheel-a)', B: 'var(--wheel-b)', C: 'var(--wheel-c)', D: 'var(--wheel-d)' };
const DOMAIN_ORDER = ['A', 'B', 'C', 'D'];

function polarToCartesian(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// A filled "wedge" (annular sector) from radius 0 (or innerHole) to `r`,
// spanning [startAngle, endAngle] degrees.
function wedgePath(cx, cy, r, startAngle, endAngle, innerHole) {
  const outerStart = polarToCartesian(cx, cy, r, endAngle);
  const outerEnd = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  if (innerHole > 0) {
    const innerStart = polarToCartesian(cx, cy, innerHole, endAngle);
    const innerEnd = polarToCartesian(cx, cy, innerHole, startAngle);
    return [
      'M', outerStart.x, outerStart.y,
      'A', r, r, 0, largeArc, 0, outerEnd.x, outerEnd.y,
      'L', innerEnd.x, innerEnd.y,
      'A', innerHole, innerHole, 0, largeArc, 1, innerStart.x, innerStart.y,
      'Z',
    ].join(' ');
  }
  return [
    'M', cx, cy,
    'L', outerStart.x, outerStart.y,
    'A', r, r, 0, largeArc, 0, outerEnd.x, outerEnd.y,
    'Z',
  ].join(' ');
}

/**
 * @param {Array<{code:string, domain:string, level:number|null, name?:string}>} items
 * @param {object} opts { mode, size, showLabels, title, t }
 *   t — the translate function; the wheel's tooltips and its accessible
 *   description are read by people, so they can't be hardcoded English.
 * @returns {string} raw <svg>...</svg> markup
 */
function renderWheel(items, opts = {}) {
  const size = opts.size || 420;
  const cx = size / 2;
  const cy = size / 2;
  const innerHole = size * 0.09;
  const outerRadius = size * 0.42;
  const labelRadius = outerRadius + size * 0.055;
  const ringCount = 5; // levels 1-5 drawn as rings beyond the hole; level 0 = the hole itself
  const showLabels = opts.showLabels !== false;
  // Falls back to the key itself if no translator was passed, which is
  // conspicuous enough to catch in review but never crashes a render.
  const t = opts.t || ((key) => key);
  const titleId = 'wheel-title-' + Math.random().toString(36).slice(2, 9);

  const n = items.length;
  const gapDeg = n <= 4 ? 1.2 : 0.6; // slightly wider gaps for the coarser domain wheel
  const sectorDeg = 360 / n;

  // role="img" + <title> makes the wheel a single labelled graphic rather
  // than a pile of unlabelled paths. The exact levels are always also present
  // as text in the table beside it, so nothing is conveyed by the picture
  // alone — the wheel is a summary, not the only copy of the data.
  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" `
    + `role="img" aria-labelledby="${titleId}" style="max-width:100%;height:auto" font-family="inherit">`;
  svg += `<title id="${titleId}">${t('wheel_title')}</title>`;

  // Concentric level gridlines (0 = the inner hole boundary, 5 = outer edge)
  for (let lvl = 0; lvl <= ringCount; lvl++) {
    const r = innerHole + (lvl / ringCount) * (outerRadius - innerHole);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" />`;
  }
  if (showLabels) {
    for (let lvl = 0; lvl <= ringCount; lvl++) {
      const r = innerHole + (lvl / ringCount) * (outerRadius - innerHole);
      svg += `<text x="${cx + 3}" y="${(cy - r + 9).toFixed(1)}" font-size="9" fill="var(--text-muted)">${lvl}</text>`;
    }
  }

  // Wedges
  items.forEach((item, i) => {
    const start = i * sectorDeg + gapDeg / 2;
    const end = (i + 1) * sectorDeg - gapDeg / 2;
    const level = item.level === null || item.level === undefined ? 0 : item.level;
    const r = innerHole + (level / ringCount) * (outerRadius - innerHole);
    const color = DOMAIN_VARS[item.domain] || 'var(--text-muted)';
    const opacity = item.level === null || item.level === undefined ? 0.2 : 0.9;
    svg += `<path d="${wedgePath(cx, cy, Math.max(r, innerHole + 2), start, end, innerHole)}" fill="${color}" fill-opacity="${opacity}" stroke="var(--surface)" stroke-width="1">`;
    const levelText = item.tooltipSuffix === 'band'
      ? `${t('band')} ${item.level ?? '—'}/4`
      : `${t('level_label')} ${item.level ?? '—'}`;
    svg += `<title>${item.code}${item.name ? ' — ' + item.name : ''}: ${levelText}</title>`;
    svg += '</path>';
  });

  // Sector labels (indicator codes / domain names) around the outside
  if (showLabels) {
    items.forEach((item, i) => {
      const mid = i * sectorDeg + sectorDeg / 2;
      const pos = polarToCartesian(cx, cy, labelRadius, mid);
      const anchor = mid > 180 ? 'end' : mid === 0 || mid === 180 ? 'middle' : 'start';
      svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-size="${n > 10 ? 9 : 11}" fill="var(--text)" text-anchor="${anchor}" dominant-baseline="middle">${item.code}</text>`;
    });
  }

  // Center hole label
  svg += `<circle cx="${cx}" cy="${cy}" r="${innerHole}" fill="var(--surface)" stroke="var(--border)" />`;

  svg += '</svg>';
  return svg;
}

function itemsFromRatings(ratings, indicators) {
  return indicators
    .slice()
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain))
    .map((ind) => {
      const r = ratings.find((x) => x.indicatorCode === ind.code);
      return { code: ind.code, domain: ind.domain, name: ind.name, level: r ? r.level : null };
    });
}

// Public disclosure policy is band-level only ("Just starting"..."Leading"),
// never raw indicator/domain averages — so the wheel used for the public
// tier must encode a band, not a continuous score rounded to one decimal.
// routes/public.js calls scoreToBandIndex for its text labels too, so the
// picture and the words can never disagree about which band a school is in.
const PUBLIC_BAND_THRESHOLDS = [1, 2, 3, 4]; // score < threshold[i] -> band i; else band 4
function scoreToBandIndex(score) {
  if (score === null || score === undefined) return null;
  for (let i = 0; i < PUBLIC_BAND_THRESHOLDS.length; i++) {
    if (score < PUBLIC_BAND_THRESHOLDS[i]) return i;
  }
  return PUBLIC_BAND_THRESHOLDS.length; // 4 = top band
}

function itemsFromDomainScores(domainScores, t) {
  const label = t || ((key) => key);
  return DOMAIN_ORDER.map((d) => ({
    code: d,
    domain: d,
    name: label('domain_' + d + '_short'),
    level: scoreToBandIndex(domainScores[d]),
    // Rendered in the tooltip instead of "Level N" — the public wheel must
    // never reveal the raw average through a hover/DOM-inspection either.
    tooltipSuffix: 'band',
  }));
}

module.exports = { renderWheel, itemsFromRatings, itemsFromDomainScores, scoreToBandIndex, DOMAIN_COLORS };
