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
  const byId = new Map(assignments.map((a) => [a.id, a]));

  // Built from res.locals.workspaces rather than from the assignments, because
  // an administrator's institutions are derived rather than stored — one
  // option per school, from a post that reaches all of them. See
  // middleware/workspace.js.
  const toOption = (w) => {
    const assignment = byId.get(w.id);
    const capabilities = capabilitiesFor(assignment.role, assignment.capabilities);
    // Send each one straight to the page that post actually starts on, rather
    // than to a landing page it may not be able to open.
    const home = homeFor(capabilities, { schoolId: w.schoolId });
    return {
      key: w.key,
      role: w.role,
      label: w.label,
      institution: w.schoolName || w.territoryName || null,
      isSchool: !!w.schoolId,
      capabilityCount: capabilities.size,
      href: `/w/${w.key}${home === '/' ? '' : home}`,
      isCurrent: !!(req.workspace && req.workspace.key === w.key),
    };
  };

  const all = res.locals.workspaces || [];
  const options = all.filter((w) => !w.inEverySchool).map(toOption);
  const institutions = all.filter((w) => w.inEverySchool).map(toOption);

  res.render('workspace/choose', {
    title: res.locals.t('workspace_choose_title'),
    options,
    institutions,
    // A person with no assignment at all is not broken — an admin has simply
    // not given them a post yet, and saying so beats an empty page.
    hasNone: options.length === 0 && institutions.length === 0,
  });
});

module.exports = router;
