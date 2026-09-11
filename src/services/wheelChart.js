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
const DOMAIN_COLORS = { A: '#184759', B: '#266a82', C: '#5b1f6f', D: '#3f134e' };
const DOMAIN_VARS = { A: 'var(--wheel-a)', B: 'var(--wheel-b)', C: 'var(--wheel-c)', D: 'var(--wheel-d)' };
const DOMAIN_ORDER = ['A', 'B', 'C', 'D'];

// Everything this module returns is emitted with <%- %>, so nothing may reach
// the output unescaped. Today every caller passes static indicator names and
// translated domain labels, so there is no live injection here — but "the
// current callers happen to be safe" is not a property the next caller
// inherits, and a school name is one refactor away from this function.
function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
 * An arc at one radius across one sector — no fill, just the line.
 *
 * This is how the plan is drawn. A second filled wedge on top of the first
 * would read as a second measurement, and the target is not a measurement: it
 * is where the school intends to be. A line has no area, so it cannot be
 * mistaken for one.
 */
function arcPath(cx, cy, r, startAngle, endAngle) {
  const from = polarToCartesian(cx, cy, r, endAngle);
  const to = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return ['M', from.x, from.y, 'A', r, r, 0, largeArc, 0, to.x, to.y].join(' ');
}

/**
 * @param {Array<{code:string, domain:string, level:number|null, name?:string,
 *   target?:number|null}>} items
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
  const showLabels = opts.showLabels !== false;

  // The top of the scale. Six values on the indicator wheel (levels 0-5) and
  // five on the public one (bands 0-4), which the ring labels used to ignore:
  // they counted to 5 on a wheel whose top band is 4.
  const maxLevel = opts.mode === 'domains' ? 4 : 5;
  const bands = maxLevel + 1;

  // Every level gets a band of its own, level 0 included.
  //
  // It used to be drawn as a 2px sliver against the hub, which made "we have
  // nothing of this kind" almost invisible and indistinguishable from a
  // parameter nobody had rated. The platform insists everywhere else that
  // level 0 is an answer and a blank is not — the picture now says the same
  // thing: 0 is a band you can see, and unrated is empty space.
  const bandWidth = (outerRadius - innerHole) / bands;
  const radiusFor = (level) => innerHole + (level + 1) * bandWidth;
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
  // Two rows of two beneath the wheel, and only where a legend is drawn at
  // all — an unlabelled thumbnail keeps its square box.
  const legendRows = opts.mode !== 'domains' && showLabels ? 2 : 0;
  const legendHeight = legendRows * 16 + (legendRows ? 12 : 0);
  const boxHeight = size + legendHeight;

  let svg = `<svg viewBox="0 0 ${size} ${boxHeight}" width="${size}" height="${boxHeight}" xmlns="http://www.w3.org/2000/svg" `
    + `role="img" aria-labelledby="${titleId}" style="max-width:100%;height:auto" font-family="inherit">`;
  svg += `<title id="${titleId}">${esc(t('wheel_title'))}</title>`;

  // One gridline per band edge, from the hub outwards.
  svg += `<circle cx="${cx}" cy="${cy}" r="${innerHole.toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" />`;
  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${radiusFor(lvl).toFixed(1)}" fill="none" stroke="var(--border)" stroke-width="1" />`;
  }

  if (showLabels) {
    // The numeral sits in the middle of the band it names, rather than on the
    // line above it, so "3" is inside the level-3 ring instead of straddling
    // the boundary between 3 and 4.
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const mid = radiusFor(lvl) - bandWidth / 2;
      svg += `<text x="${cx + 3}" y="${(cy - mid + 3.5).toFixed(1)}" font-size="9" fill="var(--text-muted)">${lvl}</text>`;
    }
  }

  // Wedges
  items.forEach((item, i) => {
    const start = i * sectorDeg + gapDeg / 2;
    const end = (i + 1) * sectorDeg - gapDeg / 2;
    const rated = item.level !== null && item.level !== undefined;
    const color = DOMAIN_VARS[item.domain] || 'var(--text-muted)';
    const levelText = item.tooltipSuffix === 'band'
      ? `${t('band')} ${item.level ?? '—'}/${maxLevel}`
      : `${t('level_label')} ${item.level ?? '—'}`;
    const label = `${esc(item.code)}${item.name ? ' — ' + esc(item.name) : ''}`;

    if (rated) {
      const r = radiusFor(item.level);
      svg += `<path d="${wedgePath(cx, cy, r, start, end, innerHole)}" fill="${color}" `
        + 'fill-opacity="0.9" stroke="var(--surface)" stroke-width="1">';
      svg += `<title>${label}: ${esc(levelText)}</title>`;
      svg += '</path>';

      // The level, written at the outer edge of its own wedge. The tooltip
      // said it already, but a tooltip needs a mouse and a steady hand across
      // nineteen sectors — and the request was to read the level off the
      // picture.
      if (showLabels) {
        const mid = i * sectorDeg + sectorDeg / 2;
        const pos = polarToCartesian(cx, cy, r - bandWidth / 2, mid);
        svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-size="9" `
          + 'fill="var(--text-on-brand)" text-anchor="middle" dominant-baseline="middle" '
          + `aria-hidden="true">${item.level}</text>`;
      }
    } else {
      // Nothing drawn, and the sector left empty on purpose — see the note on
      // radiusFor. An unrated parameter is still hoverable so the wheel can
      // say that nobody has answered it.
      svg += `<path d="${wedgePath(cx, cy, radiusFor(maxLevel), start, end, innerHole)}" `
        + 'fill="transparent" stroke="none">';
      svg += `<title>${label}: ${esc(t('wheel_unrated'))}</title>`;
      svg += '</path>';
    }
  });

  // Radial dividers, one per sector boundary, running the full depth of the
  // wheel. Asked for directly: with only a 0.6° gap between wedges, a
  // parameter sitting at a low level left most of its sector empty and there
  // was nothing to show where one ended and the next began.
  //
  // Drawn *after* the wedges rather than before. Underneath them, a divider
  // disappeared the moment a sector was filled — which is the half of the
  // wheel where two neighbours actually touch. The border colour reads as a
  // line over the pale ground and over a saturated wedge alike.
  items.forEach((item, i) => {
    const angle = i * sectorDeg;
    const from = polarToCartesian(cx, cy, innerHole, angle);
    const to = polarToCartesian(cx, cy, outerRadius, angle);
    svg += `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" `
      + `x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" `
      + 'stroke="var(--border)" stroke-width="1" />';
  });

  // The DigiPlan in progress: a bold dotted arc at the level each parameter is
  // aiming at, on the sectors the school has chosen to develop. Drawn after
  // the wedges so it is never hidden behind one, and in the signal colour
  // rather than the domain's, because it is a different kind of statement —
  // the wedges say what was measured, this says what is intended. Parameters
  // the plan is maintaining carry no line: nothing is being developed there,
  // and a line at the current level would say the opposite.
  items.forEach((item, i) => {
    if (item.target === null || item.target === undefined) return;
    const start = i * sectorDeg + gapDeg / 2;
    const end = (i + 1) * sectorDeg - gapDeg / 2;
    const r = radiusFor(item.target);
    svg += `<path d="${arcPath(cx, cy, r, start, end)}" fill="none" stroke="var(--signal)" `
      + `stroke-width="3.5" stroke-linecap="round" stroke-dasharray="5 4">`;
    svg += `<title>${esc(item.code)}${item.name ? ' — ' + esc(item.name) : ''}: `
      + `${esc(t('wheel_plan_target', { level: item.target }))}</title>`;
    svg += '</path>';
  });

  // Sector labels (indicator codes / domain names) around the outside
  if (showLabels) {
    items.forEach((item, i) => {
      const mid = i * sectorDeg + sectorDeg / 2;
      const pos = polarToCartesian(cx, cy, labelRadius, mid);
      const anchor = mid > 180 ? 'end' : mid === 0 || mid === 180 ? 'middle' : 'start';
      svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-size="${n > 10 ? 9 : 11}" fill="var(--text)" text-anchor="${anchor}" dominant-baseline="middle">${esc(item.code)}</text>`;
    });
  }

  // Center hole label
  svg += `<circle cx="${cx}" cy="${cy}" r="${innerHole}" fill="var(--surface)" stroke="var(--border)" />`;

  // Which colour is which domain.
  //
  // DOMAIN_COLORS has carried a comment about legend swatches since it was
  // written, and no legend was ever drawn — so four colours meant nothing
  // unless you already knew the instrument. Inside the SVG rather than beside
  // it in a view, because the wheel appears on five different pages and a
  // legend that lives in one of them is a legend missing from four.
  //
  // The public wheel needs none: there, the four sectors *are* the domains and
  // are already named around the rim.
  if (legendRows) {
    const colWidth = size / 2;
    DOMAIN_ORDER.forEach((d, i) => {
      const x = 10 + (i % 2) * colWidth;
      const y = size + 14 + Math.floor(i / 2) * 16;
      svg += `<rect x="${x}" y="${y - 8}" width="10" height="10" rx="2" fill="${DOMAIN_VARS[d]}" />`;
      svg += `<text x="${x + 15}" y="${y}" font-size="10" fill="var(--text-muted)" `
        + `dominant-baseline="middle">${esc(d)} — ${esc(t('domain_' + d + '_short'))}</text>`;
    });
  }

  svg += '</svg>';
  return svg;
}

/**
 * @param {Array} ratings
 * @param {Array} indicators
 * @param {Array} [priorities] the plan's rows, when there is a plan. Only the
 *   ones actually being advanced produce a target: a priority set to maintain
 *   is a decision to hold a level, not to develop it, and drawing a line there
 *   would claim work nobody has planned.
 */
function itemsFromRatings(ratings, indicators, priorities) {
  const targets = new Map();
  (priorities || []).forEach((p) => {
    const target = p.targetLevel;
    if (target === null || target === undefined) return;
    // Advancing is the intent *and* the arithmetic: a target at or below the
    // current level is a plan to maintain, whatever the row says.
    if (p.currentLevel !== null && p.currentLevel !== undefined && target <= p.currentLevel) return;
    targets.set(p.indicatorCode, target);
  });

  return indicators
    .slice()
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain))
    .map((ind) => {
      const r = ratings.find((x) => x.indicatorCode === ind.code);
      const target = targets.has(ind.code) ? targets.get(ind.code) : null;
      return {
        code: ind.code, domain: ind.domain, name: ind.name,
        level: r ? r.level : null,
        target,
      };
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
