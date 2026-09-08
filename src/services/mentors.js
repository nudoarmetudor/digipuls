// Who supports a school.
//
// The link already exists, written from the other direction: a meta-mentor's
// post names the school they support. Nothing read it, so a school team that
// got stuck had no way to find out who their mentor was — while the mentor's
// own account recorded the answer.
//
// Deliberately returns names only. There are no email addresses in this
// system — the pilot's mentors have no institutional mailbox, which is why
// accounts are identified by a handle like "gurita.elena" rather than an
// address — so there is no contact detail to show that would not be invented.
// Naming the person is still the answer to "who do I ask", and how they are
// reached is arranged outside the platform.

const prisma = require('../config/db');

/**
 * @param {number} schoolId
 * @returns {Promise<Array<{name: string, label: string|null}>>}
 */
async function mentorsForSchool(schoolId) {
  if (!Number.isInteger(schoolId)) return [];
  const posts = await prisma.assignment.findMany({
    where: { role: 'META_MENTOR', schoolId, isActive: true },
    include: { user: { select: { name: true, isActive: true } } },
    orderBy: { id: 'asc' },
  });
  return posts
    // A post can outlive the account being switched off.
    .filter((p) => p.user && p.user.isActive)
    .map((p) => ({ name: p.user.name, label: p.label || null }));
}

module.exports = { mentorsForSchool };
