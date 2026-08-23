// Order No. 675/2024 (MER) — minimum ICT equipment standards.
// Source: MDSF vault, 06_Moldova_Context/Ordin 675-2024 - Standarde minime TIC.md
// This is the real, binding regulation that defines D1/D2's Level-0 floor —
// see Annex A v2, indicators D1 and D2, "narrated explicitly" design.

const ENROLMENT_BANDS = [
  { key: '0-250', min: 0, max: 250 },
  { key: '251-500', min: 251, max: 500 },
  { key: '501-750', min: 501, max: 750 },
  { key: '751-1000', min: 751, max: 1000 },
  { key: '1001-1500', min: 1001, max: 1500 },
  { key: '1501+', min: 1501, max: Infinity },
];

function bandFor(enrolmentTotal) {
  const band = ENROLMENT_BANDS.find((b) => enrolmentTotal >= b.min && enrolmentTotal <= b.max);
  return band ? band.key : '0-250';
}

// Annex 2 quotas, indexed by band key. Management/methodical-centre/library
// PCs and printers scale step-wise with the band, per the source table.
const QUOTAS_BY_BAND = {
  '0-250':     { managementPCs: 2, methodicalCentrePCs: 2, libraryPCs: 3, printers: 1, multifunctionPrinters: 1 },
  '251-500':   { managementPCs: 3, methodicalCentrePCs: 3, libraryPCs: 4, printers: 1, multifunctionPrinters: 1 },
  '501-750':   { managementPCs: 4, methodicalCentrePCs: 4, libraryPCs: 5, printers: 3, multifunctionPrinters: 1 },
  '751-1000':  { managementPCs: 5, methodicalCentrePCs: 5, libraryPCs: 6, printers: 3, multifunctionPrinters: 1 },
  '1001-1500': { managementPCs: 6, methodicalCentrePCs: 6, libraryPCs: 7, printers: 5, multifunctionPrinters: 2 },
  '1501+':     { managementPCs: 7, methodicalCentrePCs: 7, libraryPCs: 8, printers: 7, multifunctionPrinters: 3 },
};

// Sizing-rule helpers (Annex 2 footnotes)
function classroomsRequiringEquipment(classroomsTotal) {
  return Math.ceil(classroomsTotal * 0.5);
}

function itRoomsRequired(studentsGrades7to12, maxClassSize = 15) {
  const perRoom = Math.min(15, maxClassSize || 15);
  const raw = studentsGrades7to12 / perRoom;
  if (raw <= 30 / 15) return 1; // <=30 students -> 1 room (using the 15-per-room reference)
  if (studentsGrades7to12 <= 30) return 1;
  if (studentsGrades7to12 <= 60) return 2;
  return 3;
}

/**
 * Checks a school's device inventory against Order 675 Annex 2's numeric
 * quotas for its enrolment band. Returns a structured result — every
 * requirement checked individually, per Annex A v2's design note that a
 * school must be shown *which* requirement failed, not just "non-compliant".
 */
function checkDeviceCompliance({ enrolmentTotal, classroomsTotal, studentsGrades7to12 }, inventory) {
  const band = bandFor(enrolmentTotal);
  const quotas = QUOTAS_BY_BAND[band];
  const requiredClassroomDevices = classroomsRequiringEquipment(classroomsTotal || 0);
  const requiredItRooms = itRoomsRequired(studentsGrades7to12 || 0);
  const requiredItRoomPCs = requiredItRooms * 15;

  const checks = [
    { key: 'classroomPCs', label: 'Classroom PCs/laptops (≥50% of classrooms equipped)', required: requiredClassroomDevices, actual: inventory.classroomPCs },
    { key: 'interactivePanels', label: 'Interactive panels (1 per equipped classroom)', required: requiredClassroomDevices, actual: inventory.interactivePanels },
    { key: 'itRoomPCs', label: `IT-room PCs (${requiredItRooms} room(s) × 15)`, required: requiredItRoomPCs, actual: inventory.itRoomPCs },
    { key: 'managementPCs', label: 'Management PCs/laptops', required: quotas.managementPCs, actual: inventory.managementPCs },
    { key: 'methodicalCentrePCs', label: 'Methodical-centre PCs/laptops', required: quotas.methodicalCentrePCs, actual: inventory.methodicalCentrePCs },
    { key: 'libraryPCs', label: 'Library PCs/AiOs', required: quotas.libraryPCs, actual: inventory.libraryPCs },
    { key: 'printers', label: 'Printers', required: quotas.printers, actual: inventory.printers },
    { key: 'multifunctionPrinters', label: 'Multifunction printers', required: quotas.multifunctionPrinters, actual: inventory.multifunctionPrinters },
  ].map((c) => ({ ...c, pass: (c.actual || 0) >= c.required }));

  return {
    band,
    compliant: checks.every((c) => c.pass),
    checks,
  };
}

const NETWORK_CHECKLIST_ITEMS = [
  { key: 'wifiWholeSchool', label: 'Whole-school WiFi/LAN coverage' },
  { key: 'subnetsSeparated', label: '≥2–3 separated, password-protected subnets (Administration/Teachers, Students, Guest)' },
  { key: 'wifi80211n', label: '802.11n WiFi standard (40MHz, 600Mbps, 2.4+5GHz)' },
  { key: 'wifi80211ac', label: '802.11ac WiFi standard (up to 160MHz, 1Gbps, 5GHz)' },
  { key: 'firewallActive', label: 'Active firewall' },
  { key: 'contentFiltering', label: 'Content filtering for the student network' },
];

function checkNetworkCompliance(networkChecklist) {
  const checks = NETWORK_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    pass: !!(networkChecklist && networkChecklist[item.key]),
  }));
  return { compliant: checks.every((c) => c.pass), checks };
}

module.exports = {
  ENROLMENT_BANDS,
  QUOTAS_BY_BAND,
  NETWORK_CHECKLIST_ITEMS,
  bandFor,
  checkDeviceCompliance,
  checkNetworkCompliance,
};
