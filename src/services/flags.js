// Concerns raised by a district about one of its schools.
//
// A flag has no table of its own — it is written to the audit trail, which is
// the right place for "who said what about which school, and when", and is
// the MVP stand-in for the fuller escalation workflow in ROADMAP.md.
//
// The problem this module fixes is that writing was the end of it. Reading the
// audit log needs admin.audit, which no territorial post holds, so the person
// raising a concern filed it and never saw it again — the button appeared to
// do nothing. Flags are now read back here and shown on the school's page to
// the district that raised them and to the Ministry.
//
// Reading from the audit log rather than duplicating the data keeps one record
// of the fact. The cost is that a flag cannot be edited or resolved; when that
// becomes necessary it wants a model of its own, and this function is where
// that change would land.

const prisma = require('../config/db');

const FLAG_ACTION = 'TERRITORIAL_FLAG';

/**
 * @param {number} schoolId
 * @param {number} [limit]
 * @returns {Promise<Array<{id, raisedAt, reason, byName}>>} newest first
 */
async function flagsForSchool(schoolId, limit = 20) {
  if (!Number.isInteger(schoolId)) return [];
  const entries = await prisma.auditLogEntry.findMany({
    where: {
      action: FLAG_ACTION,
      entityType: 'School',
      // entityId is a string column: it holds ids for every kind of entity,
      // so it cannot be an integer.
      entityId: String(schoolId),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { user: { select: { name: true } } },
  });

  return entries.map((e) => ({
    id: e.id,
    raisedAt: e.createdAt,
    // A flag with no reason is still a flag; the view says so rather than
    // rendering an empty line.
    reason: e.details && e.details.trim() ? e.details.trim() : null,
    byName: e.user ? e.user.name : null,
  }));
}

module.exports = { flagsForSchool, FLAG_ACTION };
