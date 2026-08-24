const { test } = require('node:test');
const assert = require('node:assert/strict');
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
