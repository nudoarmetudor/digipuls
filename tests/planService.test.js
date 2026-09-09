const test = require('node:test');
const assert = require('node:assert');

const {
  ADVANCE, MAINTAIN, INTENTS, INITIATIVE_STATUSES, PLAN_YEARS,
  requirementsFor, planRows, planSummary, targetChoices,
} = require('../src/services/planService');
const { getIndicatorData } = require('../src/data/indicatorsI18n');

// The plan starts from all nineteen parameters, each at the level the school
// agreed. Maintain is the default, because staying where you are is the
// commitment a school makes by not choosing otherwise — and it carries
// requirements of its own.

test('a plan runs two years', () => {
  assert.strictEqual(PLAN_YEARS, 2);
});

test('maintain is the default intent, not the absence of one', () => {
  assert.deepStrictEqual(INTENTS, [MAINTAIN, ADVANCE]);
  assert.strictEqual(INTENTS[0], MAINTAIN);
});

// --- requirements come from the instrument, in the reader's language --------

test('requirements are read from the instrument, not invented', () => {
  const a1 = getIndicatorData('en').INDICATORS.find((i) => i.code === 'A1');
  const req = requirementsFor(a1, 3);

  assert.ok(req, 'the instrument defines level 3 of A1');
  assert.strictEqual(req.level, 3);
  assert.ok(req.levelName, 'a level has a name');
  assert.ok(req.description && req.description.length > 20, 'and a description worth reading');
});

test('a school reads its requirements in its own language', () => {
  const codeOf = (lang) => getIndicatorData(lang).INDICATORS.find((i) => i.code === 'A1');
  const en = requirementsFor(codeOf('en'), 3);
  const ro = requirementsFor(codeOf('ro'), 3);
  const ru = requirementsFor(codeOf('ru'), 3);

  assert.notStrictEqual(ro.description, en.description, 'Romanian is not the English text');
  assert.notStrictEqual(ru.description, en.description, 'nor is Russian');
  assert.ok(/[ăâîșțĂÂÎȘȚ]/.test(ro.levelName + ro.description), 'Romanian reads as Romanian');
  assert.ok(/[А-Яа-я]/.test(ru.levelName + ru.description), 'Russian reads as Russian');
});

test('a level that sets no benchmark shows none, rather than empty headings', () => {
  // Only some levels define engagement, frequency or evidence bars. Rendering
  // a heading with nothing under it reads as missing data rather than as a
  // level that simply does not set that bar.
  const a1 = getIndicatorData('en').INDICATORS.find((i) => i.code === 'A1');
  [0, 1, 2, 3, 4, 5].forEach((level) => {
    const req = requirementsFor(a1, level);
    if (!req) return;
    req.benchmarks.forEach((b) => {
      assert.ok(b.value, `${b.key} must not be an empty benchmark`);
      assert.ok(['engagement', 'frequency', 'evidence'].includes(b.key));
    });
  });
});

test('an unknown level yields nothing rather than a broken page', () => {
  const a1 = getIndicatorData('en').INDICATORS.find((i) => i.code === 'A1');
  assert.strictEqual(requirementsFor(a1, 99), null);
  assert.strictEqual(requirementsFor(null, 3), null);
});

// --- what a school can aim at ----------------------------------------------

test('a target is always above where the parameter stands', () => {
  assert.deepStrictEqual(targetChoices(2), [3, 4, 5]);
  assert.deepStrictEqual(targetChoices(0), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(targetChoices(4), [5]);
  assert.deepStrictEqual(targetChoices(5), [], 'nothing above the top of the instrument');
});

// --- folding the plan for a view -------------------------------------------

const INDICATORS = [
  { code: 'A1', name: 'Vision', levels: [] },
  { code: 'A2', name: 'Leadership', levels: [] },
  { code: 'B1', name: 'Infrastructure', levels: [] },
];

function plan(priorities) {
  return { id: 1, priorities };
}

test('every parameter is in the plan, advancing or held', () => {
  const rows = planRows(plan([
    { indicatorCode: 'A1', intent: ADVANCE, currentLevel: 2, targetLevel: 4, initiatives: [{ id: 1 }] },
    { indicatorCode: 'A2', intent: MAINTAIN, currentLevel: 3, targetLevel: 3, initiatives: [] },
    { indicatorCode: 'B1', intent: MAINTAIN, currentLevel: 1, targetLevel: 1, initiatives: [] },
  ]), INDICATORS);

  assert.strictEqual(rows.length, 3);
  assert.ok(rows[0].advancing);
  assert.ok(!rows[1].advancing);
  assert.ok(!rows[2].advancing);
});

test('a target that is not actually higher is not advancing', () => {
  // The intent column can say ADVANCE; if the target equals the current level,
  // nothing is being advanced and the plan should not claim otherwise.
  const [row] = planRows(plan([
    { indicatorCode: 'A1', intent: ADVANCE, currentLevel: 3, targetLevel: 3, initiatives: [] },
  ]), [INDICATORS[0]]);
  assert.ok(!row.advancing);
});

test('advancing with nothing written about how is surfaced, not hidden', () => {
  const rows = planRows(plan([
    { indicatorCode: 'A1', intent: ADVANCE, currentLevel: 2, targetLevel: 4, initiatives: [] },
    { indicatorCode: 'A2', intent: ADVANCE, currentLevel: 1, targetLevel: 2, initiatives: [{ id: 9 }] },
    { indicatorCode: 'B1', intent: MAINTAIN, currentLevel: 1, targetLevel: 1, initiatives: [] },
  ]), INDICATORS);

  assert.ok(rows[0].needsInitiatives, 'advancing with no initiatives is a gap');
  assert.ok(!rows[1].needsInitiatives, 'advancing with one is not');
  assert.ok(!rows[2].needsInitiatives,
    'maintaining without initiatives is a choice, not an omission');

  const summary = planSummary(rows);
  assert.deepStrictEqual(summary.withoutInitiatives, ['A1']);
  assert.strictEqual(summary.advancing, 2);
  assert.strictEqual(summary.maintaining, 1);
  assert.strictEqual(summary.initiatives, 1);
});

test('the summary counts every parameter, not only the interesting ones', () => {
  // A school advancing three is committing to hold sixteen. If the totals only
  // reported the three, the plan would look like a quarter of the work it is.
  const rows = planRows(plan(
    INDICATORS.map((i, n) => ({
      indicatorCode: i.code, intent: n === 0 ? ADVANCE : MAINTAIN,
      currentLevel: 2, targetLevel: n === 0 ? 4 : 2, initiatives: [],
    }))), INDICATORS);
  const summary = planSummary(rows);
  assert.strictEqual(summary.total, INDICATORS.length);
  assert.strictEqual(summary.advancing + summary.maintaining, summary.total);
});

test('a plan with no rows yet renders as nothing rather than throwing', () => {
  const rows = planRows(null, INDICATORS);
  assert.strictEqual(rows.length, 3);
  rows.forEach((r) => {
    assert.strictEqual(r.priority, null);
    assert.strictEqual(r.currentLevel, null);
    assert.ok(!r.advancing);
  });
});

test('an initiative status is one of four', () => {
  assert.deepStrictEqual(INITIATIVE_STATUSES,
    ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DROPPED']);
});
