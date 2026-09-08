// Training-need triage for the strategic partner: Domain C only —
// C1 teacher competence, C3 PD/mentoring capacity, C4 AI literacy.
// See "DigiPuls - use case catalog.md" UC-SP1.
//
// Lives in a service rather than inline in the route because both of the
// mistakes it used to make were the kind a test pins permanently:
//
//   * It filtered on the confirmed cycle and then read the *current* one, so
//     a school with a confirmed cycle 1 and a draft cycle 2 would have been
//     ranked on figures nobody had confirmed. No school was in that state
//     when it was found, which is exactly why it needed a test rather than an
//     eye.
//   * It summed missing levels as zeroes, so a school that had simply not
//     filled in Domain C came top of a list headed "most in need of
//     training". The one thing known about that school is that nothing is
//     known about it.

const DOMAIN_C = ['C1', 'C3', 'C4'];

function levelsFrom(cycle) {
  return DOMAIN_C.map((code) => {
    const rating = (cycle.ratings || []).find((r) => r.indicatorCode === code);
    return rating && rating.level !== null && rating.level !== undefined ? rating.level : null;
  });
}

/**
 * @param {Array} rows from schoolsWithLatestCycle
 * @returns {{ranked: Array, incomplete: Array}}
 *   ranked      lowest total capacity first — highest training need
 *   incomplete  schools that cannot be ranked, and why
 */
function rankTrainingNeed(rows) {
  const ranked = [];
  const incomplete = [];

  rows.forEach((r) => {
    if (!r.confirmed) {
      incomplete.push({
        school: r.school,
        reason: r.cycle ? 'in_progress' : 'not_started',
        c1: null, c3: null, c4: null,
      });
      return;
    }

    // The official cycle, never the current one.
    const [c1, c3, c4] = levelsFrom(r.officialCycle);
    if ([c1, c3, c4].some((l) => l === null)) {
      incomplete.push({ school: r.school, reason: 'partial', c1, c3, c4 });
      return;
    }
    ranked.push({ school: r.school, c1, c3, c4, total: c1 + c3 + c4 });
  });

  // Ties broken by name, so the order is stable between page loads rather
  // than depending on whatever order the database returned.
  ranked.sort((a, b) => (a.total - b.total) || a.school.name.localeCompare(b.school.name));
  incomplete.sort((a, b) => a.school.name.localeCompare(b.school.name));

  return { ranked, incomplete };
}

module.exports = { rankTrainingNeed, DOMAIN_C };
