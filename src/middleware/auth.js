const prisma = require('../config/db');
const { SCHOOL_ROLES, reachesEverySchool } = require('../services/capabilities');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

/**
 * Loads the signed-in *person* on every request: whether the account still
 * exists and is still active.
 *
 * Deliberately a query per authenticated request rather than a value cached
 * in the session. An admin deactivating an account has to take effect now,
 * not whenever that person next happens to log in — a session-cached flag
 * would leave a removed mentor working for as long as they keep the tab open.
 *
 * Permissions are *not* resolved here: they belong to the assignment the
 * person is currently acting under, which middleware/workspace.js works out
 * from the URL.
 */
async function loadAccount(req, res, next) {
  if (!req.session.user) return next();

  let account;
  try {
    // The posts are fetched here rather than in loadWorkspace so the two
    // middlewares cost one query between them, not two. This host caps the
    // database user at max_connections_per_hour, and a second round trip on
    // every authenticated request is real budget — see src/config/db.js.
    account = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      include: {
        assignments: {
          where: { isActive: true },
          // school.territory as well as the post's own territory: a
        // meta-mentor names a school and no district, and the regional view
        // needs somewhere to stand. One extra join on a query that already
        // runs, rather than another round trip against an hourly connection
        // budget — see src/config/db.js.
        include: { school: { include: { territory: true } }, territory: true, capabilities: true },
          orderBy: [{ role: 'asc' }, { id: 'asc' }],
        },
      },
    });
  } catch (err) {
    return next(err);
  }

  // The account was deleted, or deactivated, underneath a live session.
  if (!account || !account.isActive) {
    return req.session.destroy(() => res.redirect('/login?deactivated=1'));
  }

  // Keep the session copy in step with the record, so a rename shows up
  // without forcing the person to sign out and back in.
  req.session.user.name = account.name;
  req.session.user.mustChangePassword = account.mustChangePassword;
  // Re-read for the same reason as the password flag: an account whose
  // identity has been reset by an administrator must be asked again now,
  // not at its next sign-in.
  req.session.user.identityConfirmed = !!account.identityConfirmedAt;
  // Handed to loadWorkspace, which decides which of these is active.
  req.accountAssignments = account.assignments;
  next();
}

/**
 * Route guard. Passing several capabilities means "any of these" — used where
 * one page serves more than one legitimate reason to be there.
 */
function requireCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    const held = req.capabilities || new Set();
    if (!capabilities.some((c) => held.has(c))) {
      return res.status(403).render('error', {
        title: res.locals.t('err_access_denied'),
        message: res.locals.t('err_missing_capability'),
      });
    }
    next();
  };
}

/**
 * Checks the role of the assignment the person is *currently acting under* —
 * not a column on their user record, which no longer decides anything. Used
 * where the route genuinely depends on the kind of post: routes/school.js
 * reads the active school and is meaningless without one.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    const role = req.workspace ? req.workspace.role : null;
    if (!role || !roles.includes(role)) {
      return res.status(403).render('error', {
        title: res.locals.t('err_access_denied'),
        message: res.locals.t('err_wrong_role', {
          roles: roles.map((r) => res.locals.t('role_' + r)).join(', '),
          role: role ? res.locals.t('role_' + role) : '—',
        }),
      });
    }
    next();
  };
}

/**
 * The guard on the school's own workspace.
 *
 * Two kinds of post belong there. One of the school's own positions —
 * principal, deputy, mentor — which is what requireRole used to say on its
 * own. And an administrator, who holds no post at any school and every
 * authority over all of them; they pick the institution, and it arrives in the
 * URL (see middleware/workspace.js).
 *
 * Stated as its own guard rather than by widening requireRole, because the two
 * cases are different in kind: one is "this is my school", the other is "every
 * school is mine". A metamentor is in neither, and still cannot get in even if
 * an administrator hands them view.school — their job is to advise the school,
 * and a record the school did not write is not a self-assessment.
 */
function requireSchoolWorkspace(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  const role = req.workspace ? req.workspace.role : null;
  if (SCHOOL_ROLES.includes(role) || reachesEverySchool(req.capabilities)) return next();

  return res.status(403).render('error', {
    title: res.locals.t('err_access_denied'),
    message: res.locals.t('err_wrong_role', {
      roles: SCHOOL_ROLES.map((r) => res.locals.t('role_' + r)).join(', '),
      role: role ? res.locals.t('role_' + role) : '—',
    }),
  });
}

module.exports = {
  requireLogin, loadAccount, requireCapability, requireRole, requireSchoolWorkspace,
};
