const test = require('node:test');
const assert = require('node:assert');

const {
  INTERIM, FINAL, REPORT_KINDS, DUE_AFTER_YEARS,
  reportTiming, reportLines, reportProgress, buildSnapshot,
} = require('../src/services/reportService');

// The report is built from the initiatives already in the plan: their status,
// and what their measures reached against the targets the school set. Nothing
// is re-entered.

const rows = [
  {
    indicator: { code: 'A1', name: 'Viziune' },
    intent: 'ADVANCE', currentLevel: 2, targetLevel: 4,
    initiatives: [
      {
        id: 1, title: 'Formare', status: 'DONE',
        responsibleUser: { id: 5, name: 'Elena Guriță' }, responsibleName: null,
        supervisorUser: null, supervisorName: 'Ion Popescu',
        dueOn: new Date('2027-06-01'),
        kpis: [
          { id: 11, measure: 'Cadre formate', target: '80%', actual: '62%' },
          { id: 12, measure: 'Sesiuni', target: '3', actual: null },
        ],
      },
      {
        id: 2, title: 'Echipament', status: 'IN_PROGRESS',
        responsibleUser: null, responsibleName: 'Maria Rusu',
        supervisorUser: null, supervisorName: null, dueOn: null, kpis: [],
      },
    ],
  },
  {
    indicator: { code: 'A2', name: 'Conducere' },
    intent: 'MAINTAIN', currentLevel: 3, targetLevel: 3, initiatives: [],
  },
];

test('a report is due a year in, and the final one at the end', () => {
  assert.deepStrictEqual(REPORT_KINDS, [INTERIM, FINAL]);
  assert.strictEqual(DUE_AFTER_YEARS[INTERIM], 1);
  assert.strictEqual(DUE_AFTER_YEARS[FINAL], 2);
});

test('the due date is a year after the plan starts', () => {
  const plan = { startsOn: new Date('2026-09-01') };
  const { dueOn, due } = reportTiming(plan, INTERIM, new Date('2027-01-01'));
  assert.strictEqual(dueOn.toISOString().slice(0, 10), '2027-09-01');
  assert.ok(!due, 'January is not yet a year in');

  assert.ok(reportTiming(plan, INTERIM, new Date('2027-10-01')).due);
});

test('a plan with no start date has no due date rather than a wrong one', () => {
  assert.deepStrictEqual(reportTiming({ startsOn: null }, INTERIM), { dueOn: null, due: false });
  assert.deepStrictEqual(reportTiming(null, INTERIM), { dueOn: null, due: false });
});

test('the report reads the initiatives, flattened with their parameter', () => {
  const lines = reportLines(rows);
  assert.strictEqual(lines.length, 2, 'only parameters with initiatives appear');
  assert.strictEqual(lines[0].indicatorCode, 'A1');
  assert.strictEqual(lines[0].title, 'Formare');
  assert.strictEqual(lines[0].status, 'DONE');
});

test('a person is named whether or not they have an account', () => {
  const [first, second] = reportLines(rows);
  assert.strictEqual(first.responsible, 'Elena Guriță', 'from the linked account');
  assert.strictEqual(first.supervisor, 'Ion Popescu', 'from the written name');
  assert.strictEqual(second.responsible, 'Maria Rusu');
  assert.strictEqual(second.supervisor, null, 'nobody named is null, not an empty string');
});

test('a measure with no result is unrecorded, not missed', () => {
  // The distinction the whole report rests on: a blank means nobody has said
  // what happened. Calling that a failure would put a school in front of the
  // Ministry with a number it never reported.
  const progress = reportProgress(reportLines(rows));
  assert.strictEqual(progress.kpis, 2);
  assert.strictEqual(progress.recorded, 1);
  assert.strictEqual(progress.unrecorded, 1);
  assert.ok(!('met' in progress), 'the report must not claim to judge a target');
  assert.ok(!('missed' in progress));
});

test('progress counts initiatives by status', () => {
  const p = reportProgress(reportLines(rows));
  assert.strictEqual(p.initiatives, 2);
  assert.strictEqual(p.byStatus.DONE, 1);
  assert.strictEqual(p.byStatus.IN_PROGRESS, 1);
  assert.strictEqual(p.byStatus.NOT_STARTED, 0);
  assert.strictEqual(p.byStatus.DROPPED, 0);
});

test('a plan with no initiatives reports nothing rather than throwing', () => {
  const lines = reportLines([{ indicator: { code: 'B1', name: 'x' }, intent: 'MAINTAIN', initiatives: [] }]);
  assert.deepStrictEqual(lines, []);
  const p = reportProgress(lines);
  assert.strictEqual(p.initiatives, 0);
  assert.strictEqual(p.kpis, 0);
  assert.strictEqual(p.unrecorded, 0);
});

// --- the snapshot -----------------------------------------------------------

test('publishing freezes the report as it stood', () => {
  // Implementation continues after the report goes out. A report reading live
  // data would quietly rewrite itself, and a year-one report would end up
  // describing year two.
  const publishedAt = new Date('2027-09-15T10:00:00Z');
  const snapshot = buildSnapshot(rows, { narrative: 'A fost un an bun', kind: INTERIM, publishedAt });

  assert.strictEqual(snapshot.kind, INTERIM);
  assert.strictEqual(snapshot.narrative, 'A fost un an bun');
  assert.strictEqual(snapshot.publishedAt, publishedAt.toISOString());
  assert.strictEqual(snapshot.lines.length, 2);
  assert.strictEqual(snapshot.progress.recorded, 1);

  // Changing the plan afterwards must not change what was published.
  rows[0].initiatives[0].status = 'DROPPED';
  rows[0].initiatives[0].kpis[1].actual = '3';
  assert.strictEqual(snapshot.lines[0].status, 'DONE', 'the snapshot holds');
  assert.strictEqual(snapshot.progress.recorded, 1, 'and so do its counts');

  // put the fixture back for any test that runs after this one
  rows[0].initiatives[0].status = 'DONE';
  rows[0].initiatives[0].kpis[1].actual = null;
});

test('a snapshot is plain data, so it survives being stored as JSON', () => {
  const snapshot = buildSnapshot(rows, {
    narrative: null, kind: FINAL, publishedAt: new Date('2028-09-01T00:00:00Z'),
  });
  const roundTripped = JSON.parse(JSON.stringify(snapshot));
  assert.deepStrictEqual(roundTripped, snapshot,
    'dates and everything else must already be serialisable');
});
