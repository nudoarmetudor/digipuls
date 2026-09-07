const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const { generateTempPassword } = require('../utils/password');
const {
  CAPABILITIES, CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS, capabilitiesFor, overridesFrom,
} = require('../services/capabilities');

const router = express.Router();
router.use(requireCapability('admin.users'));

// Everything here is an administrative write against other people's accounts,
// so every route logs to the audit trail — including the reads that reveal a
// one-time password.

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || value === '' || value === 'none') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

async function formOptions() {
  const [schools, territories] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.territory.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return { schools, territories, roles: ROLES, capabilityGroups: CAPABILITY_GROUPS, roleDefaults: ROLE_DEFAULTS };
}

// --- list ------------------------------------------------------------------
router.get('/', async (req, res) => {
  const { role, q, status } = req.query;
  const where = {};
  if (ROLES.includes(role)) where.role = role;
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [{ name: { contains: term } }, { email: { contains: term } }];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    include: { school: true, territory: true, capabilities: true },
  });
  const total = await prisma.user.count();

  res.render('admin/users', {
    title: res.locals.t('admin_users_title'),
    wide: true,
    users: users.map((u) => ({
      ...u,
      effective: [...capabilitiesFor(u.role, u.capabilities)],
      customised: u.capabilities.length > 0,
    })),
    roles: ROLES,
    filteredCount: users.length,
    total,
    query: req.query,
  });
});

// --- new -------------------------------------------------------------------
router.get('/new', async (req, res) => {
  const options = await formOptions();
  res.render('admin/user-form', {
    title: res.locals.t('admin_user_new_title'),
    mode: 'new',
    user: null,
    selected: new Set(ROLE_DEFAULTS.META_MENTOR),
    errorMessage: null,
    ...options,
  });
});

router.post('/', async (req, res) => {
  const options = await formOptions();
  const { email, name, role } = req.body;
  const desired = asArray(req.body.capabilities);

  const fail = (messageKey) => res.status(400).render('admin/user-form', {
    title: res.locals.t('admin_user_new_title'),
    mode: 'new',
    user: { email, name, role, schoolId: parseIntOrNull(req.body.schoolId), territoryId: parseIntOrNull(req.body.territoryId) },
    selected: new Set(desired),
    errorMessage: res.locals.t(messageKey),
    ...options,
  });

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return fail('admin_user_err_email');
  if (!name || !name.trim()) return fail('admin_user_err_name');
  if (!ROLES.includes(role)) return fail('admin_user_err_role');

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) return fail('admin_user_err_duplicate');

  // Same rule as school provisioning: never a fixed or shared password. A
  // random one-time password is generated, shown to the admin exactly once,
  // and the account must replace it before it can reach anything else.
  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      mustChangePassword: true,
      schoolId: role === 'SCHOOL_TEAM' ? parseIntOrNull(req.body.schoolId) : null,
      territoryId: role === 'TERRITORIAL' ? parseIntOrNull(req.body.territoryId) : null,
      capabilities: { create: overridesFrom(role, desired) },
    },
  });

  await logAction(req.session.user.id, 'CREATE_USER', 'User', user.id, `${user.email} (${user.role})`);
  res.render('admin/user-created', {
    title: res.locals.t('admin_user_created_title'),
    user,
    tempPassword,
  });
});

// --- edit ------------------------------------------------------------------
router.get('/:id/edit', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    include: { capabilities: true, school: true, territory: true },
  });
  if (!user) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('admin_user_err_not_found') });

  const options = await formOptions();
  res.render('admin/user-form', {
    title: res.locals.t('admin_user_edit_title'),
    mode: 'edit',
    user,
    selected: capabilitiesFor(user.role, user.capabilities),
    errorMessage: null,
    ...options,
  });
});

router.post('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id }, include: { capabilities: true } });
  if (!user) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('admin_user_err_not_found') });

  const options = await formOptions();
  const { email, name, role } = req.body;
  const desired = asArray(req.body.capabilities);

  const fail = (messageKey) => res.status(400).render('admin/user-form', {
    title: res.locals.t('admin_user_edit_title'),
    mode: 'edit',
    user: { ...user, email, name, role },
    selected: new Set(desired),
    errorMessage: res.locals.t(messageKey),
    ...options,
  });

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return fail('admin_user_err_email');
  if (!name || !name.trim()) return fail('admin_user_err_name');
  if (!ROLES.includes(role)) return fail('admin_user_err_role');

  const normalisedEmail = email.trim().toLowerCase();
  const clash = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (clash && clash.id !== id) return fail('admin_user_err_duplicate');

  // An admin removing their own admin.users capability — or their own admin
  // role — would lock the last door behind them. Refuse rather than let the
  // instance end up with no way back in.
  const editingSelf = id === req.session.user.id;
  if (editingSelf) {
    const wouldKeepAdmin = capabilitiesFor(role, overridesFrom(role, desired)).has('admin.users');
    if (!wouldKeepAdmin) return fail('admin_user_err_self_lockout');
  }

  await prisma.$transaction([
    prisma.userCapability.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        email: normalisedEmail,
        name: name.trim(),
        role,
        schoolId: role === 'SCHOOL_TEAM' ? parseIntOrNull(req.body.schoolId) : null,
        territoryId: role === 'TERRITORIAL' ? parseIntOrNull(req.body.territoryId) : null,
        capabilities: { create: overridesFrom(role, desired) },
      },
    }),
  ]);

  await logAction(req.session.user.id, 'UPDATE_USER', 'User', id, `${normalisedEmail} (${role})`);
  res.redirect('/admin/users?updated=' + id);
});

// --- activate / deactivate -------------------------------------------------
router.post('/:id/active', async (req, res) => {
  const id = Number(req.params.id);
  const makeActive = req.body.active === 'true';
  if (id === req.session.user.id && !makeActive) {
    return res.status(400).render('error', {
      title: res.locals.t('err_access_denied'),
      message: res.locals.t('admin_user_err_self_deactivate'),
    });
  }
  await prisma.user.update({ where: { id }, data: { isActive: makeActive } });
  await logAction(req.session.user.id, makeActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'User', id, null);
  res.redirect('/admin/users');
});

// --- reset password --------------------------------------------------------
router.post('/:id/reset-password', async (req, res) => {
  const id = Number(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('admin_user_err_not_found') });

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
  });
  await logAction(req.session.user.id, 'RESET_USER_PASSWORD', 'User', id, user.email);
  res.render('admin/user-created', {
    title: res.locals.t('admin_user_reset_title'),
    user,
    tempPassword,
    wasReset: true,
  });
});

// --- delete ----------------------------------------------------------------
// Only offered when the account has left no trace worth keeping. Anything
// that has acted in the system is deactivated instead, so the audit trail and
// the "confirmed by" attribution on assessment cycles stay intact.
router.post('/:id/delete', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.user.id) {
    return res.status(400).render('error', {
      title: res.locals.t('err_access_denied'),
      message: res.locals.t('admin_user_err_self_delete'),
    });
  }
  const user = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { auditEntries: true, confirmedCycles: true, feedbackTickets: true } } },
  });
  if (!user) return res.status(404).render('error', { title: res.locals.t('err_not_found'), message: res.locals.t('admin_user_err_not_found') });

  const references = user._count.auditEntries + user._count.confirmedCycles + user._count.feedbackTickets;
  if (references > 0) {
    return res.status(400).render('error', {
      title: res.locals.t('admin_user_err_has_history_title'),
      message: res.locals.t('admin_user_err_has_history'),
    });
  }

  await prisma.user.delete({ where: { id } });
  await logAction(req.session.user.id, 'DELETE_USER', 'User', id, user.email);
  res.redirect('/admin/users');
});

module.exports = router;
module.exports.CAPABILITIES = CAPABILITIES;
