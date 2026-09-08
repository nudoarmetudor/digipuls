const express = require('express');
const { requireCapability } = require('../middleware/auth');
const { schoolsWithLatestCycle } = require('../services/schoolOverview');
const { rankTrainingNeed } = require('../services/trainingNeed');

const router = express.Router();
router.use(requireCapability('view.training'));

// A pre-built lens on the same dashboard data, filtered to Domain C — see
// "DigiPuls - use case catalog.md" UC-SP1. Not a general-purpose query
// builder; this role gets exactly the view its use case needs.
//
// The ranking itself lives in services/trainingNeed.js so it can be tested
// without a server. Both of the mistakes it used to make were invisible on
// screen with today's data and would have surfaced later.
router.get('/', async (req, res) => {
  const rows = await schoolsWithLatestCycle();
  const { ranked, incomplete } = rankTrainingNeed(rows);

  res.render('strategic/dashboard', {
    title: res.locals.t('strategic_title'),
    wide: true,
    rows: ranked,
    incomplete,
    totalSchools: rows.length,
  });
});

module.exports = router;
