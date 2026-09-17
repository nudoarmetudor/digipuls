// Reading an assessment as a whole rather than parameter by parameter.
//
// The wheel shows the shape; this says it in numbers — each domain's average
// level, how much of it is rated, and which domain stands highest and lowest.
// Averages are of levels the school actually recorded. An unrated parameter is
// left out rather than counted as 0, because 0 is an answer and a blank is not.

const DOMAIN_ORDER = ['A', 'B', 'C', 'D'];

/**
 * @param {Array} ratings    rating rows of one reading (agreed, or one side's)
 * @param {Array} indicators the instrument in the reader's language
 * @param {Object} domainNames code -> name, in the reader's language
 */
function summariseDomains(ratings, indicators, domainNames = {}) {
  const byCode = new Map((ratings || []).map((r) => [r.indicatorCode, r]));

  const domains = DOMAIN_ORDER.map((code) => {
    const items = indicators.filter((i) => i.domain === code).map((indicator) => {
      const rating = byCode.get(indicator.code) || null;
      const level = rating && Number.isInteger(rating.level) ? rating.level : null;
      const described = level === null ? null
        : (indicator.levels || []).find((l) => l.level === level) || null;
      return {
        indicator,
        rating,
        level,
        levelName: described ? described.levelName : null,
        evidences: rating && Array.isArray(rating.evidences) ? rating.evidences : [],
      };
    });
    const rated = items.filter((i) => i.level !== null);
    const average = rated.length
      ? Math.round((10 * rated.reduce((sum, i) => sum + i.level, 0)) / rated.length) / 10
      : null;
    return { code, name: domainNames[code] || code, items, rated: rated.length, total: items.length, average };
  });

  const scored = domains.filter((d) => d.average !== null);
  const highest = scored.length ? Math.max(...scored.map((d) => d.average)) : null;
  const lowest = scored.length ? Math.min(...scored.map((d) => d.average)) : null;
  // Named only when there is a difference to name. Four domains level with
  // each other have no strongest one.
  const differs = scored.length > 1 && highest !== lowest;

  return {
    domains,
    strongest: differs ? scored.filter((d) => d.average === highest).map((d) => d.code) : [],
    weakest: differs ? scored.filter((d) => d.average === lowest).map((d) => d.code) : [],
  };
}

/**
 * Whether an evidence source is a web address worth making clickable. Only
 * http and https: anything else (a `javascript:` URL above all) stays text.
 */
function isEvidenceLink(source) {
  return /^https?:\/\/[^\s<>"']+$/i.test(String(source || '').trim());
}

module.exports = { summariseDomains, isEvidenceLink, DOMAIN_ORDER };
