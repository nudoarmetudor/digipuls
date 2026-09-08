const test = require('node:test');
const assert = require('node:assert');

const {
  STATUSES, SEVERITIES, CLOSED_STATUSES, LIMITS,
  matchI18nKeys, buildTicketData, developerBlock,
} = require('../src/services/feedbackContext');
const { STRINGS } = require('../src/i18n');

test('closed statuses are a subset of the statuses', () => {
  CLOSED_STATUSES.forEach((s) => assert.ok(STATUSES.includes(s), `${s} is not a status`));
  assert.ok(STATUSES.includes('OPEN'));
});

test('every status and severity has a label in all three languages', () => {
  ['en', 'ro', 'ru'].forEach((lang) => {
    STATUSES.forEach((s) => {
      assert.ok(STRINGS[lang]['feedback_status_' + s.toLowerCase()], `${lang}: no label for status ${s}`);
    });
    SEVERITIES.forEach((s) => {
      assert.ok(STRINGS[lang]['feedback_sev_' + s.toLowerCase()], `${lang}: no label for severity ${s}`);
    });
  });
});

// --- the part that actually earns its keep --------------------------------

test('clicked text is traced back to the translation key that produced it', () => {
  // This is the whole point of the overlay: turning "this label is wrong" into
  // a key a developer can grep for.
  assert.deepStrictEqual(matchI18nKeys('Save inventory'), ['save_inventory']);
});

test('the key is found from any of the three languages', () => {
  // A mentor reading the Russian interface reports Russian text; the key is
  // still what the developer needs.
  assert.ok(matchI18nKeys('Сохранить инвентаризацию').includes('save_inventory'));
  assert.ok(matchI18nKeys('Salvați inventarul').includes('save_inventory'));
});

test('clicking a container finds the labels inside it', () => {
  const keys = matchI18nKeys('National dashboard All schools on DigiPuls — real-time status, aggregated.');
  assert.ok(keys.includes('ministry_dashboard_title'));
  assert.ok(keys.includes('ministry_dashboard_subtitle'));
});

test('unmatched, empty and absurdly long text yield nothing rather than noise', () => {
  assert.deepStrictEqual(matchI18nKeys('Liceul Teoretic Mihai Eminescu'), []);
  assert.deepStrictEqual(matchI18nKeys(''), []);
  assert.deepStrictEqual(matchI18nKeys(null), []);
  assert.deepStrictEqual(matchI18nKeys('x'.repeat(900)), []);
});

test('short incidental words do not produce spurious matches', () => {
  // "OK" is a dictionary value, but it should not attach itself to every
  // sentence that happens to contain it.
  const keys = matchI18nKeys('Everything here is OK for now, more or less');
  assert.ok(!keys.includes('ok'), 'a two-letter value must not match by containment');
});

test('matches are capped, so one click cannot return the whole dictionary', () => {
  const everything = Object.values(STRINGS.en).slice(0, 60).join(' ');
  assert.ok(matchI18nKeys(everything).length <= 6);
});

// --- submission validation ------------------------------------------------

const ctx = { authorId: 3, lang: 'ro' };

test('a ticket needs a comment', () => {
  assert.deepStrictEqual(buildTicketData({ comment: '   ' }, ctx), { ok: false, error: 'comment_required' });
  assert.deepStrictEqual(buildTicketData({}, ctx), { ok: false, error: 'comment_required' });
});

test('a valid submission is normalised and stamped with the author', () => {
  const built = buildTicketData({
    comment: '  The wording is unclear.  ',
    severity: 'MAJOR',
    route: '/school/cycles/1/step/infra',
    viewName: 'school/step-infra',
    selector: 'main > form > button',
    elementSummary: 'button.btn',
    elementText: 'Save inventory',
    viewport: '1280x800',
  }, ctx);

  assert.ok(built.ok);
  assert.strictEqual(built.data.authorId, 3);
  assert.strictEqual(built.data.status, 'OPEN');
  assert.strictEqual(built.data.severity, 'MAJOR');
  assert.strictEqual(built.data.comment, 'The wording is unclear.');
  assert.strictEqual(built.data.i18nKeys, 'save_inventory');
  assert.strictEqual(built.data.lang, 'ro', 'falls back to the request language');
});

test('an unknown severity falls back rather than being stored', () => {
  const built = buildTicketData({ comment: 'x', severity: 'CATASTROPHIC' }, ctx);
  assert.strictEqual(built.data.severity, 'NORMAL');
});

test('a client-supplied key list is ignored — the dictionary is the authority', () => {
  // Otherwise a submitter could write arbitrary text into a field developers
  // read as authoritative.
  const built = buildTicketData({
    comment: 'x', elementText: 'Save inventory', i18nKeys: 'anything_i_like',
  }, ctx);
  assert.strictEqual(built.data.i18nKeys, 'save_inventory');
});

test('oversized fields are truncated, not rejected and not stored whole', () => {
  const built = buildTicketData({
    comment: 'c'.repeat(9000),
    route: '/r'.repeat(9000),
  }, { ...ctx, userAgent: 'u'.repeat(9000) });
  assert.ok(built.ok);
  assert.strictEqual(built.data.comment.length, LIMITS.comment);
  assert.strictEqual(built.data.userAgent.length, LIMITS.userAgent);
  assert.strictEqual(built.data.route.length, LIMITS.route);
});

test('the user agent comes from the request, not from the reporter', () => {
  // A developer reading a ticket treats this line as evidence of what the
  // reporter was actually using. A value the reporter could type into the
  // request body is not evidence of anything, so a posted userAgent is
  // ignored in favour of the real header.
  const built = buildTicketData(
    { comment: 'x', userAgent: 'Definitely Internet Explorer 6' },
    { ...ctx, userAgent: 'Mozilla/5.0 (real header)' },
  );
  assert.ok(built.ok);
  assert.strictEqual(built.data.userAgent, 'Mozilla/5.0 (real header)');
});

test('a missing route still produces a filable ticket', () => {
  const built = buildTicketData({ comment: 'x' }, ctx);
  assert.ok(built.ok);
  assert.strictEqual(built.data.route, '(unknown)');
  assert.strictEqual(built.data.viewName, null);
});

// --- the developer block --------------------------------------------------

test('the developer block names the template file and the keys', () => {
  const block = developerBlock({
    id: 12, status: 'OPEN', severity: 'MAJOR', createdAt: new Date('2026-09-01T10:00:00Z'),
    route: '/school/cycles/1/step/infra', viewName: 'school/step-infra',
    i18nKeys: 'save_inventory', selector: 'main > button', elementSummary: 'button.btn',
    elementText: 'Save inventory', lang: 'ro', viewport: '1280x800', displayPrefs: 'theme:dark',
    comment: 'Unclear wording.', developerNote: null,
  });
  assert.match(block, /DigiPuls feedback #12/);
  assert.match(block, /src\/views\/school\/step-infra\.ejs/);
  assert.match(block, /i18n keys: save_inventory/);
  assert.match(block, /Unclear wording\./);
});

test('the developer block omits what was never captured', () => {
  const block = developerBlock({
    id: 1, status: 'OPEN', severity: 'NORMAL', createdAt: new Date(),
    route: '(unknown)', comment: 'Just a note.',
  });
  assert.ok(!block.includes('Template:'));
  assert.ok(!block.includes('i18n keys:'));
  assert.match(block, /Just a note\./);
});
