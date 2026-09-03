const express = require('express');
const prisma = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { INDICATORS, DOMAINS } = require('../data/indicators');
const { checkDeviceCompliance, checkNetworkCompliance } = require('../data/order675');
const { logAction } = require('../services/audit');
const { schoolsWithLatestCycle, filterRows, toCsv, ENROLMENT_BANDS, selectOfficialAndCurrentCycle } = require('../services/schoolOverview');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');

const router = express.Router();
router.use(requireRole('MINISTRY', 'ADMIN'));

router.get('/', async (req, res) => {
  const allRows = await schoolsWithLatestCycle();
  const rows = filterRows(allRows, req.query);
  const confirmedRows = allRows.filter((r) => r.confirmed);
  const avg = (key) => {
    const vals = confirmedRows.map((r) => r.domainScores[key]).filter((v) => v !== null);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
  };
  const complianceCount = confirmedRows.filter((r) => r.deviceCompliance?.compliant && r.networkCompliance?.compliant).length;
  const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });

  res.render('ministry/dashboard', {
    title: res.locals.t('ministry_dashboard_title'), wide: true,
    rows, totalSchools: allRows.length, filteredCount: rows.length, confirmedCount: confirmedRows.length,
    avgA: avg('A'), avgB: avg('B'), avgC: avg('C'), avgD: avg('D'),
    complianceCount, territories, bands: ENROLMENT_BANDS, query: req.query,
  });
});

router.get('/export.csv', async (req, res) => {
  const allRows = await schoolsWithLatestCycle();
  const rows = filterRows(allRows, req.query);
  await logAction(req.session.user.id, 'EXPORT_CSV', 'School', null, `${rows.length} rows`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="digipuls-schools.csv"');
  res.send(toCsv(rows));
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: { territory: true, cycles: { orderBy: { cycleNumber: 'desc' }, include: { ratings: true, deviceInventory: true, networkChecklist: true, plan: { include: { priorities: true } } } } },
  });
  if (!school) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('err_school_not_found') });
  // The official record shown here (wheel, compliance, validations) must
  // come from the latest CONFIRMED cycle — never from a newer draft, which
  // would otherwise make an already-confirmed assessment vanish the moment
  // the school opens a continuation cycle. currentCycle (any status) only
  // drives the "in progress" note.
  const { currentCycle, officialCycle: latest, hasNewerDraft } = selectOfficialAndCurrentCycle(school.cycles);
  const deviceCompliance = latest?.deviceInventory ? checkDeviceCompliance(school, latest.deviceInventory) : null;
  const networkCompliance = latest?.networkChecklist ? checkNetworkCompliance(latest.networkChecklist) : null;
  const validations = latest ? await prisma.validationRecord.findMany({ where: { cycleId: latest.id } }) : [];
  const wheelSvg = latest ? renderWheel(itemsFromRatings(latest.ratings, INDICATORS), { mode: 'indicators', size: 380, t: res.locals.t }) : null;
  res.render('ministry/school-detail', {
    title: school.name, wide: true, school, latest, currentCycle, hasNewerDraft,
    deviceCompliance, networkCompliance, validations, INDICATORS, DOMAINS, wheelSvg,
  });
});

router.get('/compliance', async (req, res) => {
  const rows = await schoolsWithLatestCycle();
  const nonCompliant = rows.filter((r) => r.confirmed && (!r.deviceCompliance?.compliant || !r.networkCompliance?.compliant));
  res.render('ministry/compliance', { title: res.locals.t('compliance_title'), wide: true, rows: nonCompliant, allCount: rows.filter(r => r.confirmed).length });
});

module.exports = router;
