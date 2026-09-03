const express = require('express');
const { requireRole } = require('../middleware/auth');
const { schoolsWithLatestCycle, filterRows, ENROLMENT_BANDS } = require('../services/schoolOverview');

const router = express.Router();
router.use(requireRole('PARTNER'));

// Deliberately information/visualization only — no matching engine, no
// "submit an offer and get a ranked shortlist" workflow. Partners get the
// same kind of filterable overview Ministry/Territorial use, scoped to
// aggregate figures (domain scores, compliance, band) rather than raw
// per-indicator evidence, so they can look at real school situations
// case by case, per the user's explicit direction: "situations are
// evaluated on a case by case approach... an automated matchmaking
// system can actually miss the reality."
router.get('/', async (req, res) => {
  const allRows = await schoolsWithLatestCycle();
  const rows = filterRows(allRows, req.query);
  res.render('partner/dashboard', {
    title: res.locals.t('partner_title'), wide: true, rows, totalSchools: allRows.length, filteredCount: rows.length, bands: ENROLMENT_BANDS, query: req.query,
  });
});

module.exports = router;
