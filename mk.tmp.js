// A throwaway account with the same shape as the one that hit the 500:
// an ADMIN post, a mentor post attached to a school, and a plain mentor post.
const APP = 'C:/Users/user/Documents/MDSF/12_DigiPuls_App';
const bcrypt = require(APP + '/node_modules/bcryptjs');
const prisma = require(APP + '/src/config/db');
const { ROLE_DEFAULTS, overridesFrom } = require(APP + '/src/services/capabilities');
const LOGIN = 'zz.threepost'; const PASSWORD = 'ThreePost-2026-Delete';

(async () => {
  if (process.argv[2] === 'remove') {
    const u = await prisma.user.findUnique({ where: { login: LOGIN } });
    if (!u) return console.log('nothing to remove');
    await prisma.auditLogEntry.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
    return console.log('removed ' + LOGIN);
  }
  const school = await prisma.school.findFirst({ orderBy: { id: 'asc' } });
  await prisma.user.deleteMany({ where: { login: LOGIN } });
  const u = await prisma.user.create({
    data: {
      login: LOGIN, name: 'Verificare — trei posturi', role: 'META_MENTOR',
      passwordHash: await bcrypt.hash(PASSWORD, 10), mustChangePassword: false,
      assignments: { create: [
        { role: 'ADMIN', capabilities: { create: overridesFrom('ADMIN', ROLE_DEFAULTS.ADMIN) } },
        { role: 'META_MENTOR', label: 'Meta-coordonator', schoolId: school.id,
          capabilities: { create: overridesFrom('META_MENTOR', [...ROLE_DEFAULTS.META_MENTOR, 'admin.users']) } },
        { role: 'META_MENTOR', label: 'Mentor simplu',
          capabilities: { create: overridesFrom('META_MENTOR', ROLE_DEFAULTS.META_MENTOR) } },
      ] },
    },
    include: { assignments: true },
  });
  console.log(`${LOGIN} / ${PASSWORD}`);
  u.assignments.forEach(a => console.log(`  post ${a.id} ${a.role} school=${a.schoolId || '-'} label=${a.label || '-'}`));
})().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
