const express = require('express');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { oversightFilter, scopedSchoolId, coversSchool } = require('../middleware/workspace');
// The instrument in the reader's own language. Imported through the picker
// rather than directly, because `data/indicators` is the *English* file: a
// direct import renders the whole parameter list in English to a reader who
// chose Romanian, which is what this page did — and it is a metamentor's main
// screen, so it was the page most likely to be read in Romanian.
const { getIndicatorData } = require('../data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { logAction } = require('../services/audit');
const { schoolsWithLatestCycle, filterRows, toCsv, ENROLMENT_BANDS, selectOfficialAndCurrentCycle } = require('../services/schoolOverview');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');
const { progressSummary } = require('../services/stepStatus');
const { flagsForSchool } = require('../services/flags');

const router = express.Router();
router.use(requireCapability('view.national', 'view.compliance'));

router.get('/', async (req, res) => {
  // Scoped, not national, for a post that names one institution: a metamentor
  // supports one lyceum and reads that one. A metacoordinator names none and
  // so is not narrowed — the whole group of twelve. See middleware/workspace.
  const allRows = await schoolsWithLatestCycle(oversightFilter(req));
  const rows = filterRows(allRows, req.query);
  const confirmedRows = allRows.filter((r) => r.confirmed);
  const avg = (key) => {
    const vals = confirmedRows.map((r) => r.domainScores[key]).filter((v) => v !== null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
  };
  const complianceCount = confirmedRows.filter((r) => r.deviceCompliance?.compliant && r.networkCompliance?.compliant).length;
  // Only districts that actually have a school. Offering an empty one is the
  // same defect as the regional dashboard that returned nothing: a control
  // that looks like it filters and answers with a blank page. Districts come
  // and go as schools are provisioned, so this is decided per request rather
  // than by tidying the table.
  const territories = await prisma.territory.findMany({
    where: { schools: { some: {} } },
    orderBy: { name: 'asc' },
  });

  const onlySchool = scopedSchoolId(req);
  res.render('ministry/dashboard', {
    title: res.locals.t('ministry_dashboard_title'), wide: true,
    // A page headed "national" that lists one school is lying about itself.
    scopedToOneSchool: onlySchool !== null,
    scopedSchoolName: onlySchool !== null && req.workspace ? req.workspace.schoolName : null,
    rows, totalSchools: allRows.length, filteredCount: rows.length, confirmedCount: confirmedRows.length,
    avgA: avg('A'), avgB: avg('B'), avgC: avg('C'), avgD: avg('D'),
    complianceCount, territories, bands: ENROLMENT_BANDS, query: req.query,
  });
});

// Deliberately not /export.csv. The extension is what made the CDN treat this
// as a static asset and serve one Ministry download to the whole internet; a
// path with no extension is not offered to that heuristic in the first place.
// The file the browser saves is still named by Content-Disposition, so nothing
// changes for the person clicking it.
router.get('/export', async (req, res) => {
  // The same scope as the page it is exported from. A download that quietly
  // carried more rows than the screen would be the leak the screen prevents.
  const allRows = await schoolsWithLatestCycle(oversightFilter(req));
  const rows = filterRows(allRows, req.query);
  await logAction(req.session.user.id, 'EXPORT_CSV', 'School', null, `${rows.length} rows`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="digipuls-schools.csv"');
  res.send(toCsv(rows));
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      territory: true,
      cycles: {
        orderBy: { cycleNumber: 'desc' },
        include: {
          // evidences so progressSummary can say which indicators are rated
          // Level 2+ with nothing attached — one of the two things that
          // actually blocks a school from confirming.
          // The agreed track: the official record, not either side's working
          // draft. Every reader outside the school sees only this.
          ratings: { where: { track: 'AGREED' }, include: { evidences: true } },
          deviceInventory: true,
          networkChecklist: true,
          plan: { include: { priorities: true } },
        },
      },
    },
  });
  if (!school) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('err_school_not_found') });
  // The scope check this page never had. Holding view.national used to mean
  // every school's full per-parameter record was one URL away, which is more
  // than a metamentor's position carries: they support one lyceum. A post that
  // names no institution — the Ministry, a metacoordinator — is not narrowed,
  // and the same person's coordinator post therefore still reads all twelve.
  if (!coversSchool(req, school)) {
    return res.status(403).render('error', {
      title: res.locals.t('err_access_denied'),
      message: res.locals.t('err_outside_school_scope'),
    });
  }
  // The official record shown here (wheel, compliance, validations) must
  // come from the latest CONFIRMED cycle — never from a newer draft, which
  // would otherwise make an already-confirmed assessment vanish the moment
  // the school opens a continuation cycle. currentCycle (any status) only
  // drives the "in progress" note.
  const { currentCycle, officialCycle: latest, hasNewerDraft } = selectOfficialAndCurrentCycle(school.cycles);
  const deviceCompliance = latest?.deviceInventory ? checkDeviceCompliance(school, latest.deviceInventory) : null;
  const networkCompliance = latest?.networkChecklist ? checkNetworkCompliance(latest.networkChecklist) : null;
  const validations = latest ? await prisma.validationRecord.findMany({ where: { cycleId: latest.id } }) : [];
  const { INDICATORS, DOMAINS } = getIndicatorData(req.lang);
  const wheelSvg = latest
    ? renderWheel(
      itemsFromRatings(latest.ratings, INDICATORS, latest.plan ? latest.plan.priorities : null),
      { mode: 'indicators', size: 380, t: res.locals.t },
    )
    : null;
  const flags = await flagsForSchool(school.id);
  res.render('ministry/school-detail', {
    title: school.name, wide: true, school, latest, currentCycle, hasNewerDraft,
    deviceCompliance, networkCompliance, validations, INDICATORS, DOMAINS, wheelSvg,
    // Half the pilot has no confirmed cycle yet, so without this the page for
    // a school midway through its first assessment says almost nothing.
    progress: currentCycle && currentCycle.status === 'DRAFT' ? progressSummary(currentCycle) : null,
    flags,
  });
});

router.get('/compliance', async (req, res) => {
  const rows = await schoolsWithLatestCycle(oversightFilter(req));
  const nonCompliant = rows.filter((r) => r.confirmed && (!r.deviceCompliance?.compliant || !r.networkCompliance?.compliant));
  res.render('ministry/compliance', { title: res.locals.t('compliance_title'), wide: true, rows: nonCompliant, allCount: rows.filter(r => r.confirmed).length });
});

module.exports = router;
