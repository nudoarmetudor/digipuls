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

// --- the two readings stay apart --------------------------------------------
//
// This is the property the whole design rests on, and until now it was only
// written down. The reconciliation screen put both columns side by side and
// nothing stopped a mentor opening it on day one and copying the
// administration's answers into their own — which is precisely the outcome
// two tracks exist to prevent.

const { maskForTrack } = require('../src/services/tracks');

const IND = [{ code: 'A1' }, { code: 'A2' }, { code: 'A3' }];

function rowsFrom(pairs) {
  const ratings = [];
  pairs.forEach(([code, admin, team]) => {
    if (admin !== null) ratings.push({ indicatorCode: code, track: ADMINISTRATION, level: admin });
    if (team !== null) ratings.push({ indicatorCode: code, track: TEAM, level: team });
  });
  return reconciliation(ratings, IND);
}

test('you cannot read the other side until you have answered yourself', () => {
  // The administration has answered all three; the team has answered only A1.
  const rows = rowsFrom([['A1', 4, 1], ['A2', 3, null], ['A3', 5, null]]);
  const asTeam = maskForTrack(rows, TEAM);

  // A1: both sides answered, so both are visible and the gap is the point.
  assert.strictEqual(asTeam[0].administrationLevel, 4);
  assert.strictEqual(asTeam[0].teamLevel, 1);
  assert.strictEqual(asTeam[0].state, 'differ');
  assert.strictEqual(asTeam[0].gap, 3);
  assert.ok(!asTeam[0].hidden);

  // A2 and A3: the team has not answered, so the administration's level is
  // not theirs to read yet.
  [1, 2].forEach((i) => {
    assert.strictEqual(asTeam[i].administrationLevel, null, 'the other side is hidden');
    assert.ok(asTeam[i].hidden);
    // The state and the gap would say it just as loudly.
    assert.strictEqual(asTeam[i].state, 'hidden');
    assert.strictEqual(asTeam[i].gap, null);
  });
});

test('the rule is symmetric — the principal is masked the same way', () => {
  const rows = rowsFrom([['A1', null, 2], ['A2', 3, 3], ['A3', null, null]]);
  const asAdministration = maskForTrack(rows, ADMINISTRATION);

  assert.strictEqual(asAdministration[0].teamLevel, null, 'the team is hidden on A1');
  assert.ok(asAdministration[0].hidden);
  assert.strictEqual(asAdministration[1].teamLevel, 3, 'and visible on A2, which both answered');
  // Nobody has answered A3, so there is nothing to hide and nothing to reveal.
  assert.ok(asAdministration[2].hidden);
});

test('level 0 is an answer, and unmasks the other column', () => {
  // The trap: `if (!row.teamLevel)` would treat a recorded 0 as no answer and
  // keep the other side hidden from someone who has in fact answered.
  const rows = rowsFrom([['A1', 4, 0]]);
  assert.strictEqual(maskForTrack(rows, TEAM)[0].administrationLevel, 4);
  assert.ok(!maskForTrack(rows, TEAM)[0].hidden);
});

test('someone who is not one of the two sides sees everything', () => {
  // An administrator working inside the school writes the agreed record, not
  // a side, and is outside the process the masking protects.
  const rows = rowsFrom([['A1', 4, null]]);
  assert.strictEqual(maskForTrack(rows, AGREED)[0].administrationLevel, 4);
  assert.strictEqual(maskForTrack(rows, null)[0].administrationLevel, 4);
});

test('masking does not touch the agreed record or the counts', () => {
  const ratings = [
    { indicatorCode: 'A1', track: ADMINISTRATION, level: 4 },
    { indicatorCode: 'A1', track: AGREED, level: 4 },
  ];
  const rows = reconciliation(ratings, IND);
  const asTeam = maskForTrack(rows, TEAM);
  assert.strictEqual(asTeam[0].agreedLevel, 4, 'what the school settled on is the record');
  assert.ok(asTeam[0].settled);
  // outstanding() is computed from the unmasked rows in the route; check it
  // still describes the school rather than the viewer.
  assert.deepStrictEqual(outstanding(rows).unsettled, ['A2', 'A3']);
});

// --- a renewal is a new assessment, not a copy of the last one --------------

const fsMod = require('node:fs');
const pathMod = require('node:path');

test('a continuation cycle starts empty on every track', () => {
  // It used to copy the previous cycle's agreed level into all three tracks,
  // which destroyed both things a cycle is for. Both sides began holding the
  // same number, so "the administration and the team both reached 3" was a
  // copy rather than a finding — and the masking that keeps the two readings
  // apart had nothing to hide, because every parameter already had an answer
  // on both sides the moment the cycle opened. The agreed track was pre-filled
  // too, so a renewal could be confirmed with nobody having looked at
  // anything: a signature available for free.
  const source = fsMod.readFileSync(
    pathMod.join(__dirname, '..', 'src', 'services', 'cycleService.js'), 'utf8');

  const fn = source.slice(source.indexOf('async function startContinuationCycle'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  assert.match(body, /level: null/,
    'a renewal must start unrated, like a first cycle');
  assert.ok(!/level: prior/.test(body),
    'no track may be seeded from the previous cycle');

  // The baseline is not lost — it is a link, not a copy. previousCycleId is
  // what shows last cycle's level beside each parameter and what
  // setContinuationRating derives grew/maintained/decayed from.
  assert.match(body, /previousCycleId: priorCycle\.id/);

  // Equipment counts are still carried forward: they are inventory, not a
  // judgement, and retyping eight numbers proves nothing.
  assert.match(body, /deviceInventory: \{/);
  assert.match(body, /networkChecklist: \{/);
});

test('the change state still comes from the previous cycle, not from a copy', () => {
  const source = fsMod.readFileSync(
    pathMod.join(__dirname, '..', 'src', 'services', 'cycleService.js'), 'utf8');
  const fn = source.slice(source.indexOf('async function setContinuationRating'));
  assert.match(fn, /previousCycle: \{ include: \{ ratings: \{ where: \{ track: AGREED \}/,
    'grew/maintained/decayed is measured against last cycle’s official record');
});

test('an empty renewal cannot be confirmed by doing nothing', () => {
  // The consequence that matters. With all three tracks blank, every parameter
  // is unsettled, and outstanding() is what the confirm route checks.
  const rows = reconciliation([], IND);
  assert.deepStrictEqual(outstanding(rows).unsettled, ['A1', 'A2', 'A3'],
    'nothing is agreed until somebody agrees it');
  assert.deepStrictEqual(outstanding(rows).untouched, ['A1', 'A2', 'A3']);
});
