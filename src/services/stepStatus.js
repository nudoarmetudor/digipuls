// Computes per-step completion status for the assessment wizard.
//
// The assessment used to be one long page covering all 19 indicators plus
// equipment/network data — a real self-assessment cycle involves multiple
// people (principal, deputy principal, teachers, the educational
// technologist, an external validator, meta-mentors) contributing over up
// to two weeks, not one person filling in a single long form in one
// sitting. So the cycle is now a set of independently-saveable steps, each
// with a status any contributor can see at a glance:
//
//   grey  = not started  — nothing entered yet
//   blue  = in progress  — some but not all indicators rated
//   red   = attention    — every indicator in the step has a rating, but
//                          something required is still missing (evidence
//                          for a Level-2+ rating, or a device/network field)
//   green = complete     — fully rated, all evidence present
//
// This mirrors the real, asynchronous, multi-actor process: nobody is
// blocked from saving a single field, and the step navigator is how
// everyone involved sees what's done, what's touched-but-incomplete, and
// what nobody has opened yet.

const { INDICATORS } = require('../data/indicators');

const STEPS = [
  { key: 'A', kind: 'domain', domain: 'A' },
  { key: 'B', kind: 'domain', domain: 'B' },
  { key: 'C', kind: 'domain', domain: 'C' },
  { key: 'D', kind: 'domain', domain: 'D' },
  { key: 'infra', kind: 'infra' },
  { key: 'review', kind: 'review' },
];

function indicatorStepStatus(ratings, domain) {
  const codes = INDICATORS.filter((i) => i.domain === domain).map((i) => i.code);
  const stepRatings = codes.map((c) => ratings.find((r) => r.indicatorCode === c)).filter(Boolean);
  const rated = stepRatings.filter((r) => r.level !== null && r.level !== undefined);
  if (rated.length === 0) return 'grey';
  const missingEvidence = rated.filter((r) => r.level >= 2 && (!r.evidences || r.evidences.length === 0));
  if (rated.length < codes.length) return 'blue';
  if (missingEvidence.length > 0) return 'red';
  return 'green';
}

function infraStepStatus(deviceInventory, networkChecklist) {
  const deviceTouched = deviceInventory && Object.entries(deviceInventory).some(([k, v]) => k !== 'id' && k !== 'cycleId' && v > 0);
  const networkFields = networkChecklist
    ? ['wifiWholeSchool', 'subnetsSeparated', 'wifi80211n', 'wifi80211ac', 'firewallActive', 'contentFiltering']
    : [];
  const networkCheckedCount = networkFields.filter((f) => networkChecklist[f]).length;
  if (!deviceTouched && networkCheckedCount === 0) return 'grey';
  if (deviceTouched && networkCheckedCount === networkFields.length) return 'green';
  return 'blue';
}

/**
 * @returns {{key,kind,domain?,status}[]} one entry per step, in order.
 */
function computeStepStatuses(cycle) {
  const ratings = cycle.ratings || [];
  return STEPS.map((step) => {
    if (step.kind === 'domain') {
      return { ...step, status: indicatorStepStatus(ratings, step.domain) };
    }
    if (step.kind === 'infra') {
      return { ...step, status: infraStepStatus(cycle.deviceInventory, cycle.networkChecklist) };
    }
    // review: green once every domain + infra step is green, otherwise grey/blue
    // (computed by the caller, since it depends on the other steps' results)
    return { ...step, status: 'grey' };
  });
}

function finalizeReviewStatus(steps) {
  const nonReview = steps.filter((s) => s.kind !== 'review');
  const allGreen = nonReview.every((s) => s.status === 'green');
  const anyTouched = nonReview.some((s) => s.status !== 'grey');
  const reviewIndex = steps.findIndex((s) => s.kind === 'review');
  if (reviewIndex >= 0) {
    steps[reviewIndex].status = allGreen ? 'blue' : anyTouched ? 'blue' : 'grey';
    // "blue" on review = ready to confirm, not yet confirmed; a confirmed
    // cycle's review step is shown as green by the caller (cycle.status === 'CONFIRMED').
  }
  return steps;
}

function overallProgress(cycle) {
  const total = INDICATORS.length;
  const rated = (cycle.ratings || []).filter((r) => r.level !== null && r.level !== undefined).length;
  return { rated, total };
}

module.exports = { STEPS, computeStepStatuses, finalizeReviewStatus, overallProgress };
