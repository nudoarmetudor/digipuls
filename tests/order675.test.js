const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bandFor, checkDeviceCompliance, checkNetworkCompliance, NETWORK_CHECKLIST_ITEMS } = require('../src/data/order675');

test('bandFor: boundaries land in the correct band, not the neighbor', () => {
  assert.equal(bandFor(0), '0-250');
  assert.equal(bandFor(250), '0-250');
  assert.equal(bandFor(251), '251-500');
  assert.equal(bandFor(500), '251-500');
  assert.equal(bandFor(501), '501-750');
  assert.equal(bandFor(1500), '1001-1500');
  assert.equal(bandFor(1501), '1501+');
  assert.equal(bandFor(50000), '1501+');
});

test('checkDeviceCompliance: fails when exactly one below quota, passes at quota', () => {
  const school = { enrolmentTotal: 100, classroomsTotal: 10, studentsGrades7to12: 20 };
  const short = checkDeviceCompliance(school, {
    classroomPCs: 4, interactivePanels: 5, itRoomPCs: 15,
    managementPCs: 2, methodicalCentrePCs: 2, libraryPCs: 3, printers: 1, multifunctionPrinters: 1,
  });
  assert.equal(short.compliant, false);
  const classroomCheck = short.checks.find((c) => c.key === 'classroomPCs');
  assert.equal(classroomCheck.pass, false);

  const exact = checkDeviceCompliance(school, {
    classroomPCs: 5, interactivePanels: 5, itRoomPCs: 15,
    managementPCs: 2, methodicalCentrePCs: 2, libraryPCs: 3, printers: 1, multifunctionPrinters: 1,
  });
  assert.equal(exact.compliant, true);
});

test('checkNetworkCompliance: any single unchecked item fails the whole check', () => {
  const allTrue = {};
  NETWORK_CHECKLIST_ITEMS.forEach((i) => { allTrue[i.key] = true; });
  assert.equal(checkNetworkCompliance(allTrue).compliant, true);

  const oneMissing = { ...allTrue, firewallActive: false };
  const result = checkNetworkCompliance(oneMissing);
  assert.equal(result.compliant, false);
  assert.equal(result.checks.find((c) => c.key === 'firewallActive').pass, false);
});

test('checkNetworkCompliance: null checklist fails every item, not a crash', () => {
  const result = checkNetworkCompliance(null);
  assert.equal(result.compliant, false);
  assert.equal(result.checks.every((c) => c.pass === false), true);
});

// --- equipment waiting to be written off ------------------------------------
//
// Reported from the pilot: "Trebuie inclus un compartiment în care vizualizăm
// tehnica outdated/depășită, care trebuie dată la casare. E necesar ca ele să
// nu figureze ca echipamente bune." The quota check counted everything a
// school listed, so a school owning twenty classroom PCs of which eight were
// scrap was marked compliant on twenty — the Ministry's monitor reporting a
// number the school itself would not recognise.

const SITE = { enrolmentTotal: 620, studentsGrades7to12: 260, classroomsTotal: 30 };
const ENOUGH = {
  classroomPCs: 16, interactivePanels: 16, itRoomPCs: 45, managementPCs: 5,
  methodicalCentrePCs: 4, libraryPCs: 6, printers: 3, multifunctionPrinters: 2,
};

test('scrap does not equip a classroom', () => {
  assert.ok(checkDeviceCompliance(SITE, ENOUGH).compliant, 'the baseline passes');

  // 16 held, 8 of them scrap, 15 required: 8 usable is short.
  const withScrap = checkDeviceCompliance(SITE, { ...ENOUGH, classroomPCsObsolete: 8 });
  assert.ok(!withScrap.compliant);
  const row = withScrap.checks.find((c) => c.key === 'classroomPCs');
  assert.strictEqual(row.held, 16);
  assert.strictEqual(row.obsolete, 8);
  assert.strictEqual(row.actual, 8, 'the quota is measured against what is usable');
  assert.strictEqual(row.pass, false);
});

test('the school is shown where the shortfall went', () => {
  // A bare "8/15" that disagrees with the school's own stock list is worse
  // than no figure: the three numbers have to travel together.
  const result = checkDeviceCompliance(SITE, { ...ENOUGH, classroomPCsObsolete: 8, printersObsolete: 1 });
  result.checks.forEach((c) => {
    assert.strictEqual(typeof c.held, 'number');
    assert.strictEqual(typeof c.obsolete, 'number');
    assert.strictEqual(c.actual, Math.max(0, c.held - c.obsolete));
  });
  assert.strictEqual(result.obsoleteTotal, 9, 'and a total, for a page that only has room for one');
});

test('more scrap than stock is a typo, not negative equipment', () => {
  const odd = checkDeviceCompliance(SITE, { ...ENOUGH, printers: 3, printersObsolete: 99 });
  assert.strictEqual(odd.checks.find((c) => c.key === 'printers').actual, 0);
});

test('a cycle confirmed before any of this existed keeps its verdict', () => {
  // The reason this was safe to put on a live instance: every new column
  // defaults to zero, and subtracting zero changes nothing. No school that was
  // compliant on Tuesday becomes non-compliant on Thursday without touching a
  // thing.
  const before = checkDeviceCompliance(SITE, ENOUGH);
  const after = checkDeviceCompliance(SITE, { ...ENOUGH, ...Object.fromEntries(
    Object.keys(ENOUGH).map((k) => [`${k}Obsolete`, 0]),
  ) });
  assert.strictEqual(after.compliant, before.compliant);
  assert.deepStrictEqual(after.checks.map((c) => c.actual), before.checks.map((c) => c.actual));
});

test('the school can record it, and the record is bounded', () => {
  const route = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'school.js'), 'utf8');
  assert.match(route, /\$\{f\}Obsolete/, 'the form accepts a write-off count per device');
  assert.match(route, /if \(data\[`\$\{f\}Obsolete`\] > data\[f\]\) data\[`\$\{f\}Obsolete`\] = data\[f\];/,
    'and clamps it rather than throwing away the other fifteen numbers');
});
