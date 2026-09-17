const express = require('express');
const prisma = require('../config/db');
const { requireSchoolWorkspace, requireCapability } = require('../middleware/auth');
const { activeSchoolId } = require('../middleware/workspace');
const { INDICATORS, DOMAINS } = require('../data/indicators'); // structural use only (codes, counts) — locale-invariant
const { getIndicatorData } = require('../data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { EVIDENCE_TYPES } = require('../data/evidenceTypes');
const cycleService = require('../services/cycleService');
const { logAction } = require('../services/audit');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');
const { computeStepStatuses, finalizeReviewStatus, overallProgress } = require('../services/stepStatus');
const { ValidationError, toLevel, toNonNegativeInt } = require('../utils/validate');
const { mentorsForSchool } = require('../services/mentors');
const { SCHOOL_ROLES, reachesEverySchool } = require('../services/capabilities');
const {
  trackForRole, AGREED, WORKING_TRACKS, reconciliation, outstanding, maskForTrack, missingReadings,
} = require('../services/tracks');

// The shortest reason accepted for confirming without both sides' readings.
// Long enough that "ok" or "n/a" will not do.
const MIN_REASON = 20;
const {
  ADVANCE, MAINTAIN, INTENTS, INITIATIVE_STATUSES,
  openPlan, requirementsFor, planRows, planSummary, targetChoices, loadPlan,
} = require('../services/planService');
const { summariseDomains, isEvidenceLink } = require('../services/assessmentSummary');
const { reportVersionFor } = require('../services/reportVersions');
const evidenceFiles = require('../services/evidenceFiles');
const { verifyCsrf } = require('../middleware/csrf');
const {
  INTERIM, FINAL, REPORT_KINDS,
  reportTiming, reportLines, reportProgress, buildSnapshot,
} = require('../services/reportService');

const router = express.Router();
// Both must hold: the role because every route below reads the session's
// schoolId, the capability so an admin can suspend a school's access
// without changing what kind of account it is.
// Any of the positions a school fills — principal, deputy, mentor. They work
// on the same assessment; the two-track split between administration and team
// is a workflow question and is not a permissions boundary today.
router.use(requireSchoolWorkspace, requireCapability('view.school'), requireSchool);

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
    // An administrator has every school and none by default, so arriving here
    // without one is not a misconfiguration — it is a choice they have not
    // made yet. Send them to the picker rather than to an error page telling
    // them to ask an administrator, which they are.
    if (reachesEverySchool(req.capabilities)) return res.redirect('/workspace');
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
  const territory = school.territoryId
    ? await prisma.territory.findUnique({ where: { id: school.territoryId } })
    : null;
  res.render('school/dashboard', {
    title: res.locals.t('nav_dashboard'), wide: true, school, cycles, latest, hasConfirmedPrior, mentors, territory,
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
      ratings: {
        include: {
          evidences: {
            include: { addedBy: { select: { id: true, name: true } } },
            orderBy: { id: 'asc' },
          },
        },
      },
      deviceInventory: true,
      networkChecklist: true,
      plan: { include: { priorities: true } },
      previousCycle: { include: { ratings: { where: { track: AGREED } } } },
      personalRatings: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { id: 'asc' },
      },
      closedBy: { select: { id: true, name: true } },
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
  //
  // An administrator is not one of the two sides — they hold no post at this
  // school and are standing outside its process — so they write to the agreed
  // record directly rather than joining the administration's column and
  // silently becoming half of a reconciliation the school did not have. That
  // is what the AGREED fallback means here, and it is a decision rather than
  // an accident: an administrator editing a school's assessment should be
  // editing the official record, visibly, under their own name.
  const track = trackForRole(req.workspace ? req.workspace.role : null) || AGREED;
  cycle.allRatings = cycle.ratings;
  cycle.agreedRatings = cycle.ratings.filter((r) => r.track === AGREED);

  // Evidence is stored once, on the agreed row (see the evidence route), and
  // belongs to every reading of that parameter. The pages below read the
  // viewer's own row, which never carries any — so for as long as this was
  // missing, nobody ever saw the evidence they had just added, and every step
  // holding a level of 2 or above stayed red however much was attached, while
  // confirmation (which reads the agreed row) counted it correctly. Found by
  // the end-to-end check-up, September 2026.
  const evidenceByCode = new Map(cycle.agreedRatings.map((r) => [r.indicatorCode, r.evidences || []]));
  cycle.allRatings.forEach((r) => { r.evidences = evidenceByCode.get(r.indicatorCode) || []; });

  // Once a cycle is confirmed the two working columns are history and the
  // agreed record is what the school declared. Showing the viewer their own
  // column here meant a principal read A1 at 4 on their own wheel while the
  // Ministry, the metamentor and the public read the agreed 2.
  const shown = cycle.status === 'CONFIRMED' ? AGREED : track;
  cycle.ratings = cycle.ratings.filter((r) => r.track === shown);
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

/**
 * The review step's error line. The evidence refusal arrives as a key and a
 * list of codes and is worded here, from the translator, with the codes
 * checked against the instrument; anything else is passed through as before.
 */
function reviewError(req, res, indicators) {
  const { error, codes } = req.query;
  const keys = { evidence_missing: 'err_evidence_missing', readings_missing: 'err_readings_missing' };
  if (!keys[error]) return error || null;
  const known = new Set(indicators.map((i) => i.code));
  const named = String(codes || '').split(',').map((c) => c.trim()).filter((c) => known.has(c));
  return res.locals.t(keys[error], { n: named.length, codes: named.join(', '), min: MIN_REASON });
}

/** A step page's error line: a known key worded here, or passed through as before. */
function stepError(req, res) {
  const keys = { file_type: 'evidence_err_file_type', file_size: 'evidence_err_file_size' };
  const { error } = req.query;
  if (keys[error]) return res.locals.t(keys[error], { mb: evidenceFiles.MAX_BYTES / (1024 * 1024) });
  return error || null;
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
  const planTargets = cycle.plan ? cycle.plan.priorities : null;
  const wheelSvg = renderWheel(
    itemsFromRatings(cycle.ratings, localeData.INDICATORS, planTargets),
    { mode: 'indicators', t: res.locals.t },
  );

  // For the closing card: what of the cycle's work has been published.
  const reports = cycle.plan
    ? await prisma.planReport.findMany({ where: { planId: cycle.plan.id }, select: { kind: true, publishedAt: true } })
    : [];
  const published = (kind) => reports.some((r) => r.kind === kind && r.publishedAt);

  res.render('school/cycle-overview', {
    closing: {
      hasPlan: !!cycle.plan,
      interimPublished: published(INTERIM),
      finalPublished: published(FINAL),
    },
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
    const assignedTo = await assignmentsByCode(cycle.id);
    // In a draft, on one of the two sides, the picker shows this person's own
    // reading, and the side's readings so far are listed beneath it.
    const personal = cycle.status === 'DRAFT' && WORKING_TRACKS.includes(req.track);
    const me = req.session.user.id;
    const onMySide = cycle.personalRatings.filter((p) => p.track === req.track && Number.isInteger(p.level));
    const indicators = localeData.INDICATORS.filter((i) => i.domain === stepKey).map((ind) => ({
      ...ind,
      rating: ratingsByCode.get(ind.code) || null,
      priorRating: priorByCode ? priorByCode.get(ind.code) : null,
      assignees: assignedTo.get(ind.code) || [],
      ...(personal ? {
        myReading: cycle.personalRatings.find((p) => p.track === req.track && p.userId === me
          && p.indicatorCode === ind.code) || null,
        sideReadings: onMySide.filter((p) => p.indicatorCode === ind.code)
          .map((p) => ({ userId: p.userId, name: p.user.name, level: p.level })),
      } : {}),
    }));
    const ratedInDomain = indicators.filter((i) => i.rating && i.rating.level !== null && i.rating.level !== undefined).length;
    return res.render('school/step-domain', {
      title: `Cycle ${cycle.cycleNumber} — Domain ${stepKey}`, wide: true,
      school, cycle, stepStatuses, domainCode: stepKey, domainName: localeData.DOMAINS[stepKey],
      domainIntro: '', indicators, ratedInDomain, totalInDomain: indicators.length,
      isContinuation: !!cycle.previousCycleId,
      errorMessage: stepError(req, res),
      fileBase: `/school/cycles/${cycle.id}/evidence/`,
      evidenceAccept: evidenceFiles.ACCEPT,
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
    const wheelSvg = renderWheel(
      itemsFromRatings(cycle.ratings, localeData.INDICATORS, cycle.plan ? cycle.plan.priorities : null),
      { mode: 'indicators', t: res.locals.t },
    );
    return res.render('school/step-review', {
      title: `Cycle ${cycle.cycleNumber} — Review`, wide: true,
      school, cycle, stepStatuses, domains, wheelSvg,
      summary: summariseDomains(cycle.ratings, localeData.INDICATORS, localeData.DOMAINS),
      isContinuation: !!cycle.previousCycleId,
      errorMessage: reviewError(req, res, localeData.INDICATORS),
      // Named before the principal presses Confirm, not only after a refusal.
      missingReadings: cycle.status === 'DRAFT'
        ? missingReadings(reconciliation(cycle.allRatings, INDICATORS)) : [],
      minReason: MIN_REASON,
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

  if (WORKING_TRACKS.includes(req.track)) {
    // This person's reading; the side's is derived from everyone's.
    const side = await cycleService.recordPersonalReading({
      cycleId: cycle.id, indicatorCode: code, track: req.track,
      userId: req.session.user.id, level, comment,
    });
    await logAction(req.session.user.id, 'SET_RATING', 'IndicatorRating', rating.id,
      `${code} ${req.track} -> level ${level} (side ${side})`);
  } else {
    if (cycle.previousCycleId) {
      await cycleService.setContinuationRating(rating.id, level, comment);
    } else {
      await prisma.indicatorRating.update({ where: { id: rating.id }, data: { level, comment } });
    }
    await logAction(req.session.user.id, 'SET_RATING', 'IndicatorRating', rating.id, `${code} -> level ${level}`);
  }
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/${returnStep}#ind-${code}`));
});

router.post('/cycles/:id/ratings/:code/evidence', loadCycleForSchool, requireDraftCycle,
  evidenceFiles.receiveFile, async (req, res) => {
  // A form with a file arrives multipart, and its token is only readable now.
  if (req.csrfDeferred && !verifyCsrf(req, res)) return undefined;
  const cycle = req.cycle;
  const { code } = req.params;
  // Evidence hangs off the agreed row, not off the track of whoever uploaded
  // it. Evidence supports the school's claim about itself; it is not one
  // side's argument for their own number, and it has to survive reconciliation
  // settling on a level neither side proposed.
  const rating = cycle.agreedRatings.find((r) => r.indicatorCode === code);
  if (!rating) return res.status(400).send(res.locals.t('err_unknown_indicator'));

  const { type, description, source } = req.body;
  const returnTo = req.body.returnStep || code[0];
  const back = (error) => res.redirect(res.locals.href(
    `/school/cycles/${cycle.id}/step/${returnTo}${error ? `?error=${error}` : ''}#ind-${code}`));
  // The form offers nine types; the server used to store whatever arrived.
  if (!EVIDENCE_TYPES.includes(type) || !String(description || '').trim()) return back(null);

  let file = null;
  if (req.uploadError) return back(req.uploadError);
  if (req.file && req.file.size > 0) {
    const detected = evidenceFiles.detectType(req.file.originalname, req.file.buffer);
    if (!detected) return back('file_type');
    file = {
      filePath: await evidenceFiles.storeFile(req.file.buffer, detected.ext),
      fileName: evidenceFiles.cleanName(req.file.originalname),
      fileMime: detected.mime,
      fileSize: req.file.size,
    };
  }
  await prisma.evidence.create({
    data: {
      ratingId: rating.id,
      type,
      description: String(description).trim(),
      source: (source || '').trim() || null,
      addedById: req.session.user.id,
      ...(file || {}),
    },
  });
  await logAction(req.session.user.id, 'ADD_EVIDENCE', 'IndicatorRating', rating.id,
    `${type}: ${description}${file ? ` [file ${file.fileName}, ${file.fileSize} B]` : ''}`);
  return back(null);
});

// A file attached to evidence, for anyone in the school.
router.get('/cycles/:id/evidence/:eid/file', loadCycleForSchool, async (req, res) => {
  const id = Number(req.params.eid);
  const evidence = Number.isInteger(id) && id > 0
    ? await prisma.evidence.findUnique({ where: { id }, include: { rating: true } })
    : null;
  if (!evidence || evidence.rating.cycleId !== req.cycle.id || !evidenceFiles.sendFile(res, evidence)) {
    return res.status(404).render('error', {
      title: res.locals.t('err_not_found'), message: res.locals.t('evidence_err_not_found'),
    });
  }
  return undefined;
});

/**
 * One piece of this cycle's evidence, and whether this person may change it:
 * whoever added it, or the principal and deputy. Without the cycle check, an
 * id typed into the URL would reach another school's evidence.
 */
async function loadEvidence(req, res) {
  const id = Number(req.params.eid);
  const evidence = Number.isInteger(id) && id > 0
    ? await prisma.evidence.findUnique({ where: { id }, include: { rating: true } })
    : null;
  if (!evidence || evidence.rating.cycleId !== req.cycle.id) {
    res.status(404).render('error', {
      title: res.locals.t('err_not_found'), message: res.locals.t('evidence_err_not_found'),
    });
    return null;
  }
  const mayChange = res.locals.can('school.manage') || evidence.addedById === req.session.user.id;
  if (!mayChange) {
    res.status(403).render('error', {
      title: res.locals.t('err_access_denied'), message: res.locals.t('evidence_err_not_yours'),
    });
    return null;
  }
  return evidence;
}

// Correcting evidence before the school signs. It could only ever be added,
// so a wrong file name or a description pasted into the wrong parameter stayed
// on the record for good.
router.post('/cycles/:id/evidence/:eid', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const evidence = await loadEvidence(req, res);
  if (!evidence) return undefined;
  const code = evidence.rating.indicatorCode;
  const back = res.locals.href(`/school/cycles/${req.cycle.id}/step/${req.body.returnStep || code[0]}#ind-${code}`);

  const { type, description, source } = req.body;
  if (!EVIDENCE_TYPES.includes(type) || !String(description || '').trim()) return res.redirect(back);
  await prisma.evidence.update({
    where: { id: evidence.id },
    data: { type, description: String(description).trim(), source: (source || '').trim() || null },
  });
  await logAction(req.session.user.id, 'UPDATE_EVIDENCE', 'IndicatorRating', evidence.ratingId,
    `${code} ${type}: ${String(description).trim()}`);
  return res.redirect(back);
});

router.post('/cycles/:id/evidence/:eid/delete', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const evidence = await loadEvidence(req, res);
  if (!evidence) return undefined;
  const code = evidence.rating.indicatorCode;
  await prisma.evidence.delete({ where: { id: evidence.id } });
  await evidenceFiles.removeFile(evidence.filePath);
  // The description goes into the audit entry, so what was withdrawn is still
  // on the record after the row itself is gone.
  await logAction(req.session.user.id, 'REMOVE_EVIDENCE', 'IndicatorRating', evidence.ratingId,
    `${code} ${evidence.type}: ${evidence.description}${evidence.fileName ? ` [file ${evidence.fileName}]` : ''}`);
  return res.redirect(res.locals.href(
    `/school/cycles/${req.cycle.id}/step/${req.body.returnStep || code[0]}#ind-${code}`));
});

// The assessment as a document: for the staff meeting, the pedagogical
// council, the founder. The plan and the reports had one; the assessment the
// plan is built on did not.
router.get('/cycles/:id/document', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const localeData = getIndicatorData(req.lang);
  return res.render('school/assessment-document', {
    title: res.locals.t('assessment_doc_title'),
    layout: false,
    school: req.school,
    cycle,
    draft: cycle.status !== 'CONFIRMED',
    summary: summariseDomains(cycle.ratings, localeData.INDICATORS, localeData.DOMAINS),
    wheelSvg: renderWheel(itemsFromRatings(cycle.ratings, localeData.INDICATORS,
      cycle.plan ? cycle.plan.priorities : null), { mode: 'indicators', t: res.locals.t }),
    deviceCompliance: cycle.deviceInventory ? checkDeviceCompliance(req.school, cycle.deviceInventory) : null,
    networkCompliance: checkNetworkCompliance(cycle.networkChecklist),
    isEvidenceLink,
    fileBase: `/school/cycles/${cycle.id}/evidence/`,
  });
});

router.post('/cycles/:id/device', loadCycleForSchool, requireDraftCycle, async (req, res) => {
  const cycle = req.cycle;
  const fields = ['classroomPCs', 'interactivePanels', 'itRoomPCs', 'managementPCs', 'methodicalCentrePCs', 'libraryPCs', 'printers', 'multifunctionPrinters'];
  // Each kind of device is two numbers now: how many the school has, and how
  // many of those are waiting to be written off.
  const all = fields.flatMap((f) => [f, `${f}Obsolete`]);
  const data = {};
  try {
    all.forEach((f) => { data[f] = toNonNegativeInt(req.body[f] === '' ? 0 : req.body[f], f); });
    // Reported scrap cannot exceed the stock it is part of. Clamped rather
    // than refused: the school is mid-inventory and a hard error here loses
    // the other fifteen numbers they just typed.
    fields.forEach((f) => {
      if (data[`${f}Obsolete`] > data[f]) data[`${f}Obsolete`] = data[f];
    });
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
  await cycleService.enforceOrder675Floor(cycle.id, req.school, req.session.user.id);
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
  await cycleService.enforceOrder675Floor(cycle.id, req.school, req.session.user.id);
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/step/infra`));
});

// Closing a cycle turns a draft into the school's official, on-the-record
// declaration — which the Ministry, the partners and the public then read.
router.post('/cycles/:id/confirm', requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  if (cycle.status === 'CONFIRMED') return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/plan`));
  const school = req.school;
  // Once more at the signature, whatever happened before it. The floor is
  // applied when levels are saved and when the equipment data changes, but a
  // cycle opened before that second rule existed may still carry an agreed D1
  // or D2 above what its own data allows.
  const lowered = await cycleService.enforceOrder675Floor(cycle.id, school, req.session.user.id);
  lowered.forEach((row) => {
    const agreed = cycle.agreedRatings.find((r) => r.id === row.id);
    if (agreed) agreed.level = 0;
  });
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
    // A key and codes, not a sentence: this used to be built here in English
    // and printed as-is to Romanian and Russian readers.
    const codes = missingEvidence.map((r) => r.indicatorCode).join(',');
    return res.redirect(res.locals.href(
      `/school/cycles/${cycle.id}/step/review?error=evidence_missing&codes=${encodeURIComponent(codes)}`));
  }
  // Both sides are meant to read every parameter before a level is agreed. A
  // principal could otherwise settle all nineteen alone and sign — which was
  // tested, and worked, with the team having rated two. It is still allowed,
  // because a team member falling ill should not stall a school, but not
  // silently: the reason is recorded and shown beside the assessment.
  const unread = missingReadings(reconciliation(cycle.allRatings, INDICATORS));
  const reason = String(req.body.reason || '').trim();
  if (unread.length && reason.length < MIN_REASON) {
    return res.redirect(res.locals.href(
      `/school/cycles/${cycle.id}/step/review?error=readings_missing&codes=${encodeURIComponent(unread.join(','))}#confirm`));
  }
  await prisma.assessmentCycle.update({
    where: { id: cycle.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      confirmedById: req.session.user.id,
      confirmedWithoutReadings: unread.length ? unread.join(',') : null,
      confirmationNote: unread.length ? reason : null,
    },
  });
  await prisma.school.update({ where: { id: school.id }, data: { enrolmentBand: require('../data/order675').bandFor(school.enrolmentTotal) } });
  await logAction(req.session.user.id, 'CONFIRM_CYCLE', 'AssessmentCycle', cycle.id,
    unread.length ? `without both readings for ${unread.join(',')}: ${reason}` : null);
  res.redirect(res.locals.href(`/school/cycles/${cycle.id}/plan`));
});

// -------------------- Closing a cycle --------------------
//
// The school saying the cycle is finished. Deliberately not a lock: plans and
// reports stay editable, and a closed cycle can be reopened. It is recorded,
// dated and attributed, and shown wherever the cycle is.

router.post('/cycles/:id/close', requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  if (cycle.status !== 'CONFIRMED') {
    return res.status(409).render('error', {
      title: res.locals.t('close_err_title'), message: res.locals.t('close_err_not_confirmed'),
    });
  }
  if (!cycle.closedAt) {
    const note = String(req.body.note || '').trim() || null;
    await prisma.assessmentCycle.update({
      where: { id: cycle.id },
      data: { closedAt: new Date(), closedById: req.session.user.id, closingNote: note },
    });
    await logAction(req.session.user.id, 'CLOSE_CYCLE', 'AssessmentCycle', cycle.id, note);
  }
  return res.redirect(res.locals.href(`/school/cycles/${cycle.id}#closing`));
});

router.post('/cycles/:id/reopen', requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  if (cycle.closedAt) {
    await prisma.assessmentCycle.update({
      where: { id: cycle.id },
      data: { closedAt: null, closedById: null, closingNote: null },
    });
    await logAction(req.session.user.id, 'REOPEN_CYCLE', 'AssessmentCycle', cycle.id, cycle.closingNote);
  }
  return res.redirect(res.locals.href(`/school/cycles/${cycle.id}#closing`));
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
  const rows = reconciliation(cycle.allRatings, localeData.INDICATORS, cycle.personalRatings);

  // A cycle assessed before the two tracks existed has an agreed level and
  // two empty working columns. Saying "nobody has rated this" beside a real
  // recorded level would be untrue; the page says what actually happened
  // instead.
  const predatesTracks = rows.every((r) => r.state === 'empty') && rows.some((r) => r.settled);

  // Masked after the summary is computed from the real rows, and after
  // predatesTracks: the counts are about the school's progress and reveal no
  // levels, while the columns are the thing that has to stay apart. See
  // maskForTrack in services/tracks.js.
  const summary = outstanding(rows);
  const canSettle = res.locals.can('school.manage');
  // The agreed column is hidden too, from anyone who cannot settle. It is
  // usually a copy of one of the two readings, and a principal who agrees a
  // level before the team has answered was otherwise handing the team the
  // answer. The principal and the deputy wrote it, so it is not hidden from
  // them.
  //
  // Masking applies while the cycle is being assessed. Once it is confirmed
  // there is nothing left to answer independently, and the record is read
  // whole.
  const mine = cycle.personalRatings
    .filter((p) => p.track === req.track && p.userId === req.session.user.id && Number.isInteger(p.level))
    .map((p) => p.indicatorCode);
  const visible = cycle.status === 'CONFIRMED' ? rows : maskForTrack(rows, req.track, {
    hideAgreed: !canSettle,
    // Individual answers decide once anyone in this cycle has given one.
    answered: cycle.personalRatings.length ? new Set(mine) : undefined,
  });

  return res.render('school/reconcile', {
    title: res.locals.t('reconcile_title'),
    wide: true,
    school: req.school,
    cycle,
    rows: visible,
    predatesTracks,
    summary,
    // How many parameters this person is still hiding from themselves by not
    // having answered. Said plainly, because a row of dashes with no
    // explanation reads as a bug.
    hiddenCount: visible.filter((r) => r.hidden).length,
    // Everyone in the school can see where the two readings differ; only the
    // principal and the deputy can record what was agreed.
    canSettle,
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
  // What the last plan aimed at for each parameter. A renewal's plan used to
  // start with no memory of the one before it, so nobody could see at the
  // moment of setting new targets which of the old ones had been reached.
  const previousPlan = cycle.previousCycleId
    ? await prisma.developmentPlan.findUnique({
      where: { cycleId: cycle.previousCycleId }, include: { priorities: true },
    })
    : null;

  return res.render('school/plan', {
    previousByCode: previousPlan ? new Map(previousPlan.priorities.map((p) => [p.indicatorCode, p])) : null,
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

// Correcting a measure's wording. It could only be deleted and added again,
// which also threw away any result already recorded against it.
router.post('/cycles/:id/plan/kpis/:kid', loadCycleForSchool, async (req, res) => {
  const id = Number(req.params.kid);
  if (!Number.isInteger(id) || id <= 0) return notFoundInPlan(res);
  const kpi = await prisma.planKpi.findUnique({
    where: { id },
    include: { initiative: { include: { priority: { include: { plan: true } } } } },
  });
  if (!kpi || kpi.initiative.priority.plan.cycleId !== req.cycle.id) return notFoundInPlan(res);

  const measure = (req.body.measure || '').trim();
  const target = (req.body.target || '').trim();
  const back = planPath(req.cycle.id, kpi.initiative.priority.indicatorCode);
  if (!measure || !target) return res.redirect(res.locals.href(`${back}?error=kpi#i${kpi.initiativeId}`));

  await prisma.planKpi.update({ where: { id }, data: { measure, target } });
  await logAction(req.session.user.id, 'UPDATE_KPI', 'PlanInitiative', kpi.initiativeId,
    `${kpi.measure} -> ${kpi.target}  =>  ${measure} -> ${target}`);
  return res.redirect(res.locals.href(`${back}#i${kpi.initiativeId}`));
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
  await logAction(req.session.user.id, 'REMOVE_KPI', 'PlanInitiative', kpi.initiativeId,
    `${kpi.measure} -> ${kpi.target}`);
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
  await logAction(req.session.user.id, 'UPDATE_PLAN_DETAILS', 'DevelopmentPlan', plan.id, null);
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



// -------------------- Who takes which parameters --------------------
//
// Nineteen parameters is more than one person can evidence properly. A school
// fields a team of five or six precisely so the work can be split, and until
// now the platform had nowhere to write that split down — it was decided in a
// staff room and remembered, or not.
//
// What this is not: a permission. Anyone on the school team may still rate any
// parameter on their own side. Making it a gate would break the two tracks,
// which rest on each side rating all nineteen independently, and would strand
// a whole domain the week its owner is off sick. It records who took
// responsibility, not who is allowed — a plan of work rather than a lock.

/** Every assignment on this cycle, grouped by parameter. */
async function assignmentsByCode(cycleId) {
  const rows = await prisma.indicatorAssignment.findMany({
    where: { cycleId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { id: 'asc' },
  });
  const map = new Map();
  rows.forEach((r) => {
    if (!map.has(r.indicatorCode)) map.set(r.indicatorCode, []);
    map.get(r.indicatorCode).push({ id: r.user.id, name: r.user.name });
  });
  return map;
}

router.get('/cycles/:id/delegation', loadCycleForSchool, async (req, res) => {
  const cycle = req.cycle;
  const localeData = getIndicatorData(req.lang);
  const people = await schoolPeople(req.school.id);
  const byCode = await assignmentsByCode(cycle.id);

  const rows = localeData.INDICATORS.map((indicator) => ({
    indicator,
    assignees: byCode.get(indicator.code) || [],
  }));

  return res.render('school/delegation', {
    title: res.locals.t('delegation_title'),
    wide: true,
    school: req.school,
    cycle,
    rows,
    people,
    // How much of the instrument nobody has picked up. The number the person
    // doing the splitting actually needs.
    unassigned: rows.filter((r) => r.assignees.length === 0).map((r) => r.indicator.code),
    mine: rows.filter((r) => r.assignees.some((a) => a.id === req.session.user.id))
      .map((r) => r.indicator.code),
    canAssign: res.locals.can('school.manage'),
  });
});

router.post('/cycles/:id/delegation',
  requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
    const cycle = req.cycle;
    const people = await schoolPeople(req.school.id);
    const allowed = new Set(people.map((p) => p.id));
    const body = req.body.assign || {};

    // Rebuilt from the form rather than diffed, because a parameter nobody
    // ticked arrives as an absent key rather than an empty one — treating
    // absence as "no change" would make un-assigning impossible.
    const wanted = [];
    INDICATORS.forEach((ind) => {
      const raw = body[ind.code];
      const ids = (Array.isArray(raw) ? raw : (raw ? [raw] : []))
        .map((v) => Number(v))
        // Only this school's own people. An id typed into the form reaches
        // nobody else.
        .filter((n) => Number.isInteger(n) && allowed.has(n));
      [...new Set(ids)].forEach((userId) => wanted.push({ indicatorCode: ind.code, userId }));
    });

    await prisma.indicatorAssignment.deleteMany({ where: { cycleId: cycle.id } });
    if (wanted.length) {
      await prisma.indicatorAssignment.createMany({
        data: wanted.map((w) => ({
          cycleId: cycle.id,
          indicatorCode: w.indicatorCode,
          userId: w.userId,
          assignedById: req.session.user.id,
        })),
      });
    }
    await logAction(req.session.user.id, 'SET_DELEGATION', 'AssessmentCycle', cycle.id,
      `${wanted.length} assignments across ${new Set(wanted.map((w) => w.indicatorCode)).size} parameters`);
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}/delegation`));
  });

// -------------------- Publishing the assessment --------------------
//
// Confirming settles what the school found; publishing decides that the public
// may read it. Two different acts, both the principal's. The Ministry, the
// partners and the school's metamentor see a confirmed assessment either way —
// this gate is only on the public tier.

router.post('/cycles/:id/publish',
  requireCapability('school.publish'), loadCycleForSchool, async (req, res) => {
    const cycle = req.cycle;
    if (cycle.status !== 'CONFIRMED') {
      return res.status(409).render('error', {
        title: res.locals.t('publish_err_not_confirmed_title'),
        message: res.locals.t('publish_err_not_confirmed'),
      });
    }
    const publish = req.body.publish !== 'false';
    await prisma.assessmentCycle.update({
      where: { id: cycle.id },
      data: {
        publishedAt: publish ? (cycle.publishedAt || new Date()) : null,
        publishedById: publish ? req.session.user.id : null,
      },
    });
    await logAction(req.session.user.id, publish ? 'PUBLISH_ASSESSMENT' : 'UNPUBLISH_ASSESSMENT',
      'AssessmentCycle', cycle.id, null);
    return res.redirect(res.locals.href(`/school/cycles/${cycle.id}`));
  });

// -------------------- What the measures actually reached --------------------

router.post('/cycles/:id/plan/kpis/:kid/actual', loadCycleForSchool, async (req, res) => {
  const id = Number(req.params.kid);
  if (!Number.isInteger(id) || id <= 0) return notFoundInPlan(res);
  const kpi = await prisma.planKpi.findUnique({
    where: { id },
    include: { initiative: { include: { priority: { include: { plan: true } } } } },
  });
  if (!kpi || kpi.initiative.priority.plan.cycleId !== req.cycle.id) return notFoundInPlan(res);

  const actual = (req.body.actual || '').trim();
  // Each report writes its own year. See PlanKpi in the schema.
  const kind = req.body.kind === FINAL ? FINAL : INTERIM;
  const field = kind === FINAL ? 'finalActual' : 'actual';
  await prisma.planKpi.update({ where: { id }, data: { [field]: actual || null } });
  await logAction(req.session.user.id, 'RECORD_KPI_ACTUAL', 'PlanKpi', id,
    `${kind} ${kpi.measure}: ${actual || '(cleared)'}`);
  return res.redirect(res.locals.href(
    `/school/cycles/${req.cycle.id}/plan/report/${req.body.kind === FINAL ? FINAL : INTERIM}#k${id}`));
});

// -------------------- The interim and final reports --------------------

async function loadReport(planId, kind) {
  return prisma.planReport.findUnique({
    where: { planId_kind: { planId, kind } },
    include: {
      versions: {
        orderBy: { publishedAt: 'desc' },
        include: { publishedBy: { select: { id: true, name: true } } },
      },
    },
  });
}

function reportKind(req) {
  const kind = String(req.params.kind || '').toUpperCase();
  return REPORT_KINDS.includes(kind) ? kind : null;
}

router.get('/cycles/:id/plan/report/:kind', loadCycleForSchool, async (req, res) => {
  const kind = reportKind(req);
  if (!kind) return notFoundInPlan(res);

  const cycle = req.cycle;
  const plan = await loadPlan(cycle.id);
  if (!plan) return notFoundInPlan(res);

  const rows = planRows(plan, getIndicatorData(req.lang).INDICATORS);
  const report = await loadReport(plan.id, kind);
  const lines = reportLines(rows, kind);

  return res.render('school/plan-report', {
    title: res.locals.t(`report_title_${kind}`),
    wide: true,
    school: req.school,
    cycle,
    plan,
    kind,
    report,
    lines,
    progress: reportProgress(lines),
    timing: reportTiming(plan, kind),
    canManage: res.locals.can('school.manage'),
    canPublish: res.locals.can('school.publish'),
  });
});

// The narrative is the school's account of the year, so it is written by the
// principal rather than accumulated from the initiatives.
router.post('/cycles/:id/plan/report/:kind',
  requireCapability('school.manage'), loadCycleForSchool, async (req, res) => {
    const kind = reportKind(req);
    if (!kind) return notFoundInPlan(res);
    const plan = await loadPlan(req.cycle.id);
    if (!plan) return notFoundInPlan(res);

    const narrative = (req.body.narrative || '').trim() || null;
    await prisma.planReport.upsert({
      where: { planId_kind: { planId: plan.id, kind } },
      create: { planId: plan.id, kind, narrative },
      update: { narrative },
    });
    return res.redirect(res.locals.href(`/school/cycles/${req.cycle.id}/plan/report/${kind}`));
  });

router.post('/cycles/:id/plan/report/:kind/publish',
  requireCapability('school.publish'), loadCycleForSchool, async (req, res) => {
    const kind = reportKind(req);
    if (!kind) return notFoundInPlan(res);
    const plan = await loadPlan(req.cycle.id);
    if (!plan) return notFoundInPlan(res);

    const rows = planRows(plan, getIndicatorData(req.lang).INDICATORS);
    const existing = await loadReport(plan.id, kind);
    const publishedAt = new Date();
    // Frozen here, not read live afterwards: implementation continues, and a
    // report that kept reading the plan would end up describing a later year
    // than the one it reports on.
    const snapshot = buildSnapshot(rows, {
      narrative: existing ? existing.narrative : null, kind, publishedAt,
    });

    const published = await prisma.planReport.upsert({
      where: { planId_kind: { planId: plan.id, kind } },
      create: {
        planId: plan.id, kind, narrative: null, snapshot,
        publishedAt, publishedById: req.session.user.id,
      },
      update: { snapshot, publishedAt, publishedById: req.session.user.id },
    });
    // And kept, so republishing adds a version instead of replacing the one
    // already sent out.
    await prisma.planReportVersion.create({
      data: { reportId: published.id, snapshot, publishedAt, publishedById: req.session.user.id },
    });
    await logAction(req.session.user.id, 'PUBLISH_REPORT', 'DevelopmentPlan', plan.id, kind);
    return res.redirect(res.locals.href(
      `/school/cycles/${req.cycle.id}/plan/report/${kind}/document`));
  });

router.get('/cycles/:id/plan/report/:kind/document', loadCycleForSchool, async (req, res) => {
  const kind = reportKind(req);
  if (!kind) return notFoundInPlan(res);
  const plan = await loadPlan(req.cycle.id);
  if (!plan) return notFoundInPlan(res);
  const report = await loadReport(plan.id, kind);
  if (!report || !report.publishedAt) {
    return res.status(404).render('error', {
      title: res.locals.t('report_err_unpublished_title'),
      message: res.locals.t('report_err_unpublished'),
    });
  }

  // Read from the snapshot, never from the live plan — that is the whole point
  // of taking one. An earlier version when one is asked for.
  const shown = await reportVersionFor(report, req.query.version);
  if (!shown) return notFoundInPlan(res);
  return res.render('school/report-document', {
    title: res.locals.t(`report_title_${kind}`),
    layout: false,
    school: req.school,
    cycle: req.cycle,
    plan,
    ...shown,
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
    include: { ratings: { where: { track: 'AGREED' } }, plan: { include: { priorities: true } } },
  });
  const localeIndicators = getIndicatorData(req.lang).INDICATORS;
  // Each cycle's plan, by cycle, so a level can be read against what the plan
  // before it was aiming for.
  const planByCycle = new Map(cycles.map((c) => [c.id, c.plan]));
  const history = localeIndicators.map((ind) => ({
    code: ind.code, domain: ind.domain, name: ind.name,
    series: cycles.map((c) => {
      const r = c.ratings.find((x) => x.indicatorCode === ind.code);
      const previousPlan = c.previousCycleId ? planByCycle.get(c.previousCycleId) : null;
      const aimed = previousPlan
        ? previousPlan.priorities.find((p) => p.indicatorCode === ind.code && p.intent === 'ADVANCE')
        : null;
      const level = r ? r.level : null;
      return {
        cycleNumber: c.cycleNumber,
        level,
        changeState: r ? r.changeState : null,
        // Only where the last plan set out to advance this parameter. Holding
        // a level is not a target to be "reached".
        planTarget: aimed ? aimed.targetLevel : null,
        reached: aimed && level !== null ? level >= aimed.targetLevel : null,
      };
    }),
  }));
  const cycleWheels = cycles.map((c) => ({
    cycleNumber: c.cycleNumber,
    svg: renderWheel(itemsFromRatings(c.ratings, localeIndicators), { mode: 'indicators', size: 260, showLabels: false, t: res.locals.t }),
  }));
  res.render('school/history', { title: res.locals.t('history_title'), wide: true, school, cycles, history, cycleWheels });
});

module.exports = router;
