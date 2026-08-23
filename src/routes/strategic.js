const express = require('express');
const { requireRole } = require('../middleware/auth');
const { schoolsWithLatestCycle } = require('../services/schoolOverview');

const router = express.Router();
router.use(requireRole('STRATEGIC_PARTNER'));

// A pre-built lens on the same dashboard data, filtered to Domain C
// (C1 teacher competence, C3 PD/mentoring capacity, C4 AI literacy) — see
// "DigiPuls - use case catalog.md" UC-SP1. Not a general-purpose query
// builder; this role gets exactly the view its use case needs.
router.get('/', async (req, res) => {
  const rows = await schoolsWithLatestCycle();
  const confirmedRows = rows.filter((r) => r.confirmed);

  const withCScores = await Promise.all(
    confirmedRows.map(async (r) => {
      const c1 = r.cycle.ratings.find((x) => x.indicatorCode === 'C1');
      const c3 = r.cycle.ratings.find((x) => x.indicatorCode === 'C3');
      const c4 = r.cycle.ratings.find((x) => x.indicatorCode === 'C4');
      return { school: r.school, c1: c1?.level ?? null, c3: c3?.level ?? null, c4: c4?.level ?? null };
    })
  );
  withCScores.sort((a, b) => (a.c1 + a.c3 + a.c4) - (b.c1 + b.c3 + b.c4)); // lowest capacity first = highest training need

  res.render('strategic/dashboard', { title: 'Training-needs dashboard', wide: true, rows: withCScores });
});

module.exports = router;
