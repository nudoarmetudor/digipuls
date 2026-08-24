const { test } = require('node:test');
const assert = require('node:assert/strict');
const { filterRows, selectOfficialAndCurrentCycle } = require('../src/services/schoolOverview');

test('selectOfficialAndCurrentCycle: a newer draft never hides the last confirmed cycle', () => {
  const cycles = [
    { id: 1, cycleNumber: 1, status: 'CONFIRMED' },
    { id: 2, cycleNumber: 2, status: 'DRAFT' },
  ];
  const { currentCycle, officialCycle, hasNewerDraft } = selectOfficialAndCurrentCycle(cycles);
  assert.equal(currentCycle.id, 2);
  assert.equal(officialCycle.id, 1); // this is the bug the review flagged — must stay the confirmed one
  assert.equal(hasNewerDraft, true);
});

test('selectOfficialAndCurrentCycle: no confirmed cycle at all -> officialCycle is null, not the draft', () => {
  const cycles = [{ id: 5, cycleNumber: 1, status: 'DRAFT' }];
  const { currentCycle, officialCycle, hasNewerDraft } = selectOfficialAndCurrentCycle(cycles);
  assert.equal(currentCycle.id, 5);
  assert.equal(officialCycle, null);
  assert.equal(hasNewerDraft, false);
});

test('selectOfficialAndCurrentCycle: latest cycle itself confirmed -> no "newer draft" flag', () => {
  const cycles = [
    { id: 1, cycleNumber: 1, status: 'CONFIRMED' },
    { id: 2, cycleNumber: 2, status: 'CONFIRMED' },
  ];
  const { officialCycle, hasNewerDraft } = selectOfficialAndCurrentCycle(cycles);
  assert.equal(officialCycle.id, 2);
  assert.equal(hasNewerDraft, false);
});

function fakeRow(overrides) {
  return {
    school: { name: 'Test School', enrolmentBand: '0-250', enrolmentTotal: 200, territory: null },
    cycle: { status: 'CONFIRMED' },
    confirmed: true,
    domainScores: { A: 3, B: 2, C: 4, D: 1 },
    deviceCompliance: { compliant: true },
    networkCompliance: { compliant: true },
    ...overrides,
  };
}

test('filterRows: band filter is exact-match, not substring', () => {
  const rows = [fakeRow({ school: { name: 'A', enrolmentBand: '0-250' } }), fakeRow({ school: { name: 'B', enrolmentBand: '251-500' } })];
  const out = filterRows(rows, { band: '0-250' });
  assert.equal(out.length, 1);
  assert.equal(out[0].school.name, 'A');
});

test('filterRows: compliance=gap only includes confirmed schools with a real gap', () => {
  const rows = [
    fakeRow({ confirmed: true, deviceCompliance: { compliant: false }, networkCompliance: { compliant: true } }),
    fakeRow({ confirmed: true, deviceCompliance: { compliant: true }, networkCompliance: { compliant: true } }),
    fakeRow({ confirmed: false, deviceCompliance: null, networkCompliance: null }),
  ];
  const out = filterRows(rows, { compliance: 'gap' });
  assert.equal(out.length, 1);
});

test('filterRows: minA excludes schools without a domain score rather than crashing', () => {
  const rows = [fakeRow({ domainScores: null }), fakeRow({ domainScores: { A: 3, B: 1, C: 1, D: 1 } })];
  const out = filterRows(rows, { minA: '2' });
  assert.equal(out.length, 1);
});
