const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/config/db');

function withEnv(env, fn) {
  const saved = {};
  Object.keys(env).forEach((k) => { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; });
  try { return fn(); } finally {
    Object.keys(saved).forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  }
}

test('the database on this machine is reached without TLS, a remote one with it', () => {
  ['localhost', '127.0.0.1', '::1', '[::1]'].forEach((h) => assert.ok(db.isLoopback(h), h));
  ['srv2025.hstgr.io', '92.113.22.154', '127.example.com', ''].forEach((h) => assert.ok(!db.isLoopback(h), h));

  withEnv({ DB_SSL: undefined, DB_SSL_INSECURE: 'true' }, () => {
    assert.strictEqual(db.sslConfig('127.0.0.1'), undefined);
    assert.deepStrictEqual(db.sslConfig('srv2025.hstgr.io'), { rejectUnauthorized: false });
  });
  withEnv({ DB_SSL: 'true', DB_SSL_INSECURE: undefined }, () => {
    assert.deepStrictEqual(db.sslConfig('localhost'), { rejectUnauthorized: true }, 'DB_SSL=true forces TLS');
  });
  withEnv({ DATABASE_URL: 'mysql://u:p%40ss@127.0.0.1:3306/digipuls', DB_SSL: undefined, DB_SSL_INSECURE: 'true' }, () => {
    const cfg = db.poolConfig();
    assert.strictEqual(cfg.host, '127.0.0.1');
    assert.strictEqual(cfg.password, 'p@ss');
    assert.ok(!('ssl' in cfg));
  });
});
