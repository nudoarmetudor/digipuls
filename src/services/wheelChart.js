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
const DOMAIN_COLORS = { A: '#1f4b53', B: '#307e8c', C: '#622582', D: '#4a1c63' };
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
 * @param {object} opts { mode: 'indicators'|'domains', size, showLabels, title }
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

  const n = items.length;
  const gapDeg = n <= 4 ? 1.2 : 0.6; // slightly wider gaps for the coarser domain wheel
  const sectorDeg = 360 / n;

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,Arial,sans-serif">`;

  // Concentric level gridlines (0 = the inner hole boundary, 5 = outer edge)
  for (let lvl = 0; lvl <= ringCount; lvl++) {
    const r = innerHole + (lvl / ringCount) * (outerRadius - innerHole);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="#dbe4ee" stroke-width="1" />`;
  }
  if (showLabels) {
    for (let lvl = 0; lvl <= ringCount; lvl++) {
      const r = innerHole + (lvl / ringCount) * (outerRadius - innerHole);
      svg += `<text x="${cx + 3}" y="${(cy - r + 9).toFixed(1)}" font-size="9" fill="#8a8a8a">${lvl}</text>`;
    }
  }

  // Wedges
  items.forEach((item, i) => {
    const start = i * sectorDeg + gapDeg / 2;
    const end = (i + 1) * sectorDeg - gapDeg / 2;
    const level = item.level === null || item.level === undefined ? 0 : item.level;
    const r = innerHole + (level / ringCount) * (outerRadius - innerHole);
    const color = DOMAIN_COLORS[item.domain] || '#888';
    const opacity = item.level === null || item.level === undefined ? 0.15 : 0.85;
    svg += `<path d="${wedgePath(cx, cy, Math.max(r, innerHole + 2), start, end, innerHole)}" fill="${color}" fill-opacity="${opacity}" stroke="white" stroke-width="1">`;
    svg += `<title>${item.code}${item.name ? ' — ' + item.name : ''}: Level ${item.level ?? '—'}</title>`;
    svg += '</path>';
  });

  // Sector labels (indicator codes / domain names) around the outside
  if (showLabels) {
    items.forEach((item, i) => {
      const mid = i * sectorDeg + sectorDeg / 2;
      const pos = polarToCartesian(cx, cy, labelRadius, mid);
      const anchor = mid > 180 ? 'end' : mid === 0 || mid === 180 ? 'middle' : 'start';
      svg += `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-size="${n > 10 ? 9 : 11}" fill="#333" text-anchor="${anchor}" dominant-baseline="middle">${item.code}</text>`;
    });
  }

  // Center hole label
  svg += `<circle cx="${cx}" cy="${cy}" r="${innerHole}" fill="white" stroke="#dbe4ee" />`;

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

function itemsFromDomainScores(domainScores) {
  return DOMAIN_ORDER.map((d) => ({
    code: d,
    domain: d,
    name: `Domain ${d}`,
    level: domainScores[d] === null || domainScores[d] === undefined ? null : Math.round(domainScores[d] * 10) / 10,
  }));
}

module.exports = { renderWheel, itemsFromRatings, itemsFromDomainScores, DOMAIN_COLORS };
