const test = require('node:test');
const assert = require('node:assert');
const { PrismaSessionStore, TOUCH_EVERY_MS } = require('../src/services/sessionStore');

// A stand-in for the Prisma client's session model: enough to show what the
// store writes, and how often.
function fakeClient() {
  const rows = new Map();
  const calls = { upsert: 0, updateMany: 0, deleteMany: 0, findUnique: 0 };
  return {
    rows,
    calls,
    session: {
      async findUnique({ where }) { calls.findUnique += 1; return rows.get(where.sid) || null; },
      async upsert({ where, create, update }) {
        calls.upsert += 1;
        rows.set(where.sid, { ...(rows.get(where.sid) || create), ...update });
      },
      async updateMany({ where, data }) {
        calls.updateMany += 1;
        if (rows.has(where.sid)) rows.set(where.sid, { ...rows.get(where.sid), ...data });
        return { count: rows.has(where.sid) ? 1 : 0 };
      },
      async deleteMany({ where }) {
        calls.deleteMany += 1;
        let count = 0;
        for (const [sid, row] of rows) {
          const hit = where.sid ? sid === where.sid : row.expiresAt < where.expiresAt.lt;
          if (hit) { rows.delete(sid); count += 1; }
        }
        return { count };
      },
    },
  };
}
const call = (fn, ...args) => new Promise((ok, fail) => fn(...args, (err, v) => (err ? fail(err) : ok(v))));

test('a session survives in the store, not in the process', async () => {
  let now = Date.parse('2026-09-17T10:00:00Z');
  const client = fakeClient();
  const first = new PrismaSessionStore({ client, prune: false, now: () => now });
  const sess = { cookie: { expires: new Date(now + 8 * 3600e3) }, user: { id: 7, name: 'Ana' }, csrfToken: 't' };
  await call(first.set.bind(first), 'abc', sess);

  // A different store object — as a restarted or second process would have.
  const second = new PrismaSessionStore({ client, prune: false, now: () => now });
  const read = await call(second.get.bind(second), 'abc');
  assert.strictEqual(read.user.name, 'Ana');
  assert.strictEqual(read.csrfToken, 't');

  await call(second.destroy.bind(second), 'abc');
  assert.strictEqual(await call(first.get.bind(first), 'abc'), null, 'signing out anywhere signs out everywhere');
});

test('an expired session reads as none and is removed', async () => {
  let now = Date.parse('2026-09-17T10:00:00Z');
  const client = fakeClient();
  const store = new PrismaSessionStore({ client, prune: false, now: () => now });
  await call(store.set.bind(store), 'old', { cookie: { expires: new Date(now + 1000) } });
  now += 2000;
  assert.strictEqual(await call(store.get.bind(store), 'old'), null);
  assert.ok(!client.rows.has('old'));
});

test('touching does not write to the database on every request', async () => {
  let now = Date.parse('2026-09-17T10:00:00Z');
  const client = fakeClient();
  const store = new PrismaSessionStore({ client, prune: false, now: () => now });
  const sess = { cookie: { expires: new Date(now + 8 * 3600e3) } };
  await call(store.set.bind(store), 's', sess);
  for (let i = 0; i < 20; i += 1) { now += 1000; await call(store.touch.bind(store), 's', sess); }
  assert.strictEqual(client.calls.updateMany, 0, 'twenty page views within minutes cost no writes');
  now += TOUCH_EVERY_MS;
  sess.cookie.expires = new Date(now + 8 * 3600e3);
  await call(store.touch.bind(store), 's', sess);
  assert.strictEqual(client.calls.updateMany, 1);
  assert.strictEqual(client.rows.get('s').expiresAt.getTime(), sess.cookie.expires.getTime());
});

test('pruning deletes only what has expired, and an unreadable row is no session', async () => {
  let now = Date.parse('2026-09-17T10:00:00Z');
  const client = fakeClient();
  const store = new PrismaSessionStore({ client, prune: false, now: () => now });
  await call(store.set.bind(store), 'live', { cookie: { expires: new Date(now + 3600e3) } });
  client.rows.set('dead', { sid: 'dead', data: '{}', expiresAt: new Date(now - 1) });
  assert.strictEqual(await store.prune(), 1);
  assert.ok(client.rows.has('live') && !client.rows.has('dead'));

  client.rows.set('broken', { sid: 'broken', data: '{not json', expiresAt: new Date(now + 3600e3) });
  assert.strictEqual(await call(store.get.bind(store), 'broken'), null);
});
