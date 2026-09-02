const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

// Queries go through a pure-JS MySQL driver (driver adapter) rather than
// Prisma's Rust query engine. This is not a performance tweak — the
// production host is CloudLinux shared hosting, whose per-account
// process/thread limits kill the Rust engine's Tokio worker threads
// mid-query, surfacing as intermittent, non-recoverable
// "PANIC: timer has gone away" crashes on any DB-touching request.
// See DEPLOYMENT.md for the full diagnosis.
//
// Built lazily: the adapter parses DATABASE_URL as soon as it's
// constructed, so eager construction would make merely *importing* any
// module in the dependency chain fail when no database is configured —
// which is exactly the case for the pure-logic unit tests in tests/.
let client = null;

function getClient() {
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });
  }
  return client;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getClient()[prop];
    return typeof value === 'function' ? value.bind(getClient()) : value;
  },
});
