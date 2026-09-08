const express = require('express');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { activeTerritoryId } = require('../middleware/workspace');
const { INDICATORS, DOMAINS } = require('../data/indicators');
const { schoolsWithLatestCycle, selectOfficialAndCurrentCycle } = require('../services/schoolOverview');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');

const router = express.Router();
router.use(requireCapability('view.regional'));

router.get('/', async (req, res) => {
  const territoryId = activeTerritoryId(req);
  const rows = await schoolsWithLatestCycle({ territoryId });
  const confirmedRows = rows.filter((r) => r.confirmed);
  res.render('territorial/dashboard', {
    title: res.locals.t('territorial_title'), wide: true, rows,
    // From the active post, not the legacy column on the user record. The
    // rows are already scoped by activeTerritoryId; reading the name from a
    // different place meant a person holding two posts could be shown one
    // district's schools under another district's heading.
    territoryName: req.workspace ? req.workspace.territoryName : null,
    totalSchools: rows.length, confirmedCount: confirmedRows.length,
  });
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: { territory: true, cycles: { orderBy: { cycleNumber: 'desc' }, include: { ratings: true } } },
  });
  if (!school || school.territoryId !== activeTerritoryId(req)) {
    return res.status(403).render('error', { title: res.locals.t('err_access_denied'), message: res.locals.t('err_outside_territory') });
  }
  // Same rule as the Ministry detail view: the official record is the
  // latest CONFIRMED cycle, never a newer draft in progress.
  const { currentCycle, officialCycle: latest, hasNewerDraft } = selectOfficialAndCurrentCycle(school.cycles);
  const wheelSvg = latest ? renderWheel(itemsFromRatings(latest.ratings, INDICATORS), { mode: 'indicators', size: 380, t: res.locals.t }) : null;
  res.render('territorial/school-detail', { title: school.name, wide: true, school, latest, currentCycle, hasNewerDraft, INDICATORS, DOMAINS, wheelSvg });
});

router.post('/schools/:id/flag', async (req, res) => {
  // MVP simplification: flags are logged to the audit trail (visible to
  // Ministry via /admin or a future dedicated flags view) rather than a
  // separate Flag model — see README "Not yet built" for the fuller
  // version (UC-T3) this stands in for.
  const school = await prisma.school.findUnique({ where: { id: Number(req.params.id) } });
  if (!school || school.territoryId !== activeTerritoryId(req)) {
    return res.status(403).render('error', { title: res.locals.t('err_access_denied'), message: res.locals.t('err_outside_territory') });
  }
  const { logAction } = require('../services/audit');
  await logAction(req.session.user.id, 'TERRITORIAL_FLAG', 'School', req.params.id, req.body.reason);
  res.redirect(res.locals.href(`/territorial/schools/${req.params.id}`));
});

module.exports = router;
