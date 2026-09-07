const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { capabilitiesFor, homeFor } = require('../services/capabilities');

const router = express.Router();
router.use(requireLogin);

// The picker a person lands on when they hold more than one post and this tab
// has not chosen one yet, and which the workspace control in the top bar
// links to.
//
// Every entry is a plain link to /w/<id>/…, so choosing a workspace is an
// ordinary navigation: it works without JavaScript, it can be bookmarked, and
// opening two of them in two tabs genuinely gives two independent contexts.
// Nothing here writes a session-wide "current role" — that is the whole point.

router.get('/', (req, res) => {
  const assignments = req.assignments || [];

  const options = assignments.map((a) => {
    const capabilities = capabilitiesFor(a.role, a.capabilities);
    // Send each one straight to the page that post actually starts on, rather
    // than to a landing page it may not be able to open.
    const home = homeFor(capabilities, { schoolId: a.schoolId });
    return {
      id: a.id,
      role: a.role,
      label: a.label,
      institution: a.school ? a.school.name : (a.territory ? a.territory.name : null),
      isSchool: !!a.schoolId,
      capabilityCount: capabilities.size,
      href: `/w/${a.id}${home === '/' ? '' : home}`,
      isCurrent: !!(req.workspace && req.workspace.id === a.id),
    };
  });

  res.render('workspace/choose', {
    title: res.locals.t('workspace_choose_title'),
    options,
    // A person with no assignment at all is not broken — an admin has simply
    // not given them a post yet, and saying so beats an empty page.
    hasNone: options.length === 0,
  });
});

module.exports = router;
