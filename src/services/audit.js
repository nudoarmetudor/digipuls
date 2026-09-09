const prisma = require('../config/db');

// Durable, attributable log — see "DigiPuls - additional requirements and
// open questions resolved.md": anything that feeds a decision with real
// consequences (donation matching, compliance escalation) needs to be
// reconstructable later.
/**
 * @param {?number} userId
 * @param {string} action
 * @param {string} entityType
 * @param {*} entityId
 * @param {?string} details
 * @param {?string} ipAddress  only passed for sign-in. Every other call omits
 *   it, which is deliberate: the useful record is where a session began, not
 *   a trail of every page a named person opened.
 */
async function logAction(userId, action, entityType, entityId, details, ipAddress) {
  return prisma.auditLogEntry.create({
    data: {
      userId: userId || null,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      details: details ? String(details) : null,
      // Trimmed: express gives an IPv4-mapped IPv6 form (::ffff:1.2.3.4)
      // when the socket is dual-stack, and two spellings of one address in a
      // log is two addresses to a reader.
      ipAddress: ipAddress ? String(ipAddress).replace(/^::ffff:/, '').slice(0, 45) : null,
    },
  });
}

module.exports = { logAction };
