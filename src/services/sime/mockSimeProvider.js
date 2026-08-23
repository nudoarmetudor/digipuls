const SimeProvider = require('./simeProvider.interface');

// A small, hand-authored stand-in for what a real SIME registry export
// would contain. Deliberately includes a few schools *not* already seeded
// as DigiPuls users, so the "search SIME, then create the DigiPuls school
// record from it" flow (UC — admin/Ministry provisioning) has something
// genuinely new to find, not just re-displaying schools that already exist
// in the app.
const MOCK_REGISTRY = [
  { simeId: 'MD-CHI-014', name: 'LT Petru Zadnipru — Chișinău', address: 'mun. Chișinău', territory: 'Chișinău', enrolmentTotal: 980, studentsGrades7to12: 410, classroomsTotal: 42 },
  { simeId: 'MD-BAL-002', name: 'LT B. P. Hașdeu — Bălți', address: 'mun. Bălți', territory: 'Bălți', enrolmentTotal: 1240, studentsGrades7to12: 520, classroomsTotal: 51 },
  { simeId: 'MD-ORH-007', name: 'LT Onisifor Ghibu — Orhei', address: 'r. Orhei', territory: 'Orhei', enrolmentTotal: 640, studentsGrades7to12: 260, classroomsTotal: 28 },
  { simeId: 'MD-CAU-003', name: 'LT Alexei Mateevici — Căinari, Căușeni', address: 'r. Căușeni, s. Căinari', territory: 'Căușeni', enrolmentTotal: 310, studentsGrades7to12: 130, classroomsTotal: 16 },
  { simeId: 'MD-DRO-011', name: 'LT Mihai Eminescu — Drochia', address: 'r. Drochia', territory: 'Drochia', enrolmentTotal: 720, studentsGrades7to12: 300, classroomsTotal: 30 },
  { simeId: 'MD-FLO-004', name: 'LT Miron Costin — Florești', address: 'r. Florești', territory: 'Florești', enrolmentTotal: 210, studentsGrades7to12: 85, classroomsTotal: 12 },
  { simeId: 'MD-SNG-019', name: 'Gimnaziul "Ion Vatamanu" — Sîngera', address: 'mun. Chișinău, or. Sîngera', territory: 'Chișinău', enrolmentTotal: 480, studentsGrades7to12: 190, classroomsTotal: 22 },
  { simeId: 'MD-CIM-006', name: 'LT "Alexandru cel Bun" — Cimișlia', address: 'r. Cimișlia', territory: 'Cimișlia', enrolmentTotal: 560, studentsGrades7to12: 230, classroomsTotal: 26 },
];

class MockSimeProvider extends SimeProvider {
  async searchSchools(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return [];
    return MOCK_REGISTRY.filter(
      (s) => s.name.toLowerCase().includes(q) || s.simeId.toLowerCase().includes(q)
    );
  }

  async getSchoolBySimeId(simeId) {
    return MOCK_REGISTRY.find((s) => s.simeId === simeId) || null;
  }
}

module.exports = MockSimeProvider;
