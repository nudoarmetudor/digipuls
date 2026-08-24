const { test } = require('node:test');
const assert = require('node:assert/strict');
const { INDICATORS } = require('../src/data/indicators');
const { computeStepStatuses, finalizeReviewStatus, overallProgress } = require('../src/services/stepStatus');

function fakeCycle({ ratings = [], deviceInventory = null, networkChecklist = null } = {}) {
  return { ratings, deviceInventory, networkChecklist };
}

test('computeStepStatuses: an untouched domain is grey', () => {
  const cycle = fakeCycle();
  const statuses = computeStepStatuses(cycle);
  const domainA = statuses.find((s) => s.key === 'A');
  assert.equal(domainA.status, 'grey');
});

test('computeStepStatuses: fully rated with all evidence present is green', () => {
  const domainACodes = INDICATORS.filter((i) => i.domain === 'A').map((i) => i.code);
  const ratings = domainACodes.map((code) => ({ indicatorCode: code, level: 3, evidences: [{ id: 1 }] }));
  const statuses = computeStepStatuses(fakeCycle({ ratings }));
  assert.equal(statuses.find((s) => s.key === 'A').status, 'green');
});

test('computeStepStatuses: fully rated but missing required evidence is red, not green', () => {
  const domainACodes = INDICATORS.filter((i) => i.domain === 'A').map((i) => i.code);
  const ratings = domainACodes.map((code) => ({ indicatorCode: code, level: 3, evidences: [] }));
  const statuses = computeStepStatuses(fakeCycle({ ratings }));
  assert.equal(statuses.find((s) => s.key === 'A').status, 'red');
});

test('computeStepStatuses: partially rated is blue, not grey or green', () => {
  const domainACodes = INDICATORS.filter((i) => i.domain === 'A').map((i) => i.code);
  const ratings = [{ indicatorCode: domainACodes[0], level: 1, evidences: [] }];
  const statuses = computeStepStatuses(fakeCycle({ ratings }));
  assert.equal(statuses.find((s) => s.key === 'A').status, 'blue');
});

test('finalizeReviewStatus: some progress but not all domains green shows blue, not grey', () => {
  const domainACodes = INDICATORS.filter((i) => i.domain === 'A').map((i) => i.code);
  const ratings = domainACodes.map((code) => ({ indicatorCode: code, level: 3, evidences: [{ id: 1 }] }));
  const statuses = finalizeReviewStatus(computeStepStatuses(fakeCycle({ ratings })));
  // This is the exact ternary bug found and fixed this session — regression guard.
  assert.equal(statuses.find((s) => s.kind === 'review').status, 'blue');
});

test('finalizeReviewStatus: nothing touched at all shows grey', () => {
  const statuses = finalizeReviewStatus(computeStepStatuses(fakeCycle()));
  assert.equal(statuses.find((s) => s.kind === 'review').status, 'grey');
});

test('overallProgress: counts only indicators with a real level, not placeholder rows', () => {
  const ratings = [
    { indicatorCode: 'A1', level: 2 },
    { indicatorCode: 'A2', level: null },
  ];
  const progress = overallProgress(fakeCycle({ ratings }));
  assert.equal(progress.rated, 1);
  assert.equal(progress.total, INDICATORS.length);
});
