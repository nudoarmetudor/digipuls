const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const { logAction } = require('../services/audit');
const { generateTempPassword } = require('../utils/password');
const {
  CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS, capabilitiesFor, overridesFrom, defaultsFor,
  canActOn, roleNeedsSchool, roleNeedsTerritory, roleAllowsSchool, roleAllowsTerritory,
} = require('../services/capabilities');

const router = express.Router();
// Reading and running accounts. Changing what a post may *do* needs
// admin.grant on top — see requireGrant below.
router.use(requireCapability('admin.users'));

// Deciding a post's role or capabilities is the privilege boundary, so it is
// gated separately from day-to-day account administration. Without this,
// anyone who could add a mentor could also add themselves an ADMIN post.
const requireGrant = requireCapability('admin.grant');

/**
 * A route parameter that must be a database id. Number('abc') is NaN, which
 * Prisma turns into a 500 rather than a 404 — an unhelpful answer that also
 * hands the visitor an internal error message.
 */
function idParam(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function notFound(res) {
  return res.status(404).render('error', {
    title: res.locals.t('err_not_found'),
    message: res.locals.t('admin_user_err_not_found'),
  });
}

/** Everything the target account can do, across all of its posts. */
function unionCapabilities(user) {
  const all = new Set();
  (user.assignments || [])
    .filter((a) => a.isActive)
    .forEach((a) => capabilitiesFor(a.role, a.capabilities).forEach((c) => all.add(c)));
  return all;
}

/**
 * Loads the target account and refuses if it can do anything the actor
 * cannot. Stops admin.users being a route to the administrator's account via
 * "reset their password, then read it off the screen".
 */
async function loadTarget(req, res) {
  const id = idParam(req.params.id);
  if (id === null) { notFound(res); return null; }
  const user = await prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
  if (!user) { notFound(res); return null; }
  if (!canActOn(req.capabilities || new Set(), unionCapabilities(user))) {
    res.status(403).render('error', {
      title: res.locals.t('err_access_denied'),
      message: res.locals.t('admin_user_err_more_privileged'),
    });
    return null;
  }
  return user;
}

// Everything here is an administrative write against other people's accounts,
// so every route logs to the audit trail — including the reads that reveal a
// one-time password.
//
// A person is an account plus a list of *assignments*: one role at one
// institution each. Elena is a meta-mentor for one lyceum and the DigiPuls
// coordinator for another from the same login, so the role and the
// institution live on the assignment, and permissions hang off the
// assignment rather than the person.

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// A login is a handle, not an address. The pilot's meta-mentors have no
// institutional mailbox, so requiring an email meant requiring something
// nobody has. The seeded demo accounts happen to look like addresses and
// remain valid: "@" is simply an allowed character, not a promise that
// anything will ever be delivered there.
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,63}$/;

// The only error keys this router will echo back onto a page.
const ALLOWED_ERRORS = new Set([
  'admin_user_err_login',
  'admin_user_err_name',
  'admin_user_err_role',
  'admin_user_err_duplicate',
  'admin_user_err_duplicate_post',
  'admin_user_err_school_required',
  'admin_user_err_territory_required',
  'admin_user_err_self_lockout',
  'admin_user_err_more_privileged',
]);

function normaliseLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidLogin(value) {
  return LOGIN_PATTERN.test(normaliseLogin(value));
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
  return {
    schools, territories, roles: ROLES, capabilityGroups: CAPABILITY_GROUPS,
    roleDefaults: ROLE_DEFAULTS,
    // The picker marks what a role grants as standard, which now includes
    // the baseline every role holds — not just that role's own list.
    defaultsFor,
  };
}

const USER_INCLUDE = {
  assignments: {
    include: { school: true, territory: true, capabilities: true },
    orderBy: [{ role: 'asc' }, { id: 'asc' }],
  },
};

/** The institution a post is scoped to, dropping anything the form sent for a
 *  kind this role can't take — a Ministry post has neither, and storing a
 *  stray school on one would make the duplicate check meaningless. */
function scopeFor(role, body) {
  return {
    schoolId: roleAllowsSchool(role) ? parseIntOrNull(body.schoolId) : null,
    territoryId: roleAllowsTerritory(role) ? parseIntOrNull(body.territoryId) : null,
  };
}

// --- list ------------------------------------------------------------------
router.get('/', async (req, res) => {
  const { role, q, status } = req.query;
  const where = {};
  if (status === 'active') where.isActive = true;
  if (status === 'inactive') where.isActive = false;
  if (ROLES.includes(role)) where.assignments = { some: { role } };
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [{ name: { contains: term } }, { login: { contains: term } }];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: USER_INCLUDE,
  });
  const total = await prisma.user.count();

  res.render('admin/users', {
    title: res.locals.t('admin_users_title'),
    wide: true,
    users: users.map((u) => ({
      ...u,
      posts: u.assignments.map((a) => ({
        id: a.id,
        role: a.role,
        label: a.label,
        institution: a.school ? a.school.name : (a.territory ? a.territory.name : null),
        capabilityCount: capabilitiesFor(a.role, a.capabilities).size,
        customised: a.capabilities.length > 0,
        isActive: a.isActive,
      })),
    })),
    roles: ROLES,
    filteredCount: users.length,
    total,
    query: req.query,
  });
});

// --- new account -----------------------------------------------------------
router.get('/new', requireGrant, async (req, res) => {
  const options = await formOptions();
  res.render('admin/user-form', {
    title: res.locals.t('admin_user_new_title'),
    mode: 'new',
    user: null,
    posts: [],
    errorMessage: null,
    ...options,
  });
});

router.post('/', requireGrant, async (req, res) => {
  const options = await formOptions();
  const { login, name, role } = req.body;
  const desired = asArray(req.body.capabilities);

  const fail = (messageKey) => res.status(400).render('admin/user-form', {
    title: res.locals.t('admin_user_new_title'),
    mode: 'new',
    user: { login, name },
    posts: [],
    firstRole: role,
    firstSelected: new Set(desired),
    errorMessage: res.locals.t(messageKey),
    ...options,
  });

  if (!isValidLogin(login)) return fail('admin_user_err_login');
  if (!name || !name.trim()) return fail('admin_user_err_name');
  if (!ROLES.includes(role)) return fail('admin_user_err_role');

  const existing = await prisma.user.findUnique({ where: { login: normaliseLogin(login) } });
  if (existing) return fail('admin_user_err_duplicate');

  const scope = scopeFor(role, req.body);
  if (roleNeedsSchool(role) && !scope.schoolId) return fail('admin_user_err_school_required');
  if (roleNeedsTerritory(role) && !scope.territoryId) return fail('admin_user_err_territory_required');

  // You cannot create an account more capable than your own — otherwise
  // "create an ADMIN, then log in as it" is the escalation that splitting
  // admin.grant out was meant to close.
  if (!canActOn(req.capabilities || new Set(), capabilitiesFor(role, overridesFrom(role, desired)))) {
    return fail('admin_user_err_more_privileged');
  }

  // Same rule as school provisioning: never a fixed or shared password. A
  // random one-time password is generated, shown to the admin exactly once,
  // and the account must replace it before it can reach anything else.
  const tempPassword = generateTempPassword();
  const user = await prisma.user.create({
    data: {
      login: normaliseLogin(login),
      name: name.trim(),
      // Legacy mirror of the first post — no longer read by anything, kept
      // until the follow-up migration drops these columns.
      role,
      schoolId: scope.schoolId,
      territoryId: scope.territoryId,
      passwordHash: await bcrypt.hash(tempPassword, 10),
      mustChangePassword: true,
      assignments: {
        create: [{
          role,
          ...scope,
          label: (req.body.label || '').trim() || null,
          capabilities: { create: overridesFrom(role, desired) },
        }],
      },
    },
  });

  await logAction(req.session.user.id, 'CREATE_USER', 'User', user.id, `${user.login} (${role})`);
  res.render('admin/user-created', {
    title: res.locals.t('admin_user_created_title'),
    user,
    tempPassword,
  });
});

// --- edit account ----------------------------------------------------------
router.get('/:id/edit', async (req, res) => {
  const user = await loadTarget(req, res);
  if (!user) return undefined;

  const options = await formOptions();
  res.render('admin/user-form', {
    title: res.locals.t('admin_user_edit_title'),
    mode: 'edit',
    user,
    posts: user.assignments.map((a) => ({
      ...a,
      selected: capabilitiesFor(a.role, a.capabilities),
      institution: a.school ? a.school.name : (a.territory ? a.territory.name : null),
    })),
    // Only keys this router itself produces. t() falls back to returning the
    // key verbatim, so echoing an arbitrary query value would let anyone put
    // their own words on an administrator's screen.
    errorMessage: ALLOWED_ERRORS.has(req.query.error) ? res.locals.t(req.query.error) : null,
    ...options,
  });
});

router.post('/:id', async (req, res) => {
  const user = await loadTarget(req, res);
  if (!user) return undefined;
  const id = user.id;

  const { login, name } = req.body;
  if (!isValidLogin(login)) {
    return res.redirect(res.locals.href(`/admin/users/${id}/edit?error=admin_user_err_login`));
  }
  if (!name || !name.trim()) return res.redirect(res.locals.href(`/admin/users/${id}/edit?error=admin_user_err_name`));

  const normalised = normaliseLogin(login);
  const clash = await prisma.user.findUnique({ where: { login: normalised } });
  if (clash && clash.id !== id) return res.redirect(res.locals.href(`/admin/users/${id}/edit?error=admin_user_err_duplicate`));

  await prisma.user.update({ where: { id }, data: { login: normalised, name: name.trim() } });
  await logAction(req.session.user.id, 'UPDATE_USER', 'User', id, normalised);
  res.redirect(res.locals.href(`/admin/users/${id}/edit`));
});

// --- assignments -----------------------------------------------------------
router.post('/:id/assignments', requireGrant, async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return undefined;
  const userId = target.id;
  const { role } = req.body;
  const back = `/admin/users/${userId}/edit`;
  if (!ROLES.includes(role)) return res.redirect(res.locals.href(`${back}?error=admin_user_err_role`));

  const scope = scopeFor(role, req.body);
  if (roleNeedsSchool(role) && !scope.schoolId) return res.redirect(res.locals.href(`${back}?error=admin_user_err_school_required`));
  if (roleNeedsTerritory(role) && !scope.territoryId) return res.redirect(res.locals.href(`${back}?error=admin_user_err_territory_required`));

  // The new post may not exceed what the granter holds.
  if (!canActOn(req.capabilities || new Set(), capabilitiesFor(role, []))) {
    return res.redirect(res.locals.href(`${back}?error=admin_user_err_more_privileged`));
  }

  // MySQL treats NULLs as distinct in a unique index, so the unscoped posts
  // (Ministry, Admin) need the duplicate check here rather than in the schema.
  //
  // The label counts as part of what makes a post distinct. Two unscoped posts
  // of the same role are a duplicate only when they are also called the same
  // thing: someone who coordinates the mentors *and* wants to see the platform
  // as an ordinary mentor sees it holds two meta-mentor posts that differ in
  // nothing but their name and what they may do. Without the label in this
  // check that arrangement could exist in the database but could never be
  // created through this screen.
  const label = (req.body.label || '').trim() || null;
  const duplicate = await prisma.assignment.findFirst({
    where: { userId, role, schoolId: scope.schoolId, territoryId: scope.territoryId, label },
  });
  if (duplicate) return res.redirect(res.locals.href(`${back}?error=admin_user_err_duplicate_post`));

  const assignment = await prisma.assignment.create({
    data: {
      userId,
      role,
      ...scope,
      label,
      capabilities: { create: overridesFrom(role, ROLE_DEFAULTS[role] || []) },
    },
  });
  await logAction(req.session.user.id, 'ADD_ASSIGNMENT', 'Assignment', assignment.id, `user ${userId}: ${role}`);
  res.redirect(back);
});

router.post('/:id/assignments/:assignmentId', requireGrant, async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return undefined;
  const userId = target.id;
  const assignmentId = idParam(req.params.assignmentId);
  const back = `/admin/users/${userId}/edit`;

  const assignment = assignmentId === null
    ? null
    : target.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return notFound(res);

  const desired = asArray(req.body.capabilities);
  const wanted = capabilitiesFor(assignment.role, overridesFrom(assignment.role, desired));

  // You cannot hand out more than you hold.
  if (!canActOn(req.capabilities || new Set(), wanted)) {
    return res.redirect(res.locals.href(`${back}?error=admin_user_err_more_privileged`));
  }

  // Editing your own post so that you can no longer administer accounts locks
  // the door from the inside. Checked against the capability rather than the
  // ADMIN role: the pilot's coordinators administer accounts from a
  // META_MENTOR post, and the old role test never covered them.
  if (userId === req.session.user.id) {
    const others = target.assignments
      .filter((a) => a.id !== assignmentId && a.isActive)
      .some((a) => capabilitiesFor(a.role, a.capabilities).has('admin.users'));
    const staysActive = req.body.isActive !== 'false';
    if (!others && !(staysActive && wanted.has('admin.users'))) {
      return res.redirect(res.locals.href(`${back}?error=admin_user_err_self_lockout`));
    }
  }

  await prisma.$transaction([
    prisma.assignmentCapability.deleteMany({ where: { assignmentId } }),
    prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        label: (req.body.label || '').trim() || null,
        isActive: req.body.isActive !== 'false',
        capabilities: { create: overridesFrom(assignment.role, desired) },
      },
    }),
  ]);
  await logAction(req.session.user.id, 'UPDATE_ASSIGNMENT', 'Assignment', assignmentId, assignment.role);
  res.redirect(back);
});

router.post('/:id/assignments/:assignmentId/delete', requireGrant, async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return undefined;
  const userId = target.id;
  const assignmentId = idParam(req.params.assignmentId);
  const back = `/admin/users/${userId}/edit`;

  const assignment = assignmentId === null
    ? null
    : target.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return notFound(res);

  // Same lockout rule as editing: not "is this an ADMIN post" but "does this
  // leave me able to get back in".
  if (userId === req.session.user.id) {
    const others = target.assignments
      .filter((a) => a.id !== assignmentId && a.isActive)
      .some((a) => capabilitiesFor(a.role, a.capabilities).has('admin.users'));
    if (!others) return res.redirect(res.locals.href(`${back}?error=admin_user_err_self_lockout`));
  }

  await prisma.assignment.delete({ where: { id: assignmentId } });
  await logAction(req.session.user.id, 'REMOVE_ASSIGNMENT', 'Assignment', assignmentId, `user ${userId}: ${assignment.role}`);
  res.redirect(back);
});

// --- activate / deactivate the whole account -------------------------------
router.post('/:id/active', async (req, res) => {
  const target = await loadTarget(req, res);
  if (!target) return undefined;
  const id = target.id;
  const makeActive = req.body.active === 'true';
  if (id === req.session.user.id && !makeActive) {
    return res.status(400).render('error', {
      title: res.locals.t('err_access_denied'),
      message: res.locals.t('admin_user_err_self_deactivate'),
    });
  }
  await prisma.user.update({ where: { id }, data: { isActive: makeActive } });
  await logAction(req.session.user.id, makeActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'User', id, null);
  res.redirect(res.locals.href('/admin/users'));
});

// --- reset password --------------------------------------------------------
// Issuing a new one-time password is the most dangerous thing admin.users
// can do, because the new password is shown to the person doing it. loadTarget
// is what stops it being aimed upwards at a more privileged account.
router.post('/:id/reset-password', async (req, res) => {
  const user = await loadTarget(req, res);
  if (!user) return undefined;
  const id = user.id;

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
  });
  await logAction(req.session.user.id, 'RESET_USER_PASSWORD', 'User', id, user.login);
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
router.post('/:id/delete', requireGrant, async (req, res) => {
  const loaded = await loadTarget(req, res);
  if (!loaded) return undefined;
  const id = loaded.id;
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
  if (!user) return notFound(res);

  const references = user._count.auditEntries + user._count.confirmedCycles + user._count.feedbackTickets;
  if (references > 0) {
    return res.status(400).render('error', {
      title: res.locals.t('admin_user_err_has_history_title'),
      message: res.locals.t('admin_user_err_has_history'),
    });
  }

  await prisma.user.delete({ where: { id } });
  await logAction(req.session.user.id, 'DELETE_USER', 'User', id, user.login);
  res.redirect(res.locals.href('/admin/users'));
});

module.exports = router;
