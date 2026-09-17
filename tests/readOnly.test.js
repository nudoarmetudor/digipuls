const test = require('node:test');
const assert = require('node:assert');
const { createReadOnlySwitch, CACHE_MS } = require('../src/services/readOnly');

function fakeClient(value) {
  const state = { value, reads: 0, fail: false };
  return {
    state,
    appSetting: {
      async findUnique() {
        state.reads += 1;
        if (state.fail) throw new Error('database unreachable');
        return state.value === undefined ? null : { key: 'read_only', value: state.value };
      },
    },
  };
}

function run(sw, method, path) {
  return new Promise((resolve) => {
    const res = {
      locals: { t: (k) => k },
      statusCode: 200,
      headers: {},
      set(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; },
      render(view, locals) { resolve({ blocked: true, code: this.statusCode, view, locals, res: this }); },
    };
    sw.middleware({ method, path }, res, () => resolve({ blocked: false, res }));
  });
}

test('with the switch off, everything passes', async () => {
  const sw = createReadOnlySwitch({ client: fakeClient(undefined) });
  assert.strictEqual((await run(sw, 'POST', '/school/cycles/1/confirm')).blocked, false);
});

test('with the switch on, pages read and changes are refused', async () => {
  const sw = createReadOnlySwitch({ client: fakeClient('true') });
  const read = await run(sw, 'GET', '/school');
  assert.strictEqual(read.blocked, false);
  assert.strictEqual(read.res.locals.readOnly, true, 'pages carry the notice');

  const write = await run(sw, 'POST', '/school/cycles/1/ratings/A1');
  assert.strictEqual(write.blocked, true);
  assert.strictEqual(write.code, 503);
  assert.strictEqual(write.res.headers['Retry-After'], '600');

  for (const path of ['/login', '/logout', '/preferences']) {
    assert.strictEqual((await run(sw, 'POST', path)).blocked, false, `${path} stays open`);
  }
});

test('the setting is read at most once per cache window, and an unreadable database fails open', async () => {
  let now = 0;
  const client = fakeClient('true');
  const sw = createReadOnlySwitch({ client, now: () => now });
  await sw.isReadOnly(); await sw.isReadOnly(); await sw.isReadOnly();
  assert.strictEqual(client.state.reads, 1);
  now += CACHE_MS;
  client.state.value = 'false';
  assert.strictEqual(await sw.isReadOnly(), false);
  assert.strictEqual(client.state.reads, 2);

  now += CACHE_MS;
  client.state.fail = true;
  assert.strictEqual(await sw.isReadOnly(), false);
});
