const test = require('node:test');
const assert = require('node:assert');

const {
  ADMINISTRATION, TEAM, AGREED, TRACKS, WORKING_TRACKS,
  trackForRole, compare, reconciliation, outstanding,
} = require('../src/services/tracks');

// The administration and the team assess independently and neither sees the
// other while doing it. A level both sides reached separately means something
// a level negotiated in one room does not — so the value of all this rests on
// the two readings staying genuinely apart until someone reconciles them.

test('which track you write to follows from your position', () => {
  assert.strictEqual(trackForRole('SCHOOL_PRINCIPAL'), ADMINISTRATION);
  assert.strictEqual(trackForRole('SCHOOL_DEPUTY'), ADMINISTRATION);
  assert.strictEqual(trackForRole('SCHOOL_MENTOR'), TEAM);

  // Nobody outside the school takes part in the assessment. A metamentor
  // watches it; the ministry reads the result.
  ['META_MENTOR', 'META_COORDINATOR', 'MINISTRY', 'TERRITORIAL', 'PARTNER',
    'STRATEGIC_PARTNER', 'ADMIN'].forEach((role) => {
    assert.strictEqual(trackForRole(role), null, `${role} should write to no track`);
  });
});

test('nobody writes to both working tracks', () => {
  // The whole design fails if one person can fill in both sides.
  const written = ['SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY', 'SCHOOL_MENTOR'].map(trackForRole);
  written.forEach((t) => assert.ok(WORKING_TRACKS.includes(t)));
  assert.ok(!written.includes(AGREED), 'the agreed value is recorded, not assessed');
});

test('the agreed track is never one a position writes to directly', () => {
  assert.deepStrictEqual(TRACKS, [ADMINISTRATION, TEAM, AGREED]);
  assert.deepStrictEqual(WORKING_TRACKS, [ADMINISTRATION, TEAM]);
});

// --- comparing the two readings --------------------------------------------

test('silence is not agreement', () => {
  // The failure this prevents: one side leaves a parameter blank, the other
  // answers, and the software calls it consensus.
  assert.strictEqual(compare(3, null).state, 'incomplete');
  assert.strictEqual(compare(null, 3).state, 'incomplete');
  assert.strictEqual(compare(null, null).state, 'empty');
  assert.strictEqual(compare(3, 3).state, 'agree');
});

test('a gap is reported with its size', () => {
  assert.deepStrictEqual(compare(4, 2), { state: 'differ', gap: 2 });
  assert.deepStrictEqual(compare(1, 5), { state: 'differ', gap: 4 });
  assert.deepStrictEqual(compare(3, 3), { state: 'agree', gap: 0 });
});

test('level 0 is an answer, not a blank', () => {
  // 0 is a real level on this instrument — "below the floor" — and treating it
  // as missing would hide a genuine disagreement about a genuine finding.
  assert.strictEqual(compare(0, 0).state, 'agree');
  assert.strictEqual(compare(0, 2).state, 'differ');
  assert.strictEqual(compare(0, null).state, 'incomplete');
});

// --- folding a cycle into one row per parameter ----------------------------

const INDICATORS = [
  { code: 'A1', name: 'Vision' },
  { code: 'A2', name: 'Leadership' },
  { code: 'B1', name: 'Infrastructure' },
];

function rows(spec) {
  const out = [];
  Object.entries(spec).forEach(([code, byTrack]) => {
    Object.entries(byTrack).forEach(([track, level]) => {
      out.push({ indicatorCode: code, track, level });
    });
  });
  return out;
}

test('the three readings of a parameter sit side by side', () => {
  const result = reconciliation(rows({
    A1: { ADMINISTRATION: 4, TEAM: 2, AGREED: 3 },
    A2: { ADMINISTRATION: 1, TEAM: 1, AGREED: null },
    B1: { ADMINISTRATION: null, TEAM: 5, AGREED: null },
  }), INDICATORS);

  assert.strictEqual(result.length, 3, 'one row per parameter, whatever the tracks hold');

  const [a1, a2, b1] = result;
  assert.deepStrictEqual(
    [a1.administrationLevel, a1.teamLevel, a1.agreedLevel], [4, 2, 3]);
  assert.strictEqual(a1.state, 'differ');
  assert.strictEqual(a1.gap, 2);
  assert.ok(a1.settled, 'an agreed level was recorded');

  assert.strictEqual(a2.state, 'agree');
  assert.ok(!a2.settled, 'both sides saying 1 is not the same as recording 1');

  assert.strictEqual(b1.state, 'incomplete');
});

test('the agreed level can be neither of the two proposed', () => {
  // The point of discussing a gap is that the answer is not forced to be one
  // of the numbers that caused it.
  const [row] = reconciliation(
    rows({ A1: { ADMINISTRATION: 5, TEAM: 1, AGREED: 3 } }), [INDICATORS[0]]);
  assert.strictEqual(row.agreedLevel, 3);
  assert.ok(row.settled);
});

test('a parameter nobody has touched is distinguishable from a settled one', () => {
  const result = reconciliation([], INDICATORS);
  result.forEach((r) => {
    assert.strictEqual(r.state, 'empty');
    assert.ok(!r.settled);
    assert.strictEqual(r.agreedLevel, null);
  });
});

// --- what blocks confirmation ----------------------------------------------

test('confirmation is blocked by anything without an agreed level', () => {
  const result = reconciliation(rows({
    A1: { ADMINISTRATION: 4, TEAM: 2, AGREED: 3 },
    A2: { ADMINISTRATION: 1, TEAM: 3, AGREED: null },
    B1: { ADMINISTRATION: 2, TEAM: null, AGREED: null },
  }), INDICATORS);
  const open = outstanding(result);

  assert.deepStrictEqual(open.unsettled, ['A2', 'B1'],
    'an agreed level is what closes a parameter, not the two sides matching');

  // "Differing" and "unsettled" are separate questions, and A1 is why: the two
  // sides read it 4 and 2, and the principal recorded 3. The disagreement
  // happened and stays on the record; it just no longer blocks anything.
  assert.deepStrictEqual(open.differing, ['A1', 'A2']);
  assert.ok(!open.unsettled.includes('A1'), 'a settled disagreement is not outstanding');
  assert.deepStrictEqual(open.incomplete, ['B1']);
});

test('everything settled means nothing outstanding', () => {
  const result = reconciliation(rows({
    A1: { ADMINISTRATION: 4, TEAM: 2, AGREED: 3 },
    A2: { ADMINISTRATION: 1, TEAM: 1, AGREED: 1 },
    B1: { ADMINISTRATION: 0, TEAM: 0, AGREED: 0 },
  }), INDICATORS);
  const open = outstanding(result);

  assert.deepStrictEqual(open.unsettled, []);
  // A recorded disagreement stays visible even once it is settled — the row
  // says the two sides differed and what was agreed anyway.
  assert.deepStrictEqual(open.differing, ['A1']);
});
