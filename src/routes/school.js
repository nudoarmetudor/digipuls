const express = require('express');
const prisma = require('../config/db');
const { requireRole, requireCapability } = require('../middleware/auth');
const { activeSchoolId } = require('../middleware/workspace');
const { INDICATORS, DOMAINS } = require('../data/indicators'); // structural use only (codes, counts) — locale-invariant
const { getIndicatorData } = require('../data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const cycleService = require('../services/cycleService');
const { logAction } = require('../services/audit');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');
const { computeStepStatuses, finalizeReviewStatus, overallProgress } = require('../services/stepStatus');
const { ValidationError, toLevel, toNonNegativeInt } = require('../utils/validate');
const { mentorsForSchool } = require('../services/mentors');
const { SCHOOL_ROLES } = require('../services/capabilities');
const { trackForRole, AGREED, reconciliation, outstanding } = require('../services/tracks');
const {
  ADVANCE, MAINTAIN, INTENTS, INITIATIVE_STATUSES,
  openPlan, requirementsFor, planRows, planSummary, targetChoices,
} = require('../services/planService');

const router = express.Router();
// Both must hold: the role because every route below reads the session's
// schoolId, the capability so an admin can suspend a school's access
// without changing what kind of account it is.
// Any of the positions a school fills — principal, deputy, mentor. They work
// on the same assessment; the two-track split between administration and team
// is a workflow question and is not a permissions boundary today.
router.use(requireRole(...SCHOOL_ROLES), requireCapability('view.school'), requireSchool);

/**
 * Loads the active school onto the request, and refuses the whole router if
 * there isn't one — with an explanation of what an administrator needs to fix,
 * rather than a stack trace.
 *
 * This used to be two functions: one that loaded the school and one that
 * checked req.school had been set. Nothing set it, so every route under
 * /school answered 409 to everybody — a complete outage for all twelve
 * schools, and one no test noticed because none of them issues a real request
 * as a school account. Loading and checking in one place is what makes that
 * impossible rather than merely fixed.
 */
async function requireSchool(req, res, next) {
  const id = activeSchoolId(req);
  // A school-side post with no school is an administrator's mistake, not a
  // state the app should crash on. findUnique with a null id throws, which
  // used to make every page under /school a 500 with an internal message.
  const school = Number.isInteger(id)
    ? await prisma.school.findUnique({ where: { id } })
    : null;

  if (!school) {
    return res.status(409).render('error', {
      title: res.locals.t('school_missing_title'),
      message: res.locals.t('school_missing_detail'),
    });
  }
  req.school = school;
  return next();
}


router.get('/', async (req, res) => {
  const school = req.school;
  const [cycles, mentors] = await Promise.all([
    prisma.assessmentCycle.findMany({
      where: { schoolId: school.id },
      orderBy: { cycleNumber: 'desc' },
      include: { ratings: { where: { track: 'AGREED' } }, plan: true },
    }),
    // "Who do I ask when we get stuck" is the first question a school team
    // has, and the answer was already in the database — recorded on the
    // mentor's post and read by nothing.
    mentorsForSchool(school.id),
  ]);
  const latest = cycles[0];
  const hasConfirmedPrior = cycles.some((c) => c.status === 'CONFIRMED');
  res.render('school/dashboard', {
    title: res.locals.t('nav_dashboard'), wide: true, school, cycles, latest, hasConfirmedPrior, mentors,
  });
});

// Opening a cycle is the principal's. A mentor works inside a cycle; they do
// not decide that the school is starting one.
router.post('/cycles/start', requireCapability('school.manage'), async (req, res) => {
  const school = req.school;
  const existingDraft = await prisma.assessmentCycle.findFirst({ where: { schoolId: school.id, status: 'DRAFT' } });
  if (existingDraft) return res.redirect(res.locals.href(`/school/cycles/${existingDraft.id}`));

  const hasConfirmed = await prisma.assessmentCycle.findFirst({ where: { schoolId: school.id, status: 'CONFIRMED' } });
  const cycle = hasConfirmed
    ? await cycleService.startContinuationCycle(school.id)
    : await cycleService.startFirstCycle(school.id);
  await logAction(req.session.user.id, hasConfirmed ? 'START_CONTINUATION_CYCLE' : 'START_FIRST_CYCLE', 'AssessmentCycle', cycle.id, null);
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}`));
});

async function loadCycleForSchool(req, res, next) {
  const cycle = await prisma.assessmentCycle.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      // Every track. Which of them a given page means is decided below, not
      // by the query, because one page needs all three.
      ratings: { include: { evidences: true } },
      deviceInventory: true,
      networkChecklist: true,
      plan: { include: { priorities: true } },
      previousCycle: { include: { ratings: { where: { track: AGREED } } } },
    },
  });
  if (!cycle || cycle.schoolId !== activeSchoolId(req)) {
    return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('err_cycle_not_found') });
  }

  // Three views of the same cycle, named so no route has to remember which
  // filter it wanted:
  //
  //   allRatings     every track — the reconciliation screen
  //   agreedRatings  the official record — confirmation, and anything a
  //                  reader outside the school would see
  //   ratings        this person's own working track, which is what the
  //                  assessment pages show and edit. Everywhere else in the
  //                  app `ratings` means the agreed record; inside the
  //                  school's own workspace it means your own work, because
  //                  showing someone the agreed column while they fill in
  //                  theirs would be answering a question nobody asked.
  const track = trackForRole(req.workspace ? req.workspace.role : null) || AGREED;
  cycle.allRatings = cycle.ratings;
  cycle.agreedRatings = cycle.ratings.filter((r) => r.track === AGREED);
  cycle.ratings = cycle.ratings.filter((r) => r.track === track);
  req.track = track;
  req.cycle = cycle;
  return next();
}

// A confirmed cycle is the school's official, on-the-record declaration —
// Ministry/partner dashboards and history compare against it. Without this
// guard the mutating routes below would silently keep writing after
// confirmation, which would make "confirmed" meaningless (the record could
// change after being reported on). Only a new continuation cycle may make
// further changes.
function requireDraftCycle(req, res, next) {
  if (req.cycle.status !== 'DRAFT') {
    const msg = encodeURIComponent(
      res.locals.t('err_cycle_locked')
    );
    return res.redirect(res.locals.href(`/school/cycles/${req.cycle.id}/step/review?error=${msg}`));
  }
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
  const school = req.school;
  const localeData = getIndicatorData(req.lang);
  const wheelSvg = renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS), { mode: 'indicators', t: res.locals.t });

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
  const school = req.school;
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
      errorMessage: req.query.error || null,
    });
  }

  if (stepKey === 'infra') {
    const deviceCompliance = cycle.deviceInventory ? checkDeviceCompliance(school, cycle.deviceInventory) : null;
    const networkCompliance = cycle.networkChecklist ? checkNetworkCompliance(cycle.networkChecklist) : null;
    return res.render('school/step-infra', {
      title: `Cycle ${cycle.cycleNumber} — Infrastructure`, wide: true,
      school, cycle, stepStatuses, deviceCompliance, networkCompliance,
      isContinuation: !!cycle.previousCycleId,
      errorMessage: req.query.error || null,
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
    const wheelSvg = renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS), { mode: 'indicators', t: res.locals.t });
    return res.render('school/step-review', {
      title: `Cycle ${cycle.cycleNumber} — Review`, wide: true,
      school, cycle, stepStatuses, domains, wheelSvg,
      isContinuation: !!cycle.previousCycleId,
      errorMessage: req.query.error || null,
    });
  }

  return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('err_unknown_step') });
});

router.post('/cycles/:id/ratings/:code', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const cycle = req.cycle;
  const { code } = req.params;
  const comment = req.body.comment || null;
  const returnStep = req.body.returnStep || code[0];

  const rating = cycle.ratings.find((r) => r.indicatorCode === code);
  if (!rating) return res.status(400).send(res.locals.t('err_unknown_indicator'));

  let level;
  try {
    level = toLevel(req.body.level);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    const msg = encodeURIComponent(res.locals.t('err_invalid_level'));
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/${returnStep}?error=${msg}#ind-${code}`));
  }

  // Hard enforcement of the compliance floor described in Annex A v2: D1/D2
  // cannot be rated above 0 while the school fails Order 675's mandatory
  // minimum — this is a fact derived from data, not a self-report, so the
  // server (not just the UI hint) must enforce it.
  if ((code === 'D1' || code === 'D2') && level > 0) {
    const school = req.school;
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
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/${returnStep}#ind-${code}`));
});

router.post('/cycles/:id/ratings/:code/evidence', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const cycle = req.cycle;
  const { code } = req.params;
  // Evidence hangs off the agreed row, not off the track of whoever uploaded
  // it. Evidence supports the school's claim about itself; it is not one
  // side's argument for their own number, and it has to survive reconciliation
  // settling on a level neither side proposed.
  const rating = cycle.agreedRatings.find((r) => r.indicatorCode === code);
  if (!rating) return res.status(400).send(res.locals.t('err_unknown_indicator'));

  const { type, description, source } = req.body;
  await prisma.evidence.create({
    data: { ratingId: rating.id, type, description, source: source || null },
  });
  await logAction(req.session.user.id, 'ADD_EVIDENCE', 'IndicatorRating', rating.id, `${type}: ${description}`);
  const returnStep = req.body.returnStep || code[0];
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/${returnStep}#ind-${code}`));
});

router.post('/cycles/:id/device', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const cycle = req.cycle;
  const fields = ['classroomPCs', 'interactivePanels', 'itRoomPCs', 'managementPCs', 'methodicalCentrePCs', 'libraryPCs', 'printers', 'multifunctionPrinters'];
  const data = {};
  try {
    fields.forEach((f) => { data[f] = toNonNegativeInt(req.body[f] === '' ? 0 : req.body[f], f); });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    const msg = encodeURIComponent(res.locals.t('err_invalid_number'));
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/infra?error=${msg}`));
  }
  await prisma.deviceInventory.upsert({
    where: { cycleId: cycle.id },
    update: data,
    create: { cycleId: cycle.id, ...data },
  });
  await logAction(req.session.user.id, 'UPDATE_DEVICE_INVENTORY', 'AssessmentCycle', cycle.id, null);
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/infra`));
});

router.post('/cycles/:id/network', loadCycleForSchool, requireDraftCycle, async (req, res) => {
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
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/infra`));
});

// Closing a cycle turns a draft into the school's official, on-the-record
// declaration — which the Ministry, the partners and the public then read.
router.post('/cycles/:id/confirm', requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  if (cycle.status === 'CONFIRMED') return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/plan`));
  const school = req.school;
  // Confirmation is about the agreed record. A cycle cannot close while any
  // parameter still lacks a level the two sides settled on — an unreconciled
  // disagreement quietly becoming the official record is the failure the
  // two-track design exists to prevent.
  const unrated = cycle.agreedRatings.filter((r) => r.level === null || r.level === undefined);
  if (unrated.length > 0) {
    // Sent to the reconciliation screen rather than the review step, because
    // that is where an unreconciled parameter is actually resolved.
    //
    // A key and a list of codes rather than a rendered sentence: the message
    // is built on the other side from the translator, so nothing that arrives
    // in the query string is ever printed as prose.
    const codes = unrated.map((r) => r.indicatorCode).join(',');
    return res.redirect(res.locals.href(
      `/school/cycles/${cycle.id}/reconcile?error=agreed_missing&codes=${encodeURIComponent(codes)}`));
  }
  // Enforce the evidence threshold: Level 2+ requires at least one evidence item.
  const missingEvidence = cycle.agreedRatings.filter((r) => r.level >= 2 && r.evidences.length === 0);
  if (missingEvidence.length > 0) {
    const msg = encodeURIComponent(
      `${missingEvidence.length} indicator(s) are rated Level 2 or above without any evidence attached: ` +
      `${missingEvidence.map((r) => r.indicatorCode).join(', ')}. Evidence is required from Level 2 upward.`
    );
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/review?error=${msg}`));
  }
  await prisma.assessmentCycle.update({
    where: { id: cycle.id },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedById: req.session.user.id },
  });
  await prisma.school.update({ where: { id: school.id }, data: { enrolmentBand: require('../data/order675').bandFor(school.enrolmentTotal) } });
  await logAction(req.session.user.id, 'CONFIRM_CYCLE', 'AssessmentCycle', cycle.id, null);
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/plan`));
});

// -------------------- Reconciliation --------------------
//
/**
 * The only two things the reconciliation screen will say about a failed
 * action, both built here from a key rather than from text that arrived in the
 * URL. Indicator codes are checked against the instrument before being shown,
 * so the list cannot become a channel for someone else's words.
 */
function reconcileError(req, res, indicators) {
  const { error, codes } = req.query;
  if (error === 'level') return res.locals.t('err_invalid_level');
  if (error !== 'agreed_missing') return null;

  const known = new Set(indicators.map((i) => i.code));
  const named = String(codes || '').split(',').map((c) => c.trim()).filter((c) => known.has(c));
  if (!named.length) return res.locals.t('reconcile_blocks_confirm');
  return res.locals.t('err_agreed_missing', { n: named.length, codes: named.join(', ') });
}

//
// One screen, nineteen rows: what administration said, what the team said, and
// the gap. Rows where the two agree are quiet; rows where they differ are the
// agenda for the conversation. The discussion happens in the room — the
// software's job is to say precisely what there is to discuss, and then to
// record what was settled.

router.get('/cycles/:id/reconcile', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const localeData = getIndicatorData(req.lang);
  const rows = reconciliation(cycle.allRatings, localeData.INDICATORS);

  // A cycle assessed before the two tracks existed has an agreed level and
  // two empty working columns. Saying "nobody has rated this" beside a real
  // recorded level would be untrue; the page says what actually happened
  // instead.
  const predatesTracks = rows.every((r) => r.state === 'empty') && rows.some((r) => r.settled);

  return res.render('school/reconcile', {
    title: res.locals.t('reconcile_title'),
    wide: true,
    school: req.school,
    cycle,
    rows,
    predatesTracks,
    summary: outstanding(rows),
    // Everyone in the school can see where the two readings differ; only the
    // principal and the deputy can record what was agreed.
    canSettle: res.locals.can('school.manage'),
    myTrack: req.track,
    errorMessage: reconcileError(req, res, localeData.INDICATORS),
  });
});

router.post('/cycles/:id/reconcile/:code',
  requireCapability('school.manage'), loadCycleForSchool, requireDraftCycle,
  async (req, res) => {
    const cycle = req.cycle;
    const { code } = req.params;
    const agreed = cycle.agreedRatings.find((r) => r.indicatorCode === code);
    if (!agreed) return res.status(400).send(res.locals.t('err_unknown_indicator'));

    let level;
    try {
      level = toLevel(req.body.level);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/reconcile?error=level#ind-${code}`));
    }

    // The same compliance floor the assessment enforces. It is a fact derived
    // from the school's own equipment and network data, so agreeing on a
    // higher number does not make it true.
    if ((code === 'D1' || code === 'D2') && level > 0) {
      const compliant = code === 'D1'
        ? checkNetworkCompliance(cycle.networkChecklist).compliant
        : (cycle.deviceInventory
          ? checkDeviceCompliance(req.school, cycle.deviceInventory).compliant : false);
      if (!compliant) level = 0;
    }

    if (cycle.previousCycleId) {
      await cycleService.setContinuationRating(agreed.id, level, req.body.comment || null);
    } else {
      await prisma.indicatorRating.update({
        where: { id: agreed.id },
        data: { level, comment: req.body.comment || null },
      });
    }
    await logAction(req.session.user.id, 'SET_AGREED_RATING', 'IndicatorRating', agreed.id,
      `${code} -> level ${level}`);
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/reconcile#ind-${code}`));
  });

// -------------------- Development plan (the DigiPlan) --------------------
//
// Every parameter is in the plan, either advancing to a named level or being
// held where it is. What the plan aims at is the principal's decision; writing
// the initiatives that get there is the whole team's work, and is not gated.

/** The plan, with everything hanging off it, for one cycle. */
function planInclude() {
  return {
    priorities: {
      include: {
        initiatives: {
          include: {
            kpis: true,
            responsibleUser: { select: { id: true, name: true } },
            supervisorUser: { select: { id: true, name: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    },
  };
}

async function loadPlan(cycleId) {
  return prisma.developmentPlan.findUnique({ where: { cycleId }, include: planInclude() });
}

/** The school's own people, for the responsible/supervisor pickers. */
async function schoolPeople(schoolId) {
  const posts = await prisma.assignment.findMany({
    where: { schoolId, isActive: true, role: { in: SCHOOL_ROLES } },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ role: 'asc' }, { id: 'asc' }],
  });
  const seen = new Set();
  return posts.filter((p) => {
    if (seen.has(p.user.id)) return false;
    seen.add(p.user.id);
    return true;
  }).map((p) => ({ id: p.user.id, name: p.user.name, role: p.role }));
}

/**
 * Finds one initiative and proves it belongs to this cycle's plan. Without the
 * second half, an id typed into the URL would reach another school's plan.
 */
async function loadInitiative(req, res) {
  const id = Number(req.params.iid);
  if (!Number.isInteger(id) || id <= 0) return notFoundInPlan(res);
  const initiative = await prisma.planInitiative.findUnique({
    where: { id },
    include: { priority: { include: { plan: true } }, kpis: true },
  });
  if (!initiative || initiative.priority.plan.cycleId !== req.cycle.id) return notFoundInPlan(res);
  return initiative;
}

function notFoundInPlan(res) {
  res.status(404).render('error', {
    title: res.locals.t('err_not_found'),
    message: res.locals.t('plan_err_not_found'),
  });
  return null;
}

function planPath(cycleId, code) {
  return code ? `/school/cycles/${cycleId}/plan/parameter/${code}` : `/school/cycles/${cycleId}/plan`;
}

router.get('/cycles/:id/plan', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const indicators = getIndicatorData(req.lang).INDICATORS;
  const plan = await loadPlan(cycle.id);
  const rows = plan ? planRows(plan, indicators) : [];

  return res.render('school/plan', {
    title: res.locals.t('plan_title'),
    wide: true,
    school: req.school,
    cycle,
    plan,
    rows,
    summary: plan ? planSummary(rows) : null,
    canManage: res.locals.can('school.manage'),
    canPublish: res.locals.can('school.publish'),
    // A plan is written against a confirmed assessment. Opening one before the
    // school has agreed where it stands would be planning from a draft.
    cycleConfirmed: cycle.status === 'CONFIRMED',
  });
});

router.post('/cycles/:id/plan/open',
  requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
    const cycle = req.cycle;
    if (cycle.status !== 'CONFIRMED') {
      return res.status(409).render('error', {
        title: res.locals.t('plan_err_not_confirmed_title'),
        message: res.locals.t('plan_err_not_confirmed'),
      });
    }
    const plan = await openPlan(cycle);
    await logAction(req.session.user.id, 'OPEN_PLAN', 'DevelopmentPlan', plan.id,
      `cycle ${cycle.cycleNumber}`);
    return res.redirect(res.locals.href(planPath(cycle.id)));
  });

// --- one parameter ---------------------------------------------------------

router.get('/cycles/:id/plan/parameter/:code', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const indicators = getIndicatorData(req.lang).INDICATORS;
  const indicator = indicators.find((i) => i.code === req.params.code);
  const plan = await loadPlan(cycle.id);
  if (!indicator || !plan) return notFoundInPlan(res);

  const row = planRows(plan, indicators).find((r) => r.indicator.code === indicator.code);
  if (!row || !row.priority) return notFoundInPlan(res);

  return res.render('school/plan-parameter', {
    title: `${indicator.code} — ${indicator.name}`,
    wide: true,
    school: req.school,
    cycle,
    plan,
    row,
    // Both readings: what holding the line asks of the school, and what the
    // chosen target would. Shown side by side so the choice is informed.
    currentRequirements: requirementsFor(indicator, row.currentLevel),
    targetChoices: targetChoices(row.currentLevel),
    people: await schoolPeople(req.school.id),
    statuses: INITIATIVE_STATUSES,
    canManage: res.locals.can('school.manage'),
    errorMessage: null,
  });
});

// What the plan aims at is the principal's decision.
router.post('/cycles/:id/plan/parameter/:code',
  requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
    const cycle = req.cycle;
    const plan = await loadPlan(cycle.id);
    if (!plan) return notFoundInPlan(res);
    const priority = plan.priorities.find((p) => p.indicatorCode === req.params.code);
    if (!priority) return notFoundInPlan(res);

    const intent = INTENTS.includes(req.body.intent) ? req.body.intent : MAINTAIN;
    let targetLevel = priority.currentLevel;
    if (intent === ADVANCE) {
      const wanted = Number(req.body.targetLevel);
      // A target at or below where the school already stands is not advancing,
      // whatever the radio button says.
      targetLevel = Number.isInteger(wanted) && wanted > priority.currentLevel && wanted <= 5
        ? wanted : priority.currentLevel;
    }
    const settledIntent = targetLevel > priority.currentLevel ? ADVANCE : MAINTAIN;

    await prisma.planPriority.update({
      where: { id: priority.id },
      data: {
        intent: settledIntent,
        targetLevel,
        rationale: (req.body.rationale || '').trim() || null,
      },
    });
    await logAction(req.session.user.id, 'SET_PLAN_TARGET', 'PlanPriority', priority.id,
      `${req.params.code}: ${settledIntent} -> level ${targetLevel}`);
    return res.redirect(res.locals.href(planPath(cycle.id, req.params.code)));
  });

// --- initiatives: the whole team's work ------------------------------------

router.post('/cycles/:id/plan/parameter/:code/initiatives',
  loadCycleForSchool, async (req, res) => {
    const cycle = req.cycle;
    const plan = await loadPlan(cycle.id);
    if (!plan) return notFoundInPlan(res);
    const priority = plan.priorities.find((p) => p.indicatorCode === req.params.code);
    if (!priority) return notFoundInPlan(res);

    const title = (req.body.title || '').trim();
    if (!title) {
      return res.redirect(res.locals.href(`${planPath(cycle.id, req.params.code)}?error=title`));
    }

    const initiative = await prisma.planInitiative.create({
      data: {
        priorityId: priority.id,
        title,
        description: (req.body.description || '').trim() || null,
        ...personFields(req.body, 'responsible'),
        ...personFields(req.body, 'supervisor'),
        startsOn: toDate(req.body.startsOn),
        dueOn: toDate(req.body.dueOn),
      },
    });
    await logAction(req.session.user.id, 'ADD_INITIATIVE', 'PlanInitiative', initiative.id,
      `${req.params.code}: ${title}`);
    return res.redirect(res.locals.href(`${planPath(cycle.id, req.params.code)}#i${initiative.id}`));
  });

router.post('/cycles/:id/plan/initiatives/:iid', loadCycleForSchool, async (req, res) => {
  const initiative = await loadInitiative(req, res);
  if (!initiative) return undefined;

  const title = (req.body.title || '').trim();
  const status = INITIATIVE_STATUSES.includes(req.body.status) ? req.body.status : initiative.status;

  await prisma.planInitiative.update({
    where: { id: initiative.id },
    data: {
      title: title || initiative.title,
      description: (req.body.description || '').trim() || null,
      status,
      ...personFields(req.body, 'responsible'),
      ...personFields(req.body, 'supervisor'),
      startsOn: toDate(req.body.startsOn),
      dueOn: toDate(req.body.dueOn),
    },
  });
  await logAction(req.session.user.id, 'UPDATE_INITIATIVE', 'PlanInitiative', initiative.id, status);
  return res.redirect(res.locals.href(
    `${planPath(req.cycle.id, initiative.priority.indicatorCode)}#i${initiative.id}`));
});

router.post('/cycles/:id/plan/initiatives/:iid/delete', loadCycleForSchool, async (req, res) => {
  const initiative = await loadInitiative(req, res);
  if (!initiative) return undefined;
  // KPIs cascade with it, which is right: a measure of an initiative that no
  // longer exists measures nothing.
  await prisma.planInitiative.delete({ where: { id: initiative.id } });
  await logAction(req.session.user.id, 'REMOVE_INITIATIVE', 'PlanInitiative', initiative.id,
    initiative.title);
  return res.redirect(res.locals.href(planPath(req.cycle.id, initiative.priority.indicatorCode)));
});

router.post('/cycles/:id/plan/initiatives/:iid/kpis', loadCycleForSchool, async (req, res) => {
  const initiative = await loadInitiative(req, res);
  if (!initiative) return undefined;

  const measure = (req.body.measure || '').trim();
  const target = (req.body.target || '').trim();
  const back = planPath(req.cycle.id, initiative.priority.indicatorCode);
  if (!measure || !target) {
    return res.redirect(res.locals.href(`${back}?error=kpi#i${initiative.id}`));
  }

  await prisma.planKpi.create({ data: { initiativeId: initiative.id, measure, target } });
  await logAction(req.session.user.id, 'ADD_KPI', 'PlanInitiative', initiative.id,
    `${measure} -> ${target}`);
  return res.redirect(res.locals.href(`${back}#i${initiative.id}`));
});

router.post('/cycles/:id/plan/kpis/:kid/delete', loadCycleForSchool, async (req, res) => {
  const id = Number(req.params.kid);
  if (!Number.isInteger(id) || id <= 0) return notFoundInPlan(res);
  const kpi = await prisma.planKpi.findUnique({
    where: { id },
    include: { initiative: { include: { priority: { include: { plan: true } } } } },
  });
  if (!kpi || kpi.initiative.priority.plan.cycleId !== req.cycle.id) return notFoundInPlan(res);

  await prisma.planKpi.delete({ where: { id } });
  return res.redirect(res.locals.href(
    `${planPath(req.cycle.id, kpi.initiative.priority.indicatorCode)}#i${kpi.initiativeId}`));
});

/**
 * A person on an initiative: an account where they have one, a written name
 * where they do not. The form sends both; only one is kept, so a stale typed
 * name cannot sit behind a chosen account and contradict it.
 */
function personFields(body, prefix) {
  const rawId = body[`${prefix}UserId`];
  const id = Number(rawId);
  if (rawId && Number.isInteger(id) && id > 0) {
    return { [`${prefix}UserId`]: id, [`${prefix}Name`]: null };
  }
  return { [`${prefix}UserId`]: null, [`${prefix}Name`]: (body[`${prefix}Name`] || '').trim() || null };
}

/** A date input, or null. An unparseable date is no date, not today. */
function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

router.post('/cycles/:id/plan/details', requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const plan = await loadPlan(cycle.id);
  if (!plan) return notFoundInPlan(res);
  const { fundingSource, approvingAuthority, stakeholderConsultationNotes } = req.body;
  await prisma.developmentPlan.update({
    where: { id: plan.id },
    data: {
      fundingSource: fundingSource || null,
      approvingAuthority: approvingAuthority || null,
      stakeholderConsultationNotes: stakeholderConsultationNotes || null,
      startsOn: toDate(req.body.startsOn) || plan.startsOn,
      endsOn: toDate(req.body.endsOn) || plan.endsOn,
    },
  });
  return res.redirect(res.locals.href(planPath(cycle.id)));
});

// Publishing is a decision about what the school says in public, so it sits
// with the person accountable for saying it.
router.post('/cycles/:id/plan/publish', requireCapability('school.publish'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const plan = await loadPlan(cycle.id);
  if (!plan) return res.status(400).render('error', { title: res.locals.t('err_no_plan'), message: res.locals.t('err_no_plan_body') });
  await prisma.developmentPlan.update({ where: { id: plan.id }, data: { publishedAt: new Date() } });
  await logAction(req.session.user.id, 'PUBLISH_PLAN', 'DevelopmentPlan', plan.id, null);
  return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/plan/document`));
});

router.get('/cycles/:id/plan/document', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const school = req.school;
  const plan = await loadPlan(cycle.id);
  if (!plan) return res.status(404).render('error', { title: res.locals.t('err_no_plan'), message: res.locals.t('err_no_plan_yet') });

  // The printable document is the plan as the school wrote it, in the reader's
  // language, with the initiatives under each parameter rather than a list of
  // levels nobody can act on.
  const rows = planRows(plan, getIndicatorData(req.lang).INDICATORS);
  res.render('school/plan-document', {
    title: res.locals.t('plan_title'), layout: false,
    school, cycle, plan, rows, summary: planSummary(rows),
  });
});

// -------------------- Progress over time --------------------

router.get('/history', async (req, res) => {
  const school = req.school;
  const cycles = await prisma.assessmentCycle.findMany({
    where: { schoolId: school.id, status: 'CONFIRMED' },
    orderBy: { cycleNumber: 'asc' },
    // Progress over time is a history of what the school agreed, not of what
    // either side proposed along the way.
    include: { ratings: { where: { track: 'AGREED' } } },
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
    svg: renderWheel(itemsFromRatings(c.ratings, localeIndicators), { mode: 'indicators', size: 260, showLabels: false, t: res.locals.t }),
  }));
  res.render('school/history', { title: res.locals.t('history_title'), wide: true, school, cycles, history, cycleWheels });
});

module.exports = router;
