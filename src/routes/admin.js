const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { requireRole } = require('../middleware/auth');
const simeService = require('../services/sime/simeService');
const { bandFor } = require('../data/order675');
const { logAction } = require('../services/audit');
const { generateTempPassword } = require('../utils/password');

const router = express.Router();
router.use(requireRole('ADMIN'));

router.get('/', (req, res) => res.redirect('/admin/schools/new'));

// JSON endpoint backing the SIME autocomplete field on the "add school"
// form — see services/sime/simeService.js for the pluggable provider seam
// this calls into (mock today, a real SIME API integration later).
router.get('/sime/search', async (req, res) => {
  const results = await simeService.searchSchools(req.query.q || '');
  res.json(results);
});

router.get('/schools/new', async (req, res) => {
  const territories = await prisma.territory.findMany({ orderBy: { name: 'asc' } });
  res.render('admin/school-new', { title: 'Add school (SIME lookup)', wide: true, territories });
});

router.post('/schools', async (req, res) => {
  const { simeId, name, address, territoryId, enrolmentTotal, studentsGrades7to12, classroomsTotal, teamEmail, teamName } = req.body;

  let territory = await prisma.territory.findFirst({ where: { name: req.body.territoryName || undefined } });
  const territoryIdFinal = territoryId && territoryId !== 'new'
    ? Number(territoryId)
    : territory
      ? territory.id
      : (await prisma.territory.create({ data: { name: req.body.territoryName || 'Unassigned' } })).id;

  const enrolment = Number(enrolmentTotal) || 0;
  const school = await prisma.school.create({
    data: {
      simeId: simeId || null,
      name,
      address: address || null,
      territoryId: territoryIdFinal,
      enrolmentTotal: enrolment,
      studentsGrades7to12: Number(studentsGrades7to12) || 0,
      classroomsTotal: Number(classroomsTotal) || 0,
      enrolmentBand: bandFor(enrolment),
    },
  });

  let tempPassword = null;
  let teamAccountEmail = null;
  if (teamEmail) {
    // A real school account never gets a fixed/shared password — a random
    // one-time password is generated and shown to the admin exactly once
    // here; the account is forced to set its own password on first login
    // (see mustChangePassword, enforced in app.js).
    tempPassword = generateTempPassword();
    teamAccountEmail = teamEmail;
    await prisma.user.create({
      data: {
        email: teamEmail,
        passwordHash: await bcrypt.hash(tempPassword, 10),
        name: teamName || `Echipa digitală — ${name}`,
        role: 'SCHOOL_TEAM',
        schoolId: school.id,
        mustChangePassword: true,
      },
    });
  }

  await logAction(req.session.user.id, 'PROVISION_SCHOOL', 'School', school.id, simeId ? `from SIME ${simeId}` : 'manual entry');
  res.render('admin/school-created', {
    title: 'School created', wide: true, school, teamAccountEmail, tempPassword,
  });
});

router.get('/audit-log', async (req, res) => {
  const entries = await prisma.auditLogEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { user: true } });
  res.render('admin/audit-log', { title: 'Audit log', wide: true, entries });
});

module.exports = router;
