const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { logAction } = require('../services/audit');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('auth/login', { title: 'Log in', error: null, layout: false });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { school: true, territory: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.render('auth/login', { title: 'Log in', error: res.locals.t('login_error'), layout: false });
  }
  req.session.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    schoolId: user.schoolId,
    schoolName: user.school ? user.school.name : null,
    territoryId: user.territoryId,
    territoryName: user.territory ? user.territory.name : null,
  };
  await logAction(user.id, 'LOGIN', 'User', user.id, null);
  const dest = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(dest);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
