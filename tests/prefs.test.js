const test = require('node:test');
const assert = require('node:assert');

const prefs = require('../src/utils/prefs');

const req = (cookie) => ({ headers: cookie ? { cookie } : {} });

test('an absent or empty cookie yields the defaults', () => {
  assert.deepStrictEqual(prefs.readPrefs(req()), prefs.DEFAULTS);
  assert.deepStrictEqual(prefs.readPrefs(req('')), prefs.DEFAULTS);
  assert.deepStrictEqual(prefs.readPrefs(req('other=1')), prefs.DEFAULTS);
});

test('a valid cookie is read back, alongside unrelated cookies', () => {
  const parsed = prefs.readPrefs(req('sid=abc; dp_prefs=theme%3Adark%7Ctext%3Axl; dp_lang=ru'));
  assert.strictEqual(parsed.theme, 'dark');
  assert.strictEqual(parsed.text, 'xl');
  // Anything not named in the cookie stays at its default.
  assert.strictEqual(parsed.contrast, 'normal');
});

test('values outside the allow-list are dropped, not escaped and trusted', () => {
  // These land in HTML attributes, so a rejected value must fall back to the
  // default rather than reaching the template at all.
  const parsed = prefs.readPrefs(req('dp_prefs=' + encodeURIComponent('theme:"><script>|text:99|contrast:high')));
  assert.strictEqual(parsed.theme, 'system');
  assert.strictEqual(parsed.text, 'md');
  assert.strictEqual(parsed.contrast, 'high', 'a valid value alongside invalid ones must still apply');
});

test('a malformed percent-escape does not throw', () => {
  assert.deepStrictEqual(prefs.readPrefs(req('dp_prefs=%E0%A4%A')), prefs.DEFAULTS);
});

test('a submitted form body is filtered by the same allow-list', () => {
  const chosen = prefs.prefsFromBody({ theme: 'dark', contrast: 'nope', text: 'xxl', motion: 'reduced', underline: 'on', extra: 'x' });
  assert.deepStrictEqual(chosen, { theme: 'dark', contrast: 'normal', text: 'xxl', motion: 'reduced', underline: 'on' });
  assert.deepStrictEqual(prefs.prefsFromBody({}), prefs.DEFAULTS);
  assert.deepStrictEqual(prefs.prefsFromBody(), prefs.DEFAULTS);
});

test('serialize omits defaults, so an all-default cookie is empty', () => {
  assert.strictEqual(prefs.serialize(prefs.DEFAULTS), '');
  assert.strictEqual(
    prefs.serialize({ theme: 'dark', contrast: 'high', text: 'md', motion: 'full', underline: 'off' }),
    'theme:dark|contrast:high'
  );
});

test('serialize and readPrefs round-trip', () => {
  const chosen = { theme: 'light', contrast: 'high', text: 'lg', motion: 'reduced', underline: 'on' };
  const cookie = 'dp_prefs=' + encodeURIComponent(prefs.serialize(chosen));
  assert.deepStrictEqual(prefs.readPrefs(req(cookie)), chosen);
});

test('htmlAttrs emits only non-default preferences', () => {
  // A preference left at its default must not be pinned onto <html>, or the
  // CSS can never fall through to prefers-color-scheme / prefers-reduced-motion.
  assert.strictEqual(prefs.htmlAttrs(prefs.DEFAULTS), '');
  assert.strictEqual(
    prefs.htmlAttrs({ theme: 'dark', contrast: 'normal', text: 'xl', motion: 'full', underline: 'off' }),
    'data-theme="dark" data-text="xl"'
  );
});

test('readRawCookie returns a single named cookie', () => {
  assert.strictEqual(prefs.readRawCookie(req('dp_lang=ro; sid=1'), 'dp_lang'), 'ro');
  assert.strictEqual(prefs.readRawCookie(req('sid=1'), 'dp_lang'), undefined);
  assert.strictEqual(prefs.readRawCookie(req(), 'dp_lang'), undefined);
});
