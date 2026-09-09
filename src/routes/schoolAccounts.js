// A school managing its own mentor accounts.
//
// A school fields five or six mentors, and the people who know who they are
// sit in the school rather than in the ministry. So the principal and the
// deputy principal can provision them directly, without an administrator in
// the loop.
//
// The power is bounded on three sides, and every bound is enforced here rather
// than only hidden in the interface:
//
//   position   Only SCHOOL_MENTOR. A principal cannot create another
//              principal, a deputy, a metamentor, or anything in the oversight
//              line — so this cannot be used to climb.
//   school     Taken from the creator's own active post. It is not a field on
//              the form, so it cannot be pointed at another school.
//   reach      Every write re-loads the target and refuses unless it is a
//              mentor of this school. An id typed into the URL reaches
//              nothing else.
//
// Provisioning follows the same rule as everywhere else in the platform: a
// generated one-time password, shown once, which the account must replace at
// first login.

const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { requireRole, requireCapability } = require('../middleware/auth');
const { activeSchoolId } = require('../middleware/workspace');
const { logAction } = require('../services/audit');
const { generateTempPassword } = require('../utils/password');
const {
  SCHOOL_ROLES, ROLE_DEFAULTS, overridesFrom, capabilitiesFor,
} = require('../services/capabilities');

const router = express.Router();
router.use(requireRole(...SCHOOL_ROLES), requireCapability('school.accounts'));

/**
 * The school this post belongs to. Mounted separately from routes/school.js,
 * so it loads its own rather than relying on that router's middleware having
 * run — which it has not.
 */
async function loadSchool(req, res, next) {
  const id = activeSchoolId(req);
  if (!Number.isInteger(id)) {
    return res.status(409).render('error', {
      title: res.locals.t('school_missing_title'),
      message: res.locals.t('school_missing_detail'),
    });
  }
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) {
    return res.status(409).render('error', {
      title: res.locals.t('school_missing_title'),
      message: res.locals.t('school_missing_detail'),
    });
  }
  req.school = school;
  return next();
}

router.use(loadSchool);

// The one position a school may create. Named once so the rule cannot drift
// between the form, the create route and the checks.
const GRANTABLE_ROLE = 'SCHOOL_MENTOR';

// Same shape as the platform's own account screen: a handle, not an address.
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,63}$/;

const ALLOWED_ERRORS = new Set([
  'school_acct_err_login',
  'school_acct_err_name',
  'school_acct_err_duplicate',
  'school_acct_err_not_found',
  'school_acct_err_self',
]);

function normaliseLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function idParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The school this request acts for, or null when the post names none. */
function schoolId(req) {
  const id = activeSchoolId(req);
  return Number.isInteger(id) ? id : null;
}

/**
 * Loads a person this school may administer: someone holding an active mentor
 * post at this school, and nobody else. A principal is deliberately out of
 * reach — colleagues of equal standing do not reset each other's passwords
 * from here, and the platform's administrators exist for that.
 */
async function loadMentor(req, res) {
  const id = idParam(req.params.id);
  const school = schoolId(req);
  if (id === null || school === null) return notFound(res);

  const user = await prisma.user.findUnique({
    where: { id },
    include: { assignments: { include: { school: true } } },
  });
  const isOurMentor = user && user.assignments.some(
    (a) => a.isActive && a.role === GRANTABLE_ROLE && a.schoolId === school);
  if (!isOurMentor) return notFound(res);
  return user;
}

function notFound(res) {
  res.status(404).render('error', {
    title: res.locals.t('err_not_found'),
    message: res.locals.t('school_acct_err_not_found'),
  });
  return null;
}

function back(res, error) {
  return res.redirect(res.locals.href('/school/accounts' + (error ? `?error=${error}` : '')));
}

// --- list -------------------------------------------------------------------
router.get('/', async (req, res) => {
  const school = schoolId(req);
  if (school === null) return notFound(res);

  const posts = await prisma.assignment.findMany({
    where: { schoolId: school, role: { in: SCHOOL_ROLES } },
    include: { user: true },
    orderBy: [{ role: 'asc' }, { id: 'asc' }],
  });

  return res.render('school/accounts', {
    title: res.locals.t('school_acct_title'),
    wide: true,
    school: req.school,
    people: posts.map((p) => ({
      id: p.user.id,
      postId: p.id,
      name: p.user.name,
      login: p.user.login,
      role: p.role,
      isActive: p.user.isActive && p.isActive,
      mustChangePassword: p.user.mustChangePassword,
      // A principal can only act on mentors — see loadMentor.
      manageable: p.role === GRANTABLE_ROLE,
      isSelf: p.user.id === req.session.user.id,
      capabilityCount: capabilitiesFor(p.role, []).size,
    })),
    grantableRole: GRANTABLE_ROLE,
    errorMessage: ALLOWED_ERRORS.has(req.query.error) ? res.locals.t(req.query.error) : null,
  });
});

// --- create -----------------------------------------------------------------
router.get('/new', (req, res) => res.render('school/account-form', {
  title: res.locals.t('school_acct_new'),
  school: req.school,
  grantableRole: GRANTABLE_ROLE,
  body: {},
  errorMessage: null,
}));

router.post('/', async (req, res) => {
  const school = schoolId(req);
  if (school === null) return notFound(res);

  const login = normaliseLogin(req.body.login);
  const name = String(req.body.name || '').trim();

  const fail = (key) => res.status(400).render('school/account-form', {
    title: res.locals.t('school_acct_new'),
    school: req.school,
    grantableRole: GRANTABLE_ROLE,
    body: { login: req.body.login, name },
    errorMessage: res.locals.t(key),
  });

  if (!LOGIN_PATTERN.test(login)) return fail('school_acct_err_login');
  if (!name) return fail('school_acct_err_name');
  if (await prisma.user.findUnique({ where: { login } })) return fail('school_acct_err_duplicate');

  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      login,
      name,
      // Not read from the form. The position and the school are both decided
      // here, from the creator's own post, so neither can be pointed
      // somewhere else by editing the request.
      role: GRANTABLE_ROLE,
      schoolId: school,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      mustChangePassword: true,
      assignments: {
        create: [{
          role: GRANTABLE_ROLE,
          schoolId: school,
          capabilities: { create: overridesFrom(GRANTABLE_ROLE, ROLE_DEFAULTS[GRANTABLE_ROLE]) },
        }],
      },
    },
  });

  await logAction(req.session.user.id, 'SCHOOL_CREATE_ACCOUNT', 'User', user.id,
    `${login} (${GRANTABLE_ROLE}) at ${req.school.name}`);

  return res.render('school/account-created', {
    title: res.locals.t('school_acct_created'),
    school: req.school,
    user,
    tempPassword,
  });
});

// --- rename -----------------------------------------------------------------
router.post('/:id', async (req, res) => {
  const user = await loadMentor(req, res);
  if (!user) return undefined;

  const name = String(req.body.name || '').trim();
  if (!name) return back(res, 'school_acct_err_name');

  await prisma.user.update({ where: { id: user.id }, data: { name } });
  await logAction(req.session.user.id, 'SCHOOL_UPDATE_ACCOUNT', 'User', user.id, name);
  return back(res);
});

// --- reissue a one-time password --------------------------------------------
router.post('/:id/reset-password', async (req, res) => {
  const user = await loadMentor(req, res);
  if (!user) return undefined;

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
  });
  await logAction(req.session.user.id, 'SCHOOL_RESET_PASSWORD', 'User', user.id, user.login);

  return res.render('school/account-created', {
    title: res.locals.t('school_acct_reset'),
    school: req.school,
    user,
    tempPassword,
    wasReset: true,
  });
});

// --- switch on and off ------------------------------------------------------
router.post('/:id/active', async (req, res) => {
  const user = await loadMentor(req, res);
  if (!user) return undefined;
  // A principal has no mentor post, so this cannot be self-inflicted — but the
  // check costs nothing and the rule should not depend on that staying true.
  if (user.id === req.session.user.id) return back(res, 'school_acct_err_self');

  const makeActive = req.body.active === 'true';
  await prisma.user.update({ where: { id: user.id }, data: { isActive: makeActive } });
  await logAction(req.session.user.id,
    makeActive ? 'SCHOOL_ACTIVATE_ACCOUNT' : 'SCHOOL_DEACTIVATE_ACCOUNT',
    'User', user.id, user.login);
  return back(res);
});

module.exports = router;
