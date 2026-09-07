const prisma = require('../config/db');
const { capabilitiesFor } = require('../services/capabilities');

function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

/**
 * Loads the signed-in account's live state on every request: whether it is
 * still active, and its effective capability set.
 *
 * Deliberately a query per authenticated request rather than a value cached
 * in the session. An admin revoking someone's access — or deactivating the
 * account outright — has to take effect now, not whenever that person next
 * happens to log in. Session-cached permissions would mean a removed mentor
 * keeps working access for as long as they keep the tab open.
 */
async function loadAccount(req, res, next) {
  res.locals.can = () => false;
  if (!req.session.user) return next();

  let account;
  try {
    account = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      include: { capabilities: true },
    });
  } catch (err) {
    return next(err);
  }

  // The account was deleted, or deactivated, underneath a live session.
  if (!account || !account.isActive) {
    return req.session.destroy(() => res.redirect('/login?deactivated=1'));
  }

  // Keep the session copy in step with the record, so a rename or a role
  // change shows up without forcing the person to sign out and back in.
  req.session.user.name = account.name;
  req.session.user.role = account.role;
  req.session.user.schoolId = account.schoolId;
  req.session.user.territoryId = account.territoryId;
  req.session.user.mustChangePassword = account.mustChangePassword;

  const capabilities = capabilitiesFor(account.role, account.capabilities);
  req.capabilities = capabilities;
  res.locals.capabilities = capabilities;
  res.locals.can = (capability) => capabilities.has(capability);
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
 * Kept for the places where the check really is about *which kind of account*
 * this is rather than what it may do — routes/school.js, for instance, reads
 * req.session.user.schoolId and is meaningless for an account with no school.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.session.returnTo = req.originalUrl;
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: res.locals.t('err_access_denied'),
        message: res.locals.t('err_wrong_role', { roles: roles.join(', '), role: req.session.user.role }),
      });
    }
    next();
  };
}

module.exports = { requireLogin, loadAccount, requireCapability, requireRole };
