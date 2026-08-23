const express = require('express');
const prisma = require('../config/db');
const { requireRole } = require('../middleware/auth');
const { INDICATORS, DOMAINS } = require('../data/indicators');
const { schoolsWithLatestCycle } = require('../services/schoolOverview');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');

const router = express.Router();
router.use(requireRole('TERRITORIAL'));

router.get('/', async (req, res) => {
  const territoryId = req.session.user.territoryId;
  const rows = await schoolsWithLatestCycle({ territoryId });
  const confirmedRows = rows.filter((r) => r.confirmed);
  res.render('territorial/dashboard', {
    title: 'Regional dashboard', wide: true, rows,
    territoryName: req.session.user.territoryName,
    totalSchools: rows.length, confirmedCount: confirmedRows.length,
  });
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: { territory: true, cycles: { orderBy: { cycleNumber: 'desc' }, take: 1, include: { ratings: true } } },
  });
  if (!school || school.territoryId !== req.session.user.territoryId) {
    return res.status(403).render('error', { title: 'Access denied', message: 'This school is outside your territory.' });
  }
  const latest = school.cycles[0];
  const wheelSvg = latest ? renderWheel(itemsFromRatings(latest.ratings, INDICATORS), { mode: 'indicators', size: 380 }) : null;
  res.render('territorial/school-detail', { title: school.name, wide: true, school, latest, INDICATORS, DOMAINS, wheelSvg });
});

router.post('/schools/:id/flag', async (req, res) => {
  // MVP simplification: flags are logged to the audit trail (visible to
  // Ministry via /admin or a future dedicated flags view) rather than a
  // separate Flag model — see README "Not yet built" for the fuller
  // version (UC-T3) this stands in for.
  const { logAction } = require('../services/audit');
  await logAction(req.session.user.id, 'TERRITORIAL_FLAG', 'School', req.params.id, req.body.reason);
  res.redirect(`/territorial/schools/${req.params.id}`);
});

module.exports = router;
