const express = require('express');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { activeTerritoryId, territoryFilter, coversSchool } = require('../middleware/workspace');
const { progressSummary } = require('../services/stepStatus');
const { flagsForSchool } = require('../services/flags');
const { INDICATORS, DOMAINS } = require('../data/indicators');
const { schoolsWithLatestCycle, selectOfficialAndCurrentCycle } = require('../services/schoolOverview');
const { renderWheel, itemsFromRatings } = require('../services/wheelChart');

const router = express.Router();
router.use(requireCapability('view.regional'));

router.get('/', async (req, res) => {
  // territoryFilter yields {} when the post is not tied to one district, so
  // an unscoped post sees every district instead of the empty list that
  // `{ territoryId: null }` used to produce. See middleware/workspace.js.
  const territoryId = activeTerritoryId(req);
  const rows = await schoolsWithLatestCycle(territoryFilter(req));
  const confirmedRows = rows.filter((r) => r.confirmed);
  res.render('territorial/dashboard', {
    title: res.locals.t('territorial_title'), wide: true, rows,
    // From the active post, not the legacy column on the user record. The
    // rows are already scoped by activeTerritoryId; reading the name from a
    // different place meant a person holding two posts could be shown one
    // district's schools under another district's heading.
    // Named from whichever source actually decided the scope: the post's own
    // district, or the district of the school this post supports. Null means
    // no district limit at all, and the view says so rather than leaving the
    // heading blank.
    territoryName: territoryId === null
      ? null
      : (req.workspace.territoryName || req.workspace.schoolTerritoryName || null),
    scopedToOneDistrict: territoryId !== null,
    totalSchools: rows.length, confirmedCount: confirmedRows.length,
  });
});

router.get('/schools/:id', async (req, res) => {
  const school = await prisma.school.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      territory: true,
      cycles: {
        orderBy: { cycleNumber: 'desc' },
        // evidences and the infrastructure rows so progressSummary can name
        // what is actually blocking confirmation rather than only counting
        // ratings.
        include: {
          ratings: { include: { evidences: true } },
          deviceInventory: true,
          networkChecklist: true,
        },
      },
    },
  });
  if (!coversSchool(req, school)) {
    return res.status(403).render('error', { title: res.locals.t('err_access_denied'), message: res.locals.t('err_outside_territory') });
  }
  // Same rule as the Ministry detail view: the official record is the
  // latest CONFIRMED cycle, never a newer draft in progress.
  const { currentCycle, officialCycle: latest, hasNewerDraft } = selectOfficialAndCurrentCycle(school.cycles);
  const wheelSvg = latest ? renderWheel(itemsFromRatings(latest.ratings, INDICATORS), { mode: 'indicators', size: 380, t: res.locals.t }) : null;
  const flags = await flagsForSchool(school.id);
  res.render('territorial/school-detail', {
    title: school.name, wide: true, school, latest, currentCycle, hasNewerDraft,
    INDICATORS, DOMAINS, wheelSvg,
    // What the school is doing now, not only what it has confirmed. Without
    // this, a district watching a first assessment sees an empty page.
    progress: currentCycle && currentCycle.status === 'DRAFT' ? progressSummary(currentCycle) : null,
    // Concerns raised from this page used to vanish into the audit log, which
    // this role cannot read.
    flags,
  });
});

router.post('/schools/:id/flag', async (req, res) => {
  // MVP simplification: flags are logged to the audit trail (visible to
  // Ministry via /admin or a future dedicated flags view) rather than a
  // separate Flag model — see README "Not yet built" for the fuller
  // version (UC-T3) this stands in for.
  const school = await prisma.school.findUnique({ where: { id: Number(req.params.id) } });
  if (!coversSchool(req, school)) {
    return res.status(403).render('error', { title: res.locals.t('err_access_denied'), message: res.locals.t('err_outside_territory') });
  }
  const { logAction } = require('../services/audit');
  await logAction(req.session.user.id, 'TERRITORIAL_FLAG', 'School', req.params.id, req.body.reason);
  res.redirect(res.locals.href(`/territorial/schools/${req.params.id}`));
});

module.exports = router;
