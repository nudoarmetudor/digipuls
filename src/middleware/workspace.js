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
const { capabilitiesFor, reachesEverySchool } = require('../services/capabilities');

// `/w/12` is assignment 12. `/w/12s3` is assignment 12 working inside school
// 3 — the form an administrator uses, because an administrator holds one post
// and every institution. The school is in the URL for the same reason the post
// is: two tabs must be able to sit in two different schools at once, which
// neither the session nor a cookie can do.
const WORKSPACE_PATH = /^\/w\/(\d+)(?:s(\d+))?(\/.*)?$/;

/**
 * Pulls `/w/<id>` off the front of the URL. Must run before any router.
 */
function extractWorkspace(req, res, next) {
  const match = WORKSPACE_PATH.exec(req.url);
  if (match) {
    req.requestedWorkspaceId = Number(match[1]);
    if (match[2]) req.requestedSchoolId = Number(match[2]);
    // Rewriting req.url is what lets the rest of the app stay prefix-unaware.
    req.url = match[3] || '/';
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
function makeHref(workspaceKey) {
  return (path) => {
    if (typeof path !== 'string' || !path.startsWith('/')) return path;
    if (UNSCOPED.test(path)) return path;
    return `/w/${workspaceKey}${path === '/' ? '' : path}`;
  };
}

function describe(assignment) {
  const school = assignment.school || null;
  return {
    id: assignment.id,
    // What goes in the URL. The same as the id for an ordinary post; an
    // administrator working inside an institution carries the school too.
    key: String(assignment.id),
    inEverySchool: false,
    role: assignment.role,
    label: assignment.label || null,
    schoolId: assignment.schoolId,
    schoolName: school ? school.name : null,
    territoryId: assignment.territoryId,
    territoryName: assignment.territory ? assignment.territory.name : null,
    // The district of the school this post is attached to, which is not the
    // same thing as the district the post is scoped to. A meta-mentor for
    // LT „Boris Dînga" names a school and no district; without this the
    // regional view has nothing to stand on. See activeTerritoryId.
    schoolTerritoryId: school ? school.territoryId : null,
    schoolTerritoryName: school && school.territory ? school.territory.name : null,
  };
}

/**
 * A universal post pointed at one institution.
 *
 * Derived rather than stored, so an administrator does not need an assignment
 * row per school — and a school added next month is reachable the moment it
 * exists, with nothing to remember to do.
 *
 * Note what is deliberately *not* narrowed: schoolTerritory stays null. An
 * administrator working inside one lyceum still reads every district, because
 * the school context is there to let them act, not to take away what they can
 * see. For a metamentor, whose post names a school precisely in order to scope
 * them, the opposite is true — see activeTerritoryId.
 */
function describeInSchool(assignment, school) {
  return {
    ...describe(assignment),
    key: `${assignment.id}s${school.id}`,
    inEverySchool: true,
    schoolId: school.id,
    schoolName: school.name,
    schoolTerritoryId: null,
    schoolTerritoryName: null,
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

  // Already loaded alongside the account — see loadAccount in
  // middleware/auth.js for why this isn't a second query.
  const assignments = req.accountAssignments || [];
  req.assignments = assignments;

  // A post that reaches every institution turns into one option per school in
  // the switcher and the picker. The query runs only for an account that has
  // such a post — in practice the two administrators — and returns twelve
  // rows on a pooled connection, so it costs nothing against the host's
  // connection budget (see src/config/db.js).
  const universal = assignments.filter(
    (a) => reachesEverySchool(capabilitiesFor(a.role, a.capabilities)));
  let schools = [];
  if (universal.length) {
    schools = await prisma.school.findMany({ orderBy: { name: 'asc' } });
  }
  req.everySchool = schools;

  res.locals.workspaces = assignments.map(describe).concat(
    universal.flatMap((a) => schools.map((s) => describeInSchool(a, s))));

  if (assignments.length === 0) {
    // An account with every assignment removed can still reach the public
    // tier, the display settings and logout — and is told why elsewhere.
    req.workspace = null;
    return next();
  }

  let active = null;
  if (req.requestedWorkspaceId) {
    active = assignments.find((a) => a.id === req.requestedWorkspaceId) || null;
    if (!active) {
      // Falling through to "some other post of theirs" would render one
      // institution's data under a URL naming another. The entire purpose of
      // putting the workspace in the URL is that a tab means exactly one
      // post, so an id that does not resolve has to stop here rather than
      // quietly become a different one.
      req.workspace = null;
      req.workspaceNotFound = true;
      return next();
    }
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

  // An administrator pointed at an institution. Checked here rather than
  // trusted from the URL: the suffix is only meaningful on a post that
  // actually reaches every school, so on any other post it is a 404 rather
  // than a quiet no-op that would leave the person looking at their own
  // school under a URL naming a different one.
  let inSchool = null;
  if (req.requestedSchoolId !== undefined) {
    const allowed = reachesEverySchool(capabilitiesFor(active.role, active.capabilities));
    inSchool = allowed
      ? schools.find((s) => s.id === req.requestedSchoolId) || null
      : null;
    if (!inSchool) {
      req.workspace = null;
      req.workspaceNotFound = true;
      return next();
    }
  }

  // The described shape, not the raw assignment row.
  //
  // These used to differ: req.workspace was the Prisma record while
  // res.locals.workspace was describe(active). Two things called "workspace"
  // with different fields is a trap, and it sprang — activeTerritoryId read a
  // field that only existed on the other one, so the district scope silently
  // resolved to null and every mentor saw every school. The raw row is still
  // available here as `active` for the capability lookup below, which is the
  // only thing that needs it.
  req.workspace = inSchool ? describeInSchool(active, inSchool) : describe(active);
  // Remembered only as the default for a *new* tab that arrives without a
  // prefix. It never overrides an explicit /w/<id>, so it cannot make one tab
  // hijack another.
  req.session.lastWorkspaceId = active.id;

  const capabilities = capabilitiesFor(active.role, active.capabilities);
  req.capabilities = capabilities;
  res.locals.capabilities = capabilities;
  res.locals.can = (capability) => capabilities.has(capability);
  res.locals.workspace = req.workspace;

  // Only prefix once there is genuinely more than one workspace to keep apart,
  // so a single-post account sees exactly the URLs it saw before. An
  // administrator always has more than one — their own post, and every
  // institution — and must keep the prefix, or the school they are working in
  // would be dropped from the very next link they follow.
  if (res.locals.workspaces.length > 1) res.locals.href = makeHref(req.workspace.key);
  next();
}

/**
 * For the handful of routes that need the school/territory the person is
 * currently acting for, rather than a column on their user record.
 */
function activeSchoolId(req) {
  return req.workspace ? req.workspace.schoolId : null;
}

/**
 * The district this request is working in, or null meaning "not limited to
 * one".
 *
 * Three cases, in order:
 *   the post names a district   a territorial authority: that district
 *   the post names a school     a meta-mentor: that school's district, so
 *                               the regional view shows the neighbourhood
 *                               they actually work in
 *   neither                     national: every district
 *
 * The third case used to be indistinguishable from the first, and callers
 * passed the null straight to Prisma, where `{ territoryId: null }` means
 * IS NULL rather than "no filter". Every meta-mentor and both administrators
 * were shown an empty list. Callers must now treat null as "no filter" —
 * territoryFilter() below does it for them.
 */
function activeTerritoryId(req) {
  if (!req.workspace) return null;
  if (req.workspace.territoryId) return req.workspace.territoryId;
  return req.workspace.schoolTerritoryId || null;
}

/** The Prisma `where` fragment for the active district, or {} for all. */
function territoryFilter(req) {
  const id = activeTerritoryId(req);
  return id === null ? {} : { territoryId: id };
}

/** Whether this request may read a school, given its district scope. */
function coversSchool(req, school) {
  if (!school) return false;
  const id = activeTerritoryId(req);
  return id === null || school.territoryId === id;
}

module.exports = {
  extractWorkspace, loadWorkspace, makeHref, activeSchoolId, activeTerritoryId,
  territoryFilter, coversSchool, describe, describeInSchool, WORKSPACE_PATH,
};
