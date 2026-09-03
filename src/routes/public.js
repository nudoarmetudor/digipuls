const express = require('express');
const prisma = require('../config/db');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { domainScore } = require('../services/schoolOverview');
const { renderWheel, itemsFromDomainScores, scoreToBandIndex } = require('../services/wheelChart');

const router = express.Router();
// No auth — this is the public/parent-facing tier (UC-PUB1/UC-PUB2).

// The public tier discloses a band ("Developing"), never a raw average —
// the labels live in the shared dictionary so all three languages stay in
// step, and scoreToBandIndex is the same function the public wheel uses, so
// the text and the picture can't disagree about which band a school is in.
function band(score, t) {
  const index = scoreToBandIndex(score);
  return index === null ? null : t('public_band_' + index);
}

router.get('/schools', async (req, res) => {
  const q = (req.query.q || '').trim();
  const schools = await prisma.school.findMany({
    where: q ? { name: { contains: q } } : {},
    orderBy: { name: 'asc' },
  });
  res.render('public/schools-list', { title: res.locals.t('public_list_title'), wide: true, schools, q });
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: { cycles: { where: { status: 'CONFIRMED' }, orderBy: { cycleNumber: 'desc' }, take: 1, include: { ratings: true, deviceInventory: true, networkChecklist: true, plan: true } } },
  });
  if (!school) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('err_school_not_found') });
  const cycle = school.cycles[0];

  if (!cycle) {
    return res.render('public/school-summary', { title: school.name, school, hasData: false});
  }

  // Mandatory minimum (always shown, per the resolved disclosure policy):
  // domain-level bands, Order 675 pass/fail, whether a plan exists.
  const domains = {
    A: band(domainScore(cycle.ratings, 'A'), res.locals.t),
    B: band(domainScore(cycle.ratings, 'B'), res.locals.t),
    C: band(domainScore(cycle.ratings, 'C'), res.locals.t),
    D: band(domainScore(cycle.ratings, 'D'), res.locals.t),
  };
  const deviceCompliance = cycle.deviceInventory ? checkDeviceCompliance(school, cycle.deviceInventory) : null;
  const networkCompliance = cycle.networkChecklist ? checkNetworkCompliance(cycle.networkChecklist) : null;
  const compliant = !!(deviceCompliance?.compliant && networkCompliance?.compliant);
  const hasPlan = !!(cycle.plan && cycle.plan.publishedAt);

  // Richer, opt-in detail: raw domain averages instead of just bands.
  const rawDomainScores = { A: domainScore(cycle.ratings, 'A'), B: domainScore(cycle.ratings, 'B'), C: domainScore(cycle.ratings, 'C'), D: domainScore(cycle.ratings, 'D') };
  const richDetail = school.publicDisclosureOptIn ? rawDomainScores : null;
  // The wheel shows coarse position (which quadrant is strong/weak), not an
  // exact number, so it's shown regardless of the opt-in — consistent with
  // the "domain-level bands, not raw indicator scores" mandatory-minimum
  // policy: a shape is not the same disclosure as a labelled number.
  const wheelSvg = renderWheel(itemsFromDomainScores(rawDomainScores, res.locals.t), { mode: 'domains', size: 320, showLabels: true, t: res.locals.t });

  res.render('public/school-summary', {
    title: school.name, school, hasData: true, domains, compliant, hasPlan, richDetail, wheelSvg,
  });
});

module.exports = router;
