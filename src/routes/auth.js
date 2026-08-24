const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { logAction } = require('../services/audit');
const { loginRateLimit, recordFailedAttempt, clearAttempts } = require('../middleware/loginRateLimit');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Log in', error: null, layout: false });
});

router.post('/login', loginRateLimit, async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { school: true, territory: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordFailedAttempt(req);
    return res.render('auth/login', { title: 'Log in', error: res.locals.t('login_error'), layout: false });
  }
  clearAttempts(req);
  // Regenerate the session on privilege change (login) rather than reusing
  // the pre-login session id — standard session-fixation hardening.
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { title: 'Login failed', message: 'Could not start a session.' });
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      schoolId: user.schoolId,
      schoolName: user.school ? user.school.name : null,
      territoryId: user.territoryId,
      territoryName: user.territory ? user.territory.name : null,
      mustChangePassword: user.mustChangePassword,
    };
    logAction(user.id, 'LOGIN', 'User', user.id, null).then(() => {
      if (user.mustChangePassword) return res.redirect('/change-password');
      const dest = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(dest);
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
  res.render('auth/change-password', { title: 'Set a new password', error: null, layout: false });
});

router.post('/change-password', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const { newPassword, confirmPassword } = req.body;
  if (!newPassword || newPassword.length < 10 || newPassword !== confirmPassword) {
    return res.render('auth/change-password', {
      title: 'Set a new password',
      error: res.locals.t('change_password_error'),
      layout: false,
    });
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

module.exports = router;
