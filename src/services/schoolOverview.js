const prisma = require('../config/db');
const { INDICATORS } = require('../data/indicators');
const { checkDeviceCompliance, checkNetworkCompliance, ENROLMENT_BANDS } = require('../data/order675');

function domainScore(ratings, domain) {
  const codes = INDICATORS.filter((i) => i.domain === domain).map((i) => i.code);
  const levels = codes
    .map((c) => {
      const r = ratings.find((x) => x.indicatorCode === c);
      return r ? r.level : null;
    })
    .filter((l) => l !== null);
  if (!levels.length) return null;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

// Shared "school + latest cycle + computed compliance/scores" projection,
// used by Ministry, Territorial, and Partner dashboards — one
// implementation, scoped by the `where` clause per role. This is
// deliberately an information/visualization surface, not a scoring or
// matching engine: it computes real values (domain averages, compliance
// pass/fail) for display and filtering, and stops there — no ranking,
// no automated recommendation. Case-by-case judgement stays with whoever
// is looking at the table.
/**
 * Given a school's cycles (any order), picks:
 * - currentCycle: the most recent cycle regardless of status (drives the
 *   status badge/link — a school with only a draft in progress should
 *   still show that).
 * - officialCycle: the most recent CONFIRMED cycle specifically — the one
 *   Ministry/partner/territorial views and domain scores must be computed
 *   from, so a newer draft never makes an already-confirmed assessment
 *   disappear.
 * - hasNewerDraft: true when a draft cycle exists that's more recent than
 *   the official one.
 * Pure function (no I/O) so it's unit-testable without a database.
 */
function selectOfficialAndCurrentCycle(cycles) {
  const sorted = cycles.slice().sort((a, b) => b.cycleNumber - a.cycleNumber);
  const currentCycle = sorted[0] || null;
  const officialCycle = sorted.find((c) => c.status === 'CONFIRMED') || null;
  const hasNewerDraft = !!(currentCycle && officialCycle && currentCycle.id !== officialCycle.id && currentCycle.status === 'DRAFT');
  return { currentCycle, officialCycle, hasNewerDraft };
}

async function schoolsWithLatestCycle(where = {}) {
  const schools = await prisma.school.findMany({
    where,
    include: {
      territory: true,
      cycles: {
        orderBy: { cycleNumber: 'desc' },
        include: { ratings: true, deviceInventory: true, networkChecklist: true, plan: true },
      },
    },
  });
  return schools.map((s) => {
    const { currentCycle, officialCycle, hasNewerDraft } = selectOfficialAndCurrentCycle(s.cycles);
    const confirmed = !!officialCycle;
    const domainScores = confirmed
      ? { A: domainScore(officialCycle.ratings, 'A'), B: domainScore(officialCycle.ratings, 'B'), C: domainScore(officialCycle.ratings, 'C'), D: domainScore(officialCycle.ratings, 'D') }
      : null;
    const deviceCompliance = confirmed && officialCycle.deviceInventory ? checkDeviceCompliance(s, officialCycle.deviceInventory) : null;
    const networkCompliance = confirmed && officialCycle.networkChecklist ? checkNetworkCompliance(officialCycle.networkChecklist) : null;
    return {
      school: s, cycle: currentCycle, officialCycle, confirmed, hasNewerDraft,
      domainScores, deviceCompliance, networkCompliance,
    };
  });
}

/**
 * Applies simple, transparent filters to a rows array from
 * schoolsWithLatestCycle — every filter is a plain, inspectable criterion
 * (band, compliance, a minimum score on one domain), not a weighted score.
 * This backs the "easy access to information and visualization" browsing
 * views (Ministry / Territorial / Partner), not any matching/ranking logic.
 */
function filterRows(rows, query = {}) {
  let out = rows;
  if (query.band) out = out.filter((r) => r.school.enrolmentBand === query.band);
  if (query.status === 'confirmed') out = out.filter((r) => r.confirmed);
  if (query.status === 'no_data') out = out.filter((r) => !r.cycle);
  if (query.status === 'draft') out = out.filter((r) => r.cycle && r.cycle.status === 'DRAFT');
  if (query.compliance === 'compliant') {
    out = out.filter((r) => r.deviceCompliance?.compliant && r.networkCompliance?.compliant);
  } else if (query.compliance === 'gap') {
    out = out.filter((r) => r.confirmed && (!r.deviceCompliance?.compliant || !r.networkCompliance?.compliant));
  }
  ['A', 'B', 'C', 'D'].forEach((d) => {
    const min = query[`min${d}`];
    if (min !== undefined && min !== '') {
      const threshold = Number(min);
      out = out.filter((r) => r.domainScores && r.domainScores[d] !== null && r.domainScores[d] >= threshold);
    }
  });
  if (query.sort) {
    const [field, dir] = query.sort.split('-');
    const mult = dir === 'desc' ? -1 : 1;
    out = out.slice().sort((a, b) => {
      let av; let bv;
      if (['A', 'B', 'C', 'D'].includes(field)) {
        av = a.domainScores ? a.domainScores[field] : null;
        bv = b.domainScores ? b.domainScores[field] : null;
      } else if (field === 'name') {
        av = a.school.name; bv = b.school.name;
      } else if (field === 'enrolment') {
        av = a.school.enrolmentTotal; bv = b.school.enrolmentTotal;
      }
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av > bv ? mult : av < bv ? -mult : 0;
    });
  }
  return out;
}

function toCsv(rows) {
  // Status must reflect the *official* (latest-confirmed) record, not the
  // current cycle — otherwise a school with a confirmed cycle 2 and a new
  // draft cycle 3 would export as "DRAFT" even though the A/B/C/D scores in
  // the same row are real, confirmed data. A separate column flags the
  // in-progress draft instead of overloading Status with it.
  const header = ['School', 'Territory', 'Band', 'Status', 'Newer_Draft_In_Progress', 'A', 'B', 'C', 'D', 'Order675_Quantitative_Check'];
  const lines = [header.join(',')];
  rows.forEach((r) => {
    const line = [
      r.school.name,
      r.school.territory ? r.school.territory.name : '',
      r.school.enrolmentBand,
      r.confirmed ? 'CONFIRMED' : (r.cycle ? r.cycle.status : 'NO_DATA'),
      r.hasNewerDraft ? 'YES' : '',
      r.domainScores?.A ?? '', r.domainScores?.B ?? '', r.domainScores?.C ?? '', r.domainScores?.D ?? '',
      r.deviceCompliance && r.networkCompliance ? (r.deviceCompliance.compliant && r.networkCompliance.compliant) : '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
    lines.push(line.join(','));
  });
  return lines.join('\n');
}

module.exports = { schoolsWithLatestCycle, domainScore, filterRows, toCsv, ENROLMENT_BANDS, selectOfficialAndCurrentCycle };
