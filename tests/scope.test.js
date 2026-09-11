const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const { describe: describeAssignment, activeTerritoryId, territoryFilter, coversSchool } = require('../src/middleware/workspace');
const { progressSummary } = require('../src/services/stepStatus');
const { rankTrainingNeed } = require('../src/services/trainingNeed');
const { filterRows } = require('../src/services/schoolOverview');
const { INDICATORS } = require('../src/data/indicators');

// What each role can actually see. These pin the findings from the scope
// review — every one of them was a page that loaded fine and told the reader
// nothing, which is the failure mode a route test does not catch.

// ---------------------------------------------------------------------------
// District scope
// ---------------------------------------------------------------------------

const post = (over) => ({ workspace: { id: 1, role: 'META_MENTOR', territoryId: null, schoolTerritoryId: null, ...over } });

test('a district authority is scoped to its own district', () => {
  const req = post({ role: 'TERRITORIAL', territoryId: 4 });
  assert.strictEqual(activeTerritoryId(req), 4);
  assert.deepStrictEqual(territoryFilter(req), { territoryId: 4 });
});

test("a mentor's district comes from the school they support", () => {
  // This is the fix for the finding that mattered most: every meta-mentor
  // held view.regional, saw the link, and landed on an empty list, because
  // the post names a school and no district and `{territoryId: null}` means
  // IS NULL rather than "no filter".
  const req = post({ schoolId: 11, schoolTerritoryId: 7 });
  assert.strictEqual(activeTerritoryId(req), 7);
  assert.deepStrictEqual(territoryFilter(req), { territoryId: 7 });
});

test("the post's own district wins over the school's", () => {
  const req = post({ territoryId: 4, schoolId: 11, schoolTerritoryId: 7 });
  assert.strictEqual(activeTerritoryId(req), 4);
});

test('a post with no district and no school sees every district, not none', () => {
  const req = post({});
  assert.strictEqual(activeTerritoryId(req), null);
  assert.deepStrictEqual(territoryFilter(req), {},
    'an empty filter means all schools; {territoryId: null} would mean none');
});

test('a signed-out request is scoped to nothing', () => {
  assert.strictEqual(activeTerritoryId({}), null);
});

test('coversSchool refuses another district, and allows any when unscoped', () => {
  const scoped = post({ role: 'TERRITORIAL', territoryId: 4 });
  assert.ok(coversSchool(scoped, { id: 1, territoryId: 4 }));
  assert.ok(!coversSchool(scoped, { id: 2, territoryId: 9 }), 'outside the district');
  assert.ok(!coversSchool(scoped, null), 'a missing school is not covered');

  const national = post({});
  assert.ok(coversSchool(national, { id: 2, territoryId: 9 }));
});

test('describe() carries the district of the school a post supports', () => {
  const d = describeAssignment({
    id: 7, role: 'META_MENTOR', label: null, schoolId: 11, territoryId: null,
    school: { name: 'LT Boris Dînga', territoryId: 7, territory: { name: 'Criuleni' } },
    territory: null,
  });
  assert.strictEqual(d.schoolTerritoryId, 7);
  assert.strictEqual(d.schoolTerritoryName, 'Criuleni');
  assert.strictEqual(d.territoryId, null, 'the post itself is still unscoped');
});

// ---------------------------------------------------------------------------
// The district filter the Ministry dashboard was missing
// ---------------------------------------------------------------------------

const schoolRow = (id, territoryId, name) => ({
  school: { id, name, territoryId, enrolmentBand: '251-500' },
  confirmed: true, cycle: null, officialCycle: null, hasNewerDraft: false,
  domainScores: { A: 1, B: 1, C: 1, D: 1 },
});

test('the national dashboard can be filtered to one district', () => {
  const rows = [schoolRow(1, 4, 'A'), schoolRow(2, 9, 'B'), schoolRow(3, 4, 'C')];
  assert.strictEqual(filterRows(rows, { territoryId: '4' }).length, 2);
  assert.strictEqual(filterRows(rows, { territoryId: '9' }).length, 1);
});

test('no district chosen means every district', () => {
  const rows = [schoolRow(1, 4, 'A'), schoolRow(2, 9, 'B')];
  assert.strictEqual(filterRows(rows, {}).length, 2);
  assert.strictEqual(filterRows(rows, { territoryId: '' }).length, 2);
  assert.strictEqual(filterRows(rows, { territoryId: 'not-a-number' }).length, 2,
    'a nonsense value must not silently hide every school');
});

// ---------------------------------------------------------------------------
// Progress, for people supporting a school rather than filling it in
// ---------------------------------------------------------------------------

function cycleWith(levels, opts = {}) {
  return {
    id: 1, cycleNumber: 1, status: 'DRAFT',
    ratings: INDICATORS.map((ind) => ({
      indicatorCode: ind.code,
      level: levels[ind.code] === undefined ? null : levels[ind.code],
      evidences: (opts.evidenceFor || []).includes(ind.code) ? [{ id: 1 }] : [],
    })),
    deviceInventory: opts.devices ? { id: 1, cycleId: 1, desktops: 12 } : null,
    networkChecklist: opts.network || null,
  };
}

test('an untouched cycle reports nothing rated and names what is missing', () => {
  const p = progressSummary(cycleWith({}));
  assert.strictEqual(p.rated, 0);
  assert.strictEqual(p.total, INDICATORS.length);
  assert.strictEqual(p.unrated.length, INDICATORS.length);
  assert.ok(p.blockers.some((b) => b.kind === 'unrated'));
  assert.ok(p.blockers.some((b) => b.kind === 'devices'));
  assert.ok(!p.readyToConfirm);
});

test('evidence missing above Level 2 is named as a blocker, with the codes', () => {
  // The same rule routes/school.js enforces at confirmation, so the mentor's
  // page can never disagree with what the school is told.
  const levels = {};
  INDICATORS.forEach((i) => { levels[i.code] = 3; });
  const p = progressSummary(cycleWith(levels, { devices: true }));
  const evidence = p.blockers.find((b) => b.kind === 'evidence');
  assert.ok(evidence, 'a Level-3 rating with no evidence blocks confirmation');
  assert.strictEqual(evidence.codes.length, INDICATORS.length);
  assert.ok(!p.readyToConfirm);
});

test('a complete cycle reports itself ready', () => {
  const levels = {};
  INDICATORS.forEach((i) => { levels[i.code] = 1; }); // below the evidence threshold
  const p = progressSummary(cycleWith(levels, { devices: true }));
  assert.deepStrictEqual(p.blockers, []);
  assert.ok(p.readyToConfirm);
});

test('progress is not invented for a cycle that does not exist', () => {
  assert.strictEqual(progressSummary(null), null);
});

// ---------------------------------------------------------------------------
// Training-need ranking
// ---------------------------------------------------------------------------

const cycleC = (c1, c3, c4) => ({
  ratings: [
    { indicatorCode: 'C1', level: c1 },
    { indicatorCode: 'C3', level: c3 },
    { indicatorCode: 'C4', level: c4 },
  ],
});

test('ranking reads the confirmed cycle, not a newer draft', () => {
  // The bug: filtered on `confirmed` and then read `cycle`, which is the
  // latest of any status. Invisible until a school opened a second cycle.
  const rows = [{
    school: { id: 1, name: 'LT Test' },
    confirmed: true,
    officialCycle: cycleC(1, 1, 1),   // what the school actually stands behind
    cycle: cycleC(5, 5, 5),           // an unconfirmed draft claiming much more
    hasNewerDraft: true,
  }];
  const { ranked } = rankTrainingNeed(rows);
  assert.strictEqual(ranked[0].total, 3, 'must rank on the confirmed figures');
});

test('a missing rating is not a zero', () => {
  // Summing nulls as zeroes put schools that had not filled in Domain C at
  // the top of a list headed "most in need of training".
  const rows = [
    { school: { id: 1, name: 'Rated low' }, confirmed: true, officialCycle: cycleC(0, 0, 0), cycle: null },
    { school: { id: 2, name: 'Not filled in' }, confirmed: true, officialCycle: cycleC(2, null, 1), cycle: null },
  ];
  const { ranked, incomplete } = rankTrainingNeed(rows);
  assert.deepStrictEqual(ranked.map((r) => r.school.name), ['Rated low']);
  assert.deepStrictEqual(incomplete.map((r) => r.school.name), ['Not filled in']);
  assert.strictEqual(incomplete[0].reason, 'partial');
});

test('schools with no confirmed cycle are listed, not dropped', () => {
  // Half the pilot is in this state; they used to vanish from the page.
  const rows = [
    { school: { id: 1, name: 'Started' }, confirmed: false, officialCycle: null, cycle: { status: 'DRAFT' } },
    { school: { id: 2, name: 'Untouched' }, confirmed: false, officialCycle: null, cycle: null },
  ];
  const { ranked, incomplete } = rankTrainingNeed(rows);
  assert.strictEqual(ranked.length, 0);
  assert.deepStrictEqual(incomplete.map((r) => r.reason), ['in_progress', 'not_started']);
});

test('lowest capacity ranks first, and ties are stable', () => {
  const rows = ['Beta', 'Alpha'].map((name, i) => ({
    school: { id: i, name }, confirmed: true, officialCycle: cycleC(1, 1, 1), cycle: null,
  }));
  rows.push({
    school: { id: 9, name: 'Strong' }, confirmed: true, officialCycle: cycleC(4, 4, 4), cycle: null,
  });
  const { ranked } = rankTrainingNeed(rows);
  assert.deepStrictEqual(ranked.map((r) => r.school.name), ['Alpha', 'Beta', 'Strong'],
    'equal totals order by name, so the page does not reshuffle between loads');
});

// --- one person, two posts, two scopes --------------------------------------
//
// Tudor Lapp and Victoria Calistru are each a metamentor for one lyceum —
// Ghibu and Zadnipru — *and* a metacoordinator for the group of twelve those
// metamentors form. Same person, two posts. So the scope cannot belong to the
// person; it belongs to the post the tab is working in, which is exactly why
// the active post lives in the URL.

const { oversightFilter, scopedSchoolId } = require('../src/middleware/workspace');
const describeWorkspace = describeAssignment;

function onePost(role, { schoolId = null, territoryId = null, schoolTerritoryId = null } = {}) {
  return {
    workspace: describeWorkspace({
      id: 1, role, label: null, schoolId, territoryId,
      school: schoolId ? { id: schoolId, name: 'A school', territoryId: schoolTerritoryId } : null,
      territory: territoryId ? { id: territoryId, name: 'A district' } : null,
    }),
  };
}

test('a metamentor reads their own institution and no other', () => {
  const mentor = onePost('META_MENTOR', { schoolId: 3, schoolTerritoryId: 9 });
  assert.strictEqual(scopedSchoolId(mentor), 3);
  assert.deepStrictEqual(oversightFilter(mentor), { id: 3 });

  assert.ok(coversSchool(mentor, { id: 3, territoryId: 9 }), 'their own');
  assert.ok(!coversSchool(mentor, { id: 4, territoryId: 9 }),
    'not a neighbour in the same district');
  assert.ok(!coversSchool(mentor, { id: 7, territoryId: 2 }), 'and not one elsewhere');
});

test('a metacoordinator reads all twelve', () => {
  // The position is about the mentor group, not an institution, so the post
  // names none — and naming none is what makes it unscoped.
  const coordinator = onePost('META_COORDINATOR');
  assert.strictEqual(scopedSchoolId(coordinator), null);
  assert.deepStrictEqual(oversightFilter(coordinator), {});
  [3, 4, 7].forEach((id) => assert.ok(coversSchool(coordinator, { id, territoryId: 9 })));
});

test('the same person switching posts switches scope', () => {
  // The failure this prevents: scoping by account instead of by post would
  // give these two people either everything or one school in both tabs.
  const asMentor = onePost('META_MENTOR', { schoolId: 3, schoolTerritoryId: 9 });
  const asCoordinator = onePost('META_COORDINATOR');

  assert.deepStrictEqual(oversightFilter(asMentor), { id: 3 });
  assert.deepStrictEqual(oversightFilter(asCoordinator), {});
  assert.ok(!coversSchool(asMentor, { id: 11, territoryId: 4 }));
  assert.ok(coversSchool(asCoordinator, { id: 11, territoryId: 4 }));
});

test('school scope beats district scope, because it is the narrower claim', () => {
  // A metamentor's post names a school and therefore also sits in that
  // school's district. Reading the whole district would be wider than the
  // position carries.
  const mentor = onePost('META_MENTOR', { schoolId: 3, schoolTerritoryId: 9 });
  assert.deepStrictEqual(oversightFilter(mentor), { id: 3 });

  // A territorial agency names a district and no school, and keeps it.
  const agency = onePost('TERRITORIAL', { territoryId: 9 });
  assert.deepStrictEqual(oversightFilter(agency), { territoryId: 9 });
});

test('every oversight listing is scoped, downloads included', () => {
  // A CSV that carried more rows than the page it came from would be the leak
  // the page prevents.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'ministry.js'), 'utf8');
  const calls = source.match(/schoolsWithLatestCycle\([^)]*\)/g) || [];
  assert.ok(calls.length >= 3, 'dashboard, export and compliance all list schools');
  calls.forEach((c) => assert.match(c, /oversightFilter\(req\)/, `unscoped listing: ${c}`));

  // And the detail page refuses a school outside the scope.
  assert.match(source, /if \(!coversSchool\(req, school\)\)/);
});

// --- sharing the parameters out ---------------------------------------------

test('delegation records who took what, and locks nobody out', () => {
  // "delegarea subseturilor de indicatori către diferite persoane din echipa
  // școlii". The thing to get wrong here would be to make it a permission:
  // the two tracks rest on each side rating all nineteen independently, and a
  // lock would strand a whole domain the week its owner is off sick.
  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
  const model = schema.slice(schema.indexOf('model IndicatorAssignment'));

  assert.match(model, /@@unique\(\[cycleId, indicatorCode, userId\]\)/,
    'several people may share a parameter — one per side, usually');
  assert.match(model, /assignedById/, 'and who did the delegating is on the row');

  const route = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'school.js'), 'utf8');
  const block = route.slice(route.indexOf("router.post('/cycles/:id/delegation'"));
  const post = block.slice(0, block.indexOf('\n});'));

  // Only the principal and the deputy share the work out...
  assert.match(post, /requireCapability\('school\.manage'\)/);
  // ...and only among their own school's people.
  assert.match(post, /allowed\.has\(n\)/,
    'an id typed into the form must reach nobody outside this school');

  // Rebuilt wholesale, because an un-ticked parameter arrives as an absent key
  // rather than an empty one: diffing would make un-assigning impossible.
  assert.match(post, /deleteMany\(\{ where: \{ cycleId: cycle\.id \} \}\)/);

  // And nothing anywhere refuses a rating because of who it was assigned to.
  const ratingRoute = route.slice(route.indexOf("router.post('/cycles/:id/ratings/:code'"));
  assert.ok(!/indicatorAssignment/i.test(ratingRoute.slice(0, 2000)),
    'recording a level must not consult the split');
});
