// The active workspace: which of a person's assignments they are currently
// acting under.
//
// The hard requirement is that this is **per browser tab**, not per session.
// Elena is a meta-mentor for one lyceum and the DigiPuls coordinator for
// another; she must be able to keep both open in two tabs without one
// switching the other. Session state is shared across tabs, so it cannot
// carry this. A cookie cannot either — cookies are per browser.
//
// That leaves the URL, which is also the option that keeps working with
// JavaScript disabled and makes each workspace bookmarkable:
//
//     /w/12/school/cycles/3      Elena as coordinator at Gaudeamus
//     /w/47/ministry             Elena as meta-mentor
//
// Rather than re-declaring every route under a prefix, this middleware strips
// `/w/<id>` off the front of the URL and records it on the request. Every
// existing route mount, and every route path, is untouched — Express sees
// `/school/cycles/3` exactly as before.
//
// People with a single assignment (almost everyone) never see the prefix:
// res.locals.href() only adds it when there is a real choice to preserve.

const prisma = require('../config/db');
const { capabilitiesFor } = require('../services/capabilities');

const WORKSPACE_PATH = /^\/w\/(\d+)(\/.*)?$/;

/**
 * Pulls `/w/<id>` off the front of the URL. Must run before any router.
 */
function extractWorkspace(req, res, next) {
  const match = WORKSPACE_PATH.exec(req.url);
  if (match) {
    req.requestedWorkspaceId = Number(match[1]);
    // Rewriting req.url is what lets the rest of the app stay prefix-unaware.
    req.url = match[2] || '/';
  }
  next();
}

// Routes that mean the same thing whichever post you are wearing, and so are
// never workspace-scoped: the public tier needs no login at all, and the
// account-level ones act on the person rather than on one of their posts.
const UNSCOPED = /^\/(public-view|login|logout|lang|preferences|change-password|workspace)(\/|$)/;

/**
 * Builds the link helper for one workspace. Exported so the prefixing rule can
 * be tested on its own rather than only through a rendered page.
 */
function makeHref(assignmentId) {
  return (path) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return path;
    if (UNSCOPED.test(path)) return path;
    return `/w/${assignmentId}${path === '/' ? '' : path}`;
  };
}

function describe(assignment) {
  return {
    id: assignment.id,
    role: assignment.role,
    label: assignment.label || null,
    schoolId: assignment.schoolId,
    schoolName: assignment.school ? assignment.school.name : null,
    territoryId: assignment.territoryId,
    territoryName: assignment.territory ? assignment.territory.name : null,
  };
}

/**
 * Resolves the active assignment and hangs the derived permissions off the
 * request. Runs after loadAccount, which has already established that the
 * account exists and is active.
 */
async function loadWorkspace(req, res, next) {
  res.locals.can = () => false;
  res.locals.workspace = null;
  res.locals.workspaces = [];
  // Without a workspace prefix, href() is the identity function — which is
  // why single-assignment users see exactly the URLs they saw before.
  res.locals.href = (path) => path;

  if (!req.session.user) return next();

  let assignments;
  try {
    assignments = await prisma.assignment.findMany({
      where: { userId: req.session.user.id, isActive: true },
      include: { school: true, territory: true, capabilities: true },
      orderBy: [{ role: 'asc' }, { id: 'asc' }],
    });
  } catch (err) {
    return next(err);
  }

  req.assignments = assignments;
  res.locals.workspaces = assignments.map(describe);

  if (assignments.length === 0) {
    // An account with every assignment removed can still reach the public
    // tier, the display settings and logout — and is told why elsewhere.
    req.workspace = null;
    return next();
  }

  let active = null;
  if (req.requestedWorkspaceId) {
    active = assignments.find((a) => a.id === req.requestedWorkspaceId) || null;
    // Asking for someone else's workspace, or one that has been removed, is
    // not an error worth a 403 page: fall through to the normal choice, and
    // the URL simply stops resolving to it.
  }
  if (!active && assignments.length === 1) active = assignments[0];
  if (!active && req.session.lastWorkspaceId) {
    active = assignments.find((a) => a.id === req.session.lastWorkspaceId) || null;
  }

  if (!active) {
    // Several assignments and nothing chosen: the picker decides, rather than
    // the app guessing and showing the wrong institution's data.
    req.workspace = null;
    req.needsWorkspaceChoice = true;
    return next();
  }

  req.workspace = active;
  // Remembered only as the default for a *new* tab that arrives without a
  // prefix. It never overrides an explicit /w/<id>, so it cannot make one tab
  // hijack another.
  req.session.lastWorkspaceId = active.id;

  const capabilities = capabilitiesFor(active.role, active.capabilities);
  req.capabilities = capabilities;
  res.locals.capabilities = capabilities;
  res.locals.can = (capability) => capabilities.has(capability);
  res.locals.workspace = describe(active);

  // Only prefix once there is genuinely more than one workspace to keep apart,
  // so a single-post account sees exactly the URLs it saw before.
  if (assignments.length > 1) res.locals.href = makeHref(active.id);
  next();
}

/**
 * For the handful of routes that need the school/territory the person is
 * currently acting for, rather than a column on their user record.
 */
function activeSchoolId(req) {
  return req.workspace ? req.workspace.schoolId : null;
}

function activeTerritoryId(req) {
  return req.workspace ? req.workspace.territoryId : null;
}

module.exports = { extractWorkspace, loadWorkspace, makeHref, activeSchoolId, activeTerritoryId, describe, WORKSPACE_PATH };
