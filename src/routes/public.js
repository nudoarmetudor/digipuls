const express = require('express');
const prisma = require('../config/db');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { domainScore } = require('../services/schoolOverview');
const { renderWheel, itemsFromDomainScores } = require('../services/wheelChart');

const router = express.Router();
// No auth — this is the public/parent-facing tier (UC-PUB1/UC-PUB2).

const BAND_LABELS = {
  en: ['Just starting', 'Early stages', 'Developing', 'Established', 'Leading'],
  ro: ['Abia începe', 'Etape incipiente', 'În dezvoltare', 'Consolidată', 'Lider'],
};

function band(score, lang) {
  if (score === null) return null;
  const labels = BAND_LABELS[lang] || BAND_LABELS.en;
  if (score < 1) return labels[0];
  if (score < 2) return labels[1];
  if (score < 3) return labels[2];
  if (score < 4) return labels[3];
  return labels[4];
}

router.get('/schools', async (req, res) => {
  const q = (req.query.q || '').trim();
  const schools = await prisma.school.findMany({
    where: q ? { name: { contains: q } } : {},
    orderBy: { name: 'asc' },
  });
  res.render('public/schools-list', { title: 'Schools', wide: true, schools, q});
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: { cycles: { where: { status: 'CONFIRMED' }, orderBy: { cycleNumber: 'desc' }, take: 1, include: { ratings: true, deviceInventory: true, networkChecklist: true, plan: true } } },
  });
  if (!school) return res.status(404).render('error', { title: 'Not found', message: 'School not found.' });
  const cycle = school.cycles[0];

  if (!cycle) {
    return res.render('public/school-summary', { title: school.name, school, hasData: false});
  }

  // Mandatory minimum (always shown, per the resolved disclosure policy):
  // domain-level bands, Order 675 pass/fail, whether a plan exists.
  const domains = {
    A: band(domainScore(cycle.ratings, 'A'), req.lang),
    B: band(domainScore(cycle.ratings, 'B'), req.lang),
    C: band(domainScore(cycle.ratings, 'C'), req.lang),
    D: band(domainScore(cycle.ratings, 'D'), req.lang),
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
  const wheelSvg = renderWheel(itemsFromDomainScores(rawDomainScores), { mode: 'domains', size: 320, showLabels: true });

  res.render('public/school-summary', {
    title: school.name, school, hasData: true, domains, compliant, hasPlan, richDetail, wheelSvg,
  });
});

module.exports = router;
