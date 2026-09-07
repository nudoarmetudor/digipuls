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
// The pool is configured explicitly rather than left to the driver's
// defaults, because this host also caps the database user at
// max_connections_per_hour = 500 — a *cumulative* count of connection
// attempts, not a concurrency limit. Exceeding it doesn't just slow the app
// down: `prisma migrate deploy` can no longer connect, so `npm run build`
// fails and deployments stop landing entirely, which is exactly how this
// was discovered. The settings below trade a little concurrency for opening
// as few connections as possible:
//
//   connectionLimit  small — this is a low-traffic pilot, not a busy site,
//                    and every extra pooled connection is another entry
//                    against the hourly budget.
//   idleTimeout: 0   never close an idle connection. The default (1800s)
//                    quietly recycles connections all day; each recycle
//                    costs another connection from the same budget.
//   minimumIdle: 1   keep one warm so a quiet period doesn't force a
//                    cold reconnect on the next visitor.
const POOL = {
  connectionLimit: 4,
  idleTimeout: 0,
  minimumIdle: 1,
  acquireTimeout: 20000,
  connectTimeout: 20000,
};

// Built lazily: the adapter parses DATABASE_URL as soon as it's
// constructed, so eager construction would make merely *importing* any
// module in the dependency chain fail when no database is configured —
// which is exactly the case for the pure-logic unit tests in tests/.
let client = null;

function poolConfig() {
  const url = new URL(process.env.DATABASE_URL);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ...POOL,
  };
}

function getClient() {
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaMariaDb(poolConfig()) });
  }
  return client;
}

module.exports = new Proxy({}, {
  get(_target, prop) {
    const value = getClient()[prop];
    return typeof value === 'function' ? value.bind(getClient()) : value;
  },
});
