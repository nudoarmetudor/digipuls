const prisma = require('../config/db');

// Durable, attributable log — see "DigiPuls - additional requirements and
// open questions resolved.md": anything that feeds a decision with real
// consequences (donation matching, compliance escalation) needs to be
// reconstructable later.
async function logAction(userId, action, entityType, entityId, details) {
  return prisma.auditLogEntry.create({
    data: {
      userId: userId || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      details: details ? String(details) : null,
    },
  });
}

module.exports = { logAction };
