const express = require('express');
const prisma = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { INDICATORS, DOMAINS } = require('../data/indicators'); // structural use only (codes, counts) — locale-invariant
const { getIndicatorData } = require('../data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const cycleService = require('../services/cycleService');
const { logAction } = require('../services/audit');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');
const { computeStepStatuses, finalizeReviewStatus, overallProgress } = require('../services/stepStatus');

const router = express.Router();
router.use(requireRole('SCHOOL_TEAM'));

async function getSchool(req) {
  return prisma.school.findUnique({ where: { id: req.session.user.schoolId } });
}

router.get('/', async (req, res) => {
  const school = await getSchool(req);
  const cycles = await prisma.assessmentCycle.findMany({
    where: { schoolId: school.id },
    orderBy: { cycleNumber: 'desc' },
    include: { ratings: true, plan: true },
  });
  const latest = cycles[0];
  const hasConfirmedPrior = cycles.some((c) => c.status === 'CONFIRMED');
  res.render('school/dashboard', {
    title: 'School dashboard', wide: true, school, cycles, latest, hasConfirmedPrior,
  });
});

router.post('/cycles/start', async (req, res) => {
  const school = await getSchool(req);
  const existingDraft = await prisma.assessmentCycle.findFirst({ where: { schoolId: school.id, status: 'DRAFT' } });
  if (existingDraft) return res.redirect(`/school/cycles/${existingDraft.id}`);

  const hasConfirmed = await prisma.assessmentCycle.findFirst({ where: { schoolId: school.id, status: 'CONFIRMED' } });
  const cycle = hasConfirmed
    ? await cycleService.startContinuationCycle(school.id)
    : await cycleService.startFirstCycle(school.id);
  await logAction(req.session.user.id, hasConfirmed ? 'START_CONTINUATION_CYCLE' : 'START_FIRST_CYCLE', 'AssessmentCycle', cycle.id, null);
  res.redirect(`/school/cycles/${cycle.id}`);
});

async function loadCycleForSchool(req, res, next) {
  const cycle = await prisma.assessmentCycle.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ratings: { include: { evidences: true } },
      deviceInventory: true,
      networkChecklist: true,
      plan: { include: { priorities: true } },
      previousCycle: { include: { ratings: true } },
    },
  });
  if (!cycle || cycle.schoolId !== req.session.user.schoolId) {
    return res.status(404).render('error', { title: 'Not found', message: 'Assessment cycle not found for your school.' });
  }
  req.cycle = cycle;
  next();
}

function stepStatusesFor(cycle) {
  return finalizeReviewStatus(computeStepStatuses(cycle));
}

function ratingsWithEvidenceCheck(cycle) {
  // deviceInventory/networkChecklist are optional includes in some queries;
  // computeStepStatuses tolerates their absence (treats as not-started).
  return cycle;
}

router.get('/cycles/:id', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const school = await getSchool(req);
  const localeData = getIndicatorData(req.lang);
  const wheelSvg = renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS), { mode: 'indicators' });

  res.render('school/cycle-overview', {
    title: `Cycle ${cycle.cycleNumber}`, wide: true,
    school, cycle, wheelSvg,
    isContinuation: !!cycle.previousCycleId,
    progress: overallProgress(cycle),
    stepStatuses: stepStatusesFor(ratingsWithEvidenceCheck(cycle)),
  });
});

router.get('/cycles/:id/step/:stepKey', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const school = await getSchool(req);
  const { stepKey } = req.params;
  const localeData = getIndicatorData(req.lang);
  const stepStatuses = stepStatusesFor(ratingsWithEvidenceCheck(cycle));

  if (['A', 'B', 'C', 'D'].includes(stepKey)) {
    const ratingsByCode = new Map(cycle.ratings.map((r) => [r.indicatorCode, r]));
    const priorByCode = cycle.previousCycle
      ? new Map(cycle.previousCycle.ratings.map((r) => [r.indicatorCode, r]))
      : null;
    const indicators = localeData.INDICATORS.filter((i) => i.domain === stepKey).map((ind) => ({
      ...ind,
      rating: ratingsByCode.get(ind.code) || null,
      priorRating: priorByCode ? priorByCode.get(ind.code) : null,
    }));
    const ratedInDomain = indicators.filter((i) => i.rating && i.rating.level !== null && i.rating.level !== undefined).length;
    return res.render('school/step-domain', {
      title: `Cycle ${cycle.cycleNumber} — Domain ${stepKey}`, wide: true,
      school, cycle, stepStatuses, domainCode: stepKey, domainName: localeData.DOMAINS[stepKey],
      domainIntro: '', indicators, ratedInDomain, totalInDomain: indicators.length,
      isContinuation: !!cycle.previousCycleId,
    });
  }

  if (stepKey === 'infra') {
    const deviceCompliance = cycle.deviceInventory ? checkDeviceCompliance(school, cycle.deviceInventory) : null;
    const networkCompliance = cycle.networkChecklist ? checkNetworkCompliance(cycle.networkChecklist) : null;
    return res.render('school/step-infra', {
      title: `Cycle ${cycle.cycleNumber} — Infrastructure`, wide: true,
      school, cycle, stepStatuses, deviceCompliance, networkCompliance,
      isContinuation: !!cycle.previousCycleId,
    });
  }

  if (stepKey === 'review') {
    const ratingsByCode = new Map(cycle.ratings.map((r) => [r.indicatorCode, r]));
    const domains = ['A', 'B', 'C', 'D'].map((d) => ({
      code: d,
      name: localeData.DOMAINS[d],
      indicators: localeData.INDICATORS.filter((i) => i.domain === d).map((ind) => ({
        ...ind,
        rating: ratingsByCode.get(ind.code) || null,
      })),
    }));
    const wheelSvg = renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS), { mode: 'indicators' });
    return res.render('school/step-review', {
      title: `Cycle ${cycle.cycleNumber} — Review`, wide: true,
      school, cycle, stepStatuses, domains, wheelSvg,
      isContinuation: !!cycle.previousCycleId,
      errorMessage: req.query.error || null,
    });
  }

  return res.status(404).render('error', { title: 'Not found', message: 'Unknown step.' });
});

router.post('/cycles/:id/ratings/:code', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const { code } = req.params;
  let level = Number(req.body.level);
  const comment = req.body.comment || null;

  const rating = cycle.ratings.find((r) => r.indicatorCode === code);
  if (!rating) return res.status(400).send('Unknown indicator');

  // Hard enforcement of the compliance floor described in Annex A v2: D1/D2
  // cannot be rated above 0 while the school fails Order 675's mandatory
  // minimum — this is a fact derived from data, not a self-report, so the
  // server (not just the UI hint) must enforce it.
  if ((code === 'D1' || code === 'D2') && level > 0) {
    const school = await getSchool(req);
    if (code === 'D1') {
      const nc = cycle.networkChecklist;
      const compliance = checkNetworkCompliance(nc);
      if (!compliance.compliant) level = 0;
    }
    if (code === 'D2') {
      const inv = cycle.deviceInventory;
      const compliance = inv ? checkDeviceCompliance(school, inv) : { compliant: false };
      if (!compliance.compliant) level = 0;
    }
  }

  if (cycle.previousCycleId) {
    await cycleService.setContinuationRating(rating.id, level, comment);
  } else {
    await prisma.indicatorRating.update({ where: { id: rating.id }, data: { level, comment } });
  }
  await logAction(req.session.user.id, 'SET_RATING', 'IndicatorRating', rating.id, `${code} -> level ${level}`);
  const returnStep = req.body.returnStep || code[0];
  res.redirect(`/school/cycles/${cycle.id}/step/${returnStep}#ind-${code}`);
});

router.post('/cycles/:id/ratings/:code/evidence', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const { code } = req.params;
  const rating = cycle.ratings.find((r) => r.indicatorCode === code);
  if (!rating) return res.status(400).send('Unknown indicator');

  const { type, description, source } = req.body;
  await prisma.evidence.create({
    data: { ratingId: rating.id, type, description, source: source || null },
  });
  await logAction(req.session.user.id, 'ADD_EVIDENCE', 'IndicatorRating', rating.id, `${type}: ${description}`);
  const returnStep = req.body.returnStep || code[0];
  res.redirect(`/school/cycles/${cycle.id}/step/${returnStep}#ind-${code}`);
});

router.post('/cycles/:id/device', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const fields = ['classroomPCs', 'interactivePanels', 'itRoomPCs', 'managementPCs', 'methodicalCentrePCs', 'libraryPCs', 'printers', 'multifunctionPrinters'];
  const data = {};
  fields.forEach((f) => { data[f] = Number(req.body[f]) || 0; });
  await prisma.deviceInventory.upsert({
    where: { cycleId: cycle.id },
    update: data,
    create: { cycleId: cycle.id, ...data },
  });
  await logAction(req.session.user.id, 'UPDATE_DEVICE_INVENTORY', 'AssessmentCycle', cycle.id, null);
  res.redirect(`/school/cycles/${cycle.id}/step/infra`);
});

router.post('/cycles/:id/network', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const fields = ['wifiWholeSchool', 'subnetsSeparated', 'wifi80211n', 'wifi80211ac', 'firewallActive', 'contentFiltering'];
  const data = {};
  fields.forEach((f) => { data[f] = req.body[f] === 'on'; });
  await prisma.networkChecklist.upsert({
    where: { cycleId: cycle.id },
    update: data,
    create: { cycleId: cycle.id, ...data },
  });
  await logAction(req.session.user.id, 'UPDATE_NETWORK_CHECKLIST', 'AssessmentCycle', cycle.id, null);
  res.redirect(`/school/cycles/${cycle.id}/step/infra`);
});

router.post('/cycles/:id/confirm', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const school = await getSchool(req);
  const unrated = cycle.ratings.filter((r) => r.level === null || r.level === undefined);
  if (unrated.length > 0) {
    const msg = encodeURIComponent(`${unrated.length} indicator(s) still need a rating before this cycle can be confirmed: ${unrated.map((r) => r.indicatorCode).join(', ')}.`);
    return res.redirect(`/school/cycles/${cycle.id}/step/review?error=${msg}`);
  }
  // Enforce the evidence threshold: Level 2+ requires at least one evidence item.
  const missingEvidence = cycle.ratings.filter((r) => r.level >= 2 && r.evidences.length === 0);
  if (missingEvidence.length > 0) {
    const msg = encodeURIComponent(
      `${missingEvidence.length} indicator(s) are rated Level 2 or above without any evidence attached: ` +
      `${missingEvidence.map((r) => r.indicatorCode).join(', ')}. Evidence is required from Level 2 upward.`
    );
    return res.redirect(`/school/cycles/${cycle.id}/step/review?error=${msg}`);
  }
  await prisma.assessmentCycle.update({ where: { id: cycle.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
  await prisma.school.update({ where: { id: school.id }, data: { enrolmentBand: require('../data/order675').bandFor(school.enrolmentTotal) } });
  await logAction(req.session.user.id, 'CONFIRM_CYCLE', 'AssessmentCycle', cycle.id, null);
  res.redirect(`/school/cycles/${cycle.id}/plan`);
});

// -------------------- Development plan (Annex C) --------------------

router.get('/cycles/:id/plan', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const priorPlan = cycle.previousCycleId
    ? await prisma.developmentPlan.findUnique({
        where: { cycleId: cycle.previousCycleId },
        include: { priorities: true },
      })
    : null;
  res.render('school/plan', {
    title: 'Digital development plan', wide: true,
    cycle, plan: cycle.plan, priorPlan, indicators: getIndicatorData(req.lang).INDICATORS,
  });
});

router.post('/cycles/:id/plan/priorities', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  let plan = cycle.plan;
  if (!plan) {
    plan = await prisma.developmentPlan.create({ data: { cycleId: cycle.id } });
  }
  const { indicatorCode, currentLevel, targetLevel, rationale, actions, responsible, timeline } = req.body;
  const existingCount = await prisma.planPriority.count({ where: { planId: plan.id } });
  if (existingCount >= 5) {
    return res.status(400).render('error', { title: 'Priority limit', message: 'This plan already has 5 priorities — the recommended maximum (soft guide, per Annex C.2). Remove one before adding another if you believe this is a genuine exception.' });
  }
  await prisma.planPriority.create({
    data: {
      planId: plan.id, indicatorCode, currentLevel: Number(currentLevel), targetLevel: Number(targetLevel),
      rationale, actions, responsible: responsible || null, timeline: timeline || null,
    },
  });
  await logAction(req.session.user.id, 'ADD_PLAN_PRIORITY', 'DevelopmentPlan', plan.id, indicatorCode);
  res.redirect(`/school/cycles/${cycle.id}/plan`);
});

router.post('/cycles/:id/plan/details', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  let plan = cycle.plan;
  if (!plan) plan = await prisma.developmentPlan.create({ data: { cycleId: cycle.id } });
  const { fundingSource, approvingAuthority, stakeholderConsultationNotes } = req.body;
  await prisma.developmentPlan.update({
    where: { id: plan.id },
    data: { fundingSource, approvingAuthority, stakeholderConsultationNotes },
  });
  res.redirect(`/school/cycles/${cycle.id}/plan`);
});

router.post('/cycles/:id/plan/publish', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  if (!cycle.plan) return res.status(400).render('error', { title: 'No plan', message: 'Add at least one priority before publishing.' });
  await prisma.developmentPlan.update({ where: { id: cycle.plan.id }, data: { publishedAt: new Date() } });
  await logAction(req.session.user.id, 'PUBLISH_PLAN', 'DevelopmentPlan', cycle.plan.id, null);
  res.redirect(`/school/cycles/${cycle.id}/plan/document`);
});

router.get('/cycles/:id/plan/document', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const school = await getSchool(req);
  const plan = await prisma.developmentPlan.findUnique({
    where: { cycleId: cycle.id },
    include: { priorities: { include: { indicator: true } } },
  });
  if (!plan) return res.status(404).render('error', { title: 'No plan', message: 'This cycle has no plan yet.' });
  res.render('school/plan-document', { title: 'Digital Development Plan', layout: false, school, cycle, plan });
});

// -------------------- Progress over time --------------------

router.get('/history', async (req, res) => {
  const school = await getSchool(req);
  const cycles = await prisma.assessmentCycle.findMany({
    where: { schoolId: school.id, status: 'CONFIRMED' },
    orderBy: { cycleNumber: 'asc' },
    include: { ratings: true },
  });
  const localeIndicators = getIndicatorData(req.lang).INDICATORS;
  const history = localeIndicators.map((ind) => ({
    code: ind.code, domain: ind.domain, name: ind.name,
    series: cycles.map((c) => {
      const r = c.ratings.find((x) => x.indicatorCode === ind.code);
      return { cycleNumber: c.cycleNumber, level: r ? r.level : null, changeState: r ? r.changeState : null };
    }),
  }));
  const cycleWheels = cycles.map((c) => ({
    cycleNumber: c.cycleNumber,
    svg: renderWheel(itemsFromRatings(c.ratings, localeIndicators), { mode: 'indicators', size: 260, showLabels: false }),
  }));
  res.render('school/history', { title: 'My progress over time', wide: true, school, cycles, history, cycleWheels });
});

module.exports = router;
