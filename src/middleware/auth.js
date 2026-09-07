const prisma = require('../config/db');

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
    account = await prisma.user.findUnique({ where: { id: req.session.user.id } });
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

module.exports = { requireLogin, loadAccount, requireCapability, requireRole };
