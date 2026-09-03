const test = require('node:test');
const assert = require('node:assert');

const { STRINGS, SUPPORTED_LANGS, LANG_NAMES, LANG_SHORT, STATUS_LABELS, CHANGE_STATE_LABELS, t, pickFromAcceptLanguage } = require('../src/i18n');
const { BY_LANG } = require('../src/data/indicatorsI18n');
const { checkDeviceCompliance, checkNetworkCompliance, NETWORK_CHECKLIST_ITEMS } = require('../src/data/order675');

// The point of these tests: a missing translation must fail the build rather
// than quietly serving English inside a Romanian or Russian page. That was
// the old failure mode — views carried `lang === 'ro' ? ... : ...` inline, so
// every non-Romanian language silently fell back to English with no signal.

test('every language is declared consistently', () => {
  assert.deepStrictEqual(SUPPORTED_LANGS, ['en', 'ro', 'ru']);
  SUPPORTED_LANGS.forEach((code) => {
    assert.ok(STRINGS[code], `no dictionary for ${code}`);
    assert.ok(LANG_NAMES[code], `no display name for ${code}`);
    assert.ok(LANG_SHORT[code], `no short label for ${code}`);
    assert.ok(STATUS_LABELS[code], `no status labels for ${code}`);
    assert.ok(CHANGE_STATE_LABELS[code], `no change-state labels for ${code}`);
  });
});

test('all dictionaries define exactly the same keys', () => {
  const reference = Object.keys(STRINGS.en).sort();
  SUPPORTED_LANGS.filter((c) => c !== 'en').forEach((code) => {
    const keys = Object.keys(STRINGS[code]).sort();
    const missing = reference.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !reference.includes(k));
    assert.deepStrictEqual(missing, [], `${code} is missing keys: ${missing.join(', ')}`);
    assert.deepStrictEqual(extra, [], `${code} has keys English doesn't: ${extra.join(', ')}`);
  });
});

test('no translation is left as a copy of the English string', () => {
  // Some strings are legitimately identical across languages: protocol names
  // ("802.11n"), "OK", and Romanian cognates that really are spelled the same
  // as the English word ("Contrast", "Normal", "Standard", "Actual",
  // "Reduce" — the Romanian imperative, not the English verb). Anything not
  // on this list being identical means someone pasted English in and moved on.
  const ALLOWED_IDENTICAL = new Set([
    'login_email', 'ok', 'net_wifi80211n', 'net_wifi80211ac',
    'th_indicator', 'th_email', 'demo_ministry', 'th_plan',
    'a11y_contrast', 'a11y_contrast_normal', 'a11y_text_md',
    'a11y_motion_reduced', 'actual',
  ]);
  SUPPORTED_LANGS.filter((c) => c !== 'en').forEach((code) => {
    const copied = Object.keys(STRINGS.en)
      .filter((k) => !ALLOWED_IDENTICAL.has(k))
      .filter((k) => STRINGS[code][k] === STRINGS.en[k]);
    assert.deepStrictEqual(copied, [], `${code} still holds the English text for: ${copied.join(', ')}`);
  });
});

test('placeholders survive translation', () => {
  // If a translator drops {n} from a string, the sentence renders with a hole
  // in it. Compare the placeholder sets, not the prose.
  const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
  Object.keys(STRINGS.en).forEach((key) => {
    const expected = placeholders(STRINGS.en[key]);
    if (!expected.length) return;
    SUPPORTED_LANGS.filter((c) => c !== 'en').forEach((code) => {
      assert.deepStrictEqual(
        placeholders(STRINGS[code][key]), expected,
        `${code}.${key} placeholders differ from English`
      );
    });
  });
});

test('t() interpolates, falls back to English, and never returns undefined', () => {
  assert.strictEqual(t('en')('err_no_route', { path: '/x' }), 'No route for /x');
  assert.match(t('ru')('ministry_newer_draft_detail', { n: 4 }), /4/);
  // An unknown key renders as the key — deliberately ugly, never blank.
  assert.strictEqual(t('ro')('definitely_not_a_key'), 'definitely_not_a_key');
  // An unknown language falls back to the English dictionary, not to crashing.
  assert.strictEqual(t('de')('ok'), STRINGS.en.ok);
});

test('Accept-Language negotiation prefers a supported language', () => {
  assert.strictEqual(pickFromAcceptLanguage('ru-RU,ru;q=0.9,en;q=0.8'), 'ru');
  assert.strictEqual(pickFromAcceptLanguage('ro-MD,ro;q=0.9'), 'ro');
  // "mo" is the deprecated code for Moldovan and still turns up in the wild.
  assert.strictEqual(pickFromAcceptLanguage('mo'), 'ro');
  // Quality values are honoured, not just document order.
  assert.strictEqual(pickFromAcceptLanguage('en;q=0.2,ru;q=0.9'), 'ru');
  assert.strictEqual(pickFromAcceptLanguage('de-DE,fr;q=0.7'), 'en');
  assert.strictEqual(pickFromAcceptLanguage(''), 'en');
  assert.strictEqual(pickFromAcceptLanguage(undefined), 'en');
});

test('the assessment instrument itself exists in all three languages', () => {
  const reference = BY_LANG.en;
  SUPPORTED_LANGS.forEach((code) => {
    const data = BY_LANG[code];
    assert.ok(data, `no indicator data for ${code}`);
    assert.strictEqual(data.LEVEL_NAMES.length, 6, `${code}: expected 6 level names`);
    assert.deepStrictEqual(Object.keys(data.DOMAINS).sort(), ['A', 'B', 'C', 'D'], `${code}: domains`);
    assert.strictEqual(data.INDICATORS.length, 19, `${code}: expected 19 indicators`);
    assert.deepStrictEqual(
      data.INDICATORS.map((i) => i.code),
      reference.INDICATORS.map((i) => i.code),
      `${code}: indicator codes/order differ from English`
    );
    data.INDICATORS.forEach((ind, i) => {
      const ref = reference.INDICATORS[i];
      assert.strictEqual(ind.domain, ref.domain, `${code}.${ind.code}: domain differs`);
      assert.strictEqual(ind.levels.length, 6, `${code}.${ind.code}: expected 6 levels`);
      ind.levels.forEach((lv, level) => {
        assert.strictEqual(lv.level, level, `${code}.${ind.code}: level index`);
        assert.ok(lv.description && lv.description.trim(), `${code}.${ind.code} L${level}: empty description`);
        assert.ok(lv.levelName && lv.levelName.trim(), `${code}.${ind.code} L${level}: empty level name`);
      });
      // Quantitative benchmarks are part of the instrument (Annex A v3), so a
      // language that has the prose but not the benchmarks is incomplete.
      ind.levels.forEach((lv, level) => {
        const refLv = ref.levels[level];
        assert.strictEqual(
          !!lv.engagementBenchmark, !!refLv.engagementBenchmark,
          `${code}.${ind.code} L${level}: engagement benchmark presence differs from English`
        );
      });
    });
  });
});

test('every Order 675 check label resolves in every language', () => {
  const compliance = checkDeviceCompliance(
    { enrolmentTotal: 400, classroomsTotal: 20, studentsGrades7to12: 120 },
    { classroomPCs: 1, interactivePanels: 1, itRoomPCs: 1, managementPCs: 1,
      methodicalCentrePCs: 1, libraryPCs: 1, printers: 1, multifunctionPrinters: 1 }
  );
  const network = checkNetworkCompliance({});
  const checks = compliance.checks.concat(network.checks);
  assert.strictEqual(checks.length, 8 + NETWORK_CHECKLIST_ITEMS.length);

  SUPPORTED_LANGS.forEach((code) => {
    const translate = t(code);
    checks.forEach((c) => {
      assert.ok(c.labelKey, `check ${c.key} has no labelKey`);
      const text = translate(c.labelKey, c.labelParams);
      assert.notStrictEqual(text, c.labelKey, `${code}: ${c.labelKey} is untranslated`);
      assert.ok(!/\{\w+\}/.test(text), `${code}: ${c.labelKey} left a placeholder unfilled — "${text}"`);
    });
  });

  // The dynamic one must actually interpolate the room count.
  const itRoom = compliance.checks.find((c) => c.key === 'itRoomPCs');
  assert.match(t('ru')(itRoom.labelKey, itRoom.labelParams), new RegExp(String(itRoom.labelParams.rooms)));
});
