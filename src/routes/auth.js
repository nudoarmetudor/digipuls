const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { logAction } = require('../services/audit');
const { loginRateLimit, recordFailedAttempt, clearAttempts } = require('../middleware/loginRateLimit');
const { rotateToken } = require('../middleware/csrf');
const { safeRedirect } = require('../utils/safeRedirect');
const {
  nameProblem, normaliseName, suggestLogin, LOGIN_PATTERN,
} = require('../services/personalAccount');

// Compared against when no such account exists, so a miss costs the same
// ~100ms of bcrypt as a hit. Without it the response time answers "does this
// login exist?" for anyone who cares to ask, which against a directory of
// predictable handles is most of the work of an attack.
const ABSENT_ACCOUNT_HASH = bcrypt.hashSync('password-for-an-account-that-does-not-exist', 10);

const router = express.Router();

router.get('/login', (req, res) => {
  // loadAccount redirects here with ?deactivated=1 when a live session's
  // account has been switched off underneath it — otherwise the person is
  // bounced to the login screen with no explanation at all.
  const error = req.query.deactivated ? res.locals.t('login_deactivated') : null;
  res.render('auth/login', { title: res.locals.t('login_title'), error, layout: false });
});

router.post('/login', loginRateLimit, async (req, res) => {
  const { login, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { login: (login || '').trim().toLowerCase() },
    include: { school: true, territory: true },
  });
  const supplied = typeof password === 'string' ? password : '';
  // Both branches do the same bcrypt work; only one of them can succeed.
  const ok = user
    ? await bcrypt.compare(supplied, user.passwordHash)
    : await bcrypt.compare(supplied, ABSENT_ACCOUNT_HASH) && false;
  if (!ok) {
    recordFailedAttempt(req);
    return res.render('auth/login', { title: res.locals.t('login_title'), error: res.locals.t('login_error'), layout: false });
  }
  clearAttempts(req);

  // Read before regenerate(), which throws the whole session away. Reading it
  // afterwards — as this did — always found undefined, so being bounced to
  // the login screen from a deep link has been silently dropping people on
  // the home page ever since session regeneration was added.
  const returnTo = req.session.returnTo;

  // Regenerate the session on privilege change (login) rather than reusing
  // the pre-login session id — standard session-fixation hardening.
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: res.locals.t('err_login_failed'), message: res.locals.t('err_session_start') });
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      schoolName: user.school ? user.school.name : null,
      territoryId: user.territoryId,
      territoryName: user.territory ? user.territory.name : null,
      mustChangePassword: user.mustChangePassword,
      // Null until a named person has taken the account over. Checked in
      // app.js on every request, the same way the password change is.
      identityConfirmed: !!user.identityConfirmedAt,
    };
    // regenerate() threw the old session away, CSRF token included. Without
    // a fresh one every form on the next page would fail its check.
    rotateToken(req);
    const dest = safeRedirect(returnTo || '/');
    // The audit write must not decide whether the person gets in: log the
    // failure and continue, rather than leaving the request hanging with no
    // response, which is what an uncaught rejection here used to do.
    logAction(user.id, 'LOGIN', 'User', user.id, null, req.ip)
      .catch((err) => console.error('[audit] LOGIN write failed', err))
      .then(() => {
        if (user.mustChangePassword) return res.redirect('/change-password');
        return res.redirect(dest);
      });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Forced first-login password change for accounts provisioned with a
// system-generated one-time password (see admin.js) — nothing else is
// reachable until this is done (enforced in app.js's global middleware).
router.get('/change-password', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.render('auth/change-password', {
    title: res.locals.t('change_password_title'),
    error: null,
    // An account still on its issued one-time password is not asked for it
    // again — it was handed over by an administrator, so re-typing it proves
    // nothing, and someone who has thrown the slip away would be stuck.
    mustChange: !!req.session.user.mustChangePassword,
    layout: false,
  });
});

router.post('/change-password', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { currentPassword, newPassword, confirmPassword } = req.body;

  const fail = (key) => res.status(400).render('auth/change-password', {
    title: res.locals.t('change_password_title'),
    error: res.locals.t(key),
    mustChange: !!req.session.user.mustChangePassword,
    layout: false,
  });

  if (!newPassword || newPassword.length < 10 || newPassword !== confirmPassword) {
    return fail('change_password_error');
  }

  const account = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!account) return res.redirect('/login');

  // Knowing the current password is what makes this a password *change*
  // rather than a way for anyone holding the session — a borrowed laptop, a
  // stolen cookie, a forged cross-site POST — to take the account permanently.
  //
  // The one exception is an account still on its system-issued one-time
  // password: it is being forced through this screen precisely because that
  // password was handed over by an administrator, so demanding it again adds
  // no security and would strand anyone who had already discarded the slip.
  if (!account.mustChangePassword) {
    const supplied = typeof currentPassword === 'string' ? currentPassword : '';
    if (!(await bcrypt.compare(supplied, account.passwordHash))) {
      return fail('change_password_wrong_current');
    }
    if (await bcrypt.compare(newPassword, account.passwordHash)) {
      return fail('change_password_same');
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.session.user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  req.session.user.mustChangePassword = false;
  await logAction(req.session.user.id, 'PASSWORD_CHANGED', 'User', req.session.user.id, null);
  res.redirect('/');
});


// --- Claiming an account ----------------------------------------------------
//
// An account provisioned for a school but not yet worn by anybody. Until
// someone puts their own name on it, nothing else in the platform is
// reachable (the gate is in app.js, next to the password one).
//
// This exists because the pilot ran for its first weeks on twelve shared
// logins — one "Echipa digitală" account per school. Deleting them would have
// locked twelve schools out; renaming them for people would have meant
// inventing names for real directors. So the credential survives the change
// and the *person* completes it: the first to sign in says who they are, and
// the account becomes theirs.
//
// The handle is offered for replacement at the same time. A login like
// "zadnipru@digipuls.md" is the school's, not a person's, and left in place it
// would quietly outlive every director who ever used it.

function claimView(req, res, extra) {
  return {
    title: res.locals.t('claim_title'),
    layout: false,
    currentName: req.session.user.name,
    currentLogin: extra.currentLogin,
    suggestedLogin: extra.suggestedLogin,
    body: extra.body || {},
    error: extra.error || null,
  };
}

router.get('/claim-account', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const account = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!account) return res.redirect('/login');
  if (account.identityConfirmedAt) return res.redirect('/');
  return res.render('auth/claim-account', claimView(req, res, {
    currentLogin: account.login,
    suggestedLogin: null,
    body: { name: '', login: account.login },
  }));
});

router.post('/claim-account', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const account = await prisma.user.findUnique({ where: { id: req.session.user.id } });
  if (!account) return res.redirect('/login');
  if (account.identityConfirmedAt) return res.redirect('/');

  const name = normaliseName(req.body.name);
  const login = String(req.body.login || '').trim().toLowerCase();

  const fail = (key) => res.status(400).render('auth/claim-account', claimView(req, res, {
    currentLogin: account.login,
    suggestedLogin: suggestLogin(name),
    body: { name, login },
    error: res.locals.t(key),
  }));

  const problem = nameProblem(name);
  if (problem) return fail('claim_err_' + problem);
  if (!LOGIN_PATTERN.test(login)) return fail('claim_err_login');
  if (login !== account.login && await prisma.user.findUnique({ where: { login } })) {
    return fail('claim_err_login_taken');
  }

  await prisma.user.update({
    where: { id: account.id },
    data: { name, login, identityConfirmedAt: new Date() },
  });
  // Named after the account it replaces, so the audit trail shows which
  // shared login became whose. That link is the whole reason this screen is
  // worth having.
  await logAction(account.id, 'IDENTITY_CONFIRMED', 'User', account.id,
    `${account.login} -> ${login} (${name})`);

  req.session.user.name = name;
  req.session.user.identityConfirmed = true;

  // Shown rather than redirected past, because the handle they sign in with
  // may have just changed. Sending them straight to the dashboard would mean
  // the next time they came back they would have no idea what to type.
  return res.render('auth/claim-done', {
    title: res.locals.t('claim_done_title'),
    layout: false,
    name,
    login,
    loginChanged: login !== account.login,
  });
});

module.exports = router;
