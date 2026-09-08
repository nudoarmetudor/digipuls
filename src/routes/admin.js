const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { requireCapability } = require('../middleware/auth');
const simeService = require('../services/sime/simeService');
const { bandFor } = require('../data/order675');
const { logAction } = require('../services/audit');
const { generateTempPassword } = require('../utils/password');
const { ROLE_DEFAULTS, overridesFrom } = require('../services/capabilities');

// Same rule as the account screen. Applied here too, because a school-team
// login created down this path is a real credential and "whatever the form
// sent" is not a specification.
const LOGIN_PATTERN = /^[a-z0-9][a-z0-9._@-]{2,63}$/;

const router = express.Router();
router.use(requireCapability('admin.schools', 'admin.users', 'admin.audit'));

router.get('/', (req, res) => {
  if (res.locals.can('admin.users')) return res.redirect(res.locals.href('/admin/users'));
  if (res.locals.can('admin.schools')) return res.redirect(res.locals.href('/admin/schools/new'));
  return res.redirect(res.locals.href('/admin/audit-log'));
});

// JSON endpoint backing the SIME autocomplete field on the "add school"
// form — see services/sime/simeService.js for the pluggable provider seam
// this calls into (mock today, a real SIME API integration later).
router.get('/sime/search', requireCapability('admin.schools'), async (req, res) => {
  const results = await simeService.searchSchools(req.query.q || '');
  res.json(results);
});

router.get('/schools/new', requireCapability('admin.schools'), async (req, res) => {
  const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });
  res.render('admin/school-new', {
    title: res.locals.t('admin_add_title'), wide: true, territories,
    errorMessage: null, body: {},
  });
});

router.post('/schools', requireCapability('admin.schools'), async (req, res) => {
  const { simeId, name, address, territoryId, enrolmentTotal, studentsGrades7to12, classroomsTotal, teamLogin, teamName } = req.body;

  const fail = async (messageKey) => {
    const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });
    return res.status(400).render('admin/school-new', {
      title: res.locals.t('admin_add_title'), wide: true, territories,
      errorMessage: res.locals.t(messageKey), body: req.body,
    });
  };

  if (!name || !name.trim()) return fail('admin_school_err_name');

  // Resolving the territory.
  //
  // The previous version passed `{ name: undefined }` to findFirst when the
  // form sent no territory name. Prisma drops undefined keys, so the filter
  // became "no filter" and the query returned whichever territory happened to
  // be first in the table — quietly filing a school under a district it has
  // nothing to do with. An unnamed territory is now a validation error.
  const chosenId = territoryId && territoryId !== 'new' ? Number(territoryId) : null;
  let territoryIdFinal;
  if (chosenId !== null) {
    if (!Number.isInteger(chosenId)) return fail('admin_school_err_territory');
    const exists = await prisma.territory.findUnique({ where: { id: chosenId } });
    if (!exists) return fail('admin_school_err_territory');
    territoryIdFinal = exists.id;
  } else {
    const newName = (req.body.territoryName || '').trim();
    if (!newName) return fail('admin_school_err_territory');
    const existing = await prisma.territory.findFirst({ where: { name: newName } });
    territoryIdFinal = existing
      ? existing.id
      : (await prisma.territory.create({ data: { name: newName } })).id;
  }

  let teamAccountLogin = null;
  if (teamLogin) {
    teamAccountLogin = String(teamLogin).trim().toLowerCase();
    if (!LOGIN_PATTERN.test(teamAccountLogin)) return fail('admin_school_err_login');
    const clash = await prisma.user.findUnique({ where: { login: teamAccountLogin } });
    // Checked before anything is written. Discovering it afterwards used to
    // throw between the two creates, leaving a school row with no team and no
    // explanation.
    if (clash) return fail('admin_school_err_duplicate_login');
  }

  const enrolment = Number(enrolmentTotal) || 0;

  // A real school account never gets a fixed or shared password: a random
  // one-time password is generated, shown to the admin exactly once here, and
  // the account is forced to replace it on first login (mustChangePassword,
  // enforced in app.js).
  const tempPassword = teamAccountLogin ? generateTempPassword() : null;
  const passwordHash = tempPassword ? await bcrypt.hash(tempPassword, 10) : null;

  // One transaction: a school with no team, or a team with no school, is
  // worse than neither. The previous version created them in sequence, so any
  // failure on the second left an orphaned school behind.
  const school = await prisma.$transaction(async (tx) => {
    const created = await tx.school.create({
      data: {
        simeId: simeId || null,
        name: name.trim(),
        address: address || null,
        territoryId: territoryIdFinal,
        enrolmentTotal: enrolment,
        studentsGrades7to12: Number(studentsGrades7to12) || 0,
        classroomsTotal: Number(classroomsTotal) || 0,
        enrolmentBand: bandFor(enrolment),
      },
    });

    if (teamAccountLogin) {
      await tx.user.create({
        data: {
          login: teamAccountLogin,
          passwordHash,
          name: teamName || `Echipa digitală — ${created.name}`,
          role: 'SCHOOL_TEAM',
          schoolId: created.id,
          mustChangePassword: true,
          // The post is what actually carries permissions — see
          // middleware/workspace.js. Creating the account without one used to
          // produce a login that worked and then could do nothing at all,
          // landing on "an admin has not given you a post yet". Every school
          // provisioned through this form was arriving broken.
          assignments: {
            create: [{
              role: 'SCHOOL_TEAM',
              schoolId: created.id,
              capabilities: { create: overridesFrom('SCHOOL_TEAM', ROLE_DEFAULTS.SCHOOL_TEAM) },
            }],
          },
        },
      });
    }
    return created;
  });

  await logAction(req.session.user.id, 'PROVISION_SCHOOL', 'School', school.id, simeId ? `from SIME ${simeId}` : 'manual entry');
  res.render('admin/school-created', {
    title: res.locals.t('admin_created_title'), wide: true, school, teamAccountLogin, tempPassword,
  });
});

router.get('/audit-log', requireCapability('admin.audit'), async (req, res) => {
  const entries = await prisma.auditLogEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: true } });
  res.render('admin/audit-log', { title: res.locals.t('audit_title'), wide: true, entries });
});

module.exports = router;
