/**
 * SIME integration seam.
 *
 * SIME (Sistemul Informațional de Management în Educație) is Moldova's
 * national Education Management Information System. Order 675/2024 already
 * requires schools to report ICT-equipment data into SIME, and requires
 * local education authorities to monitor that reporting — see the vault
 * note 06_Moldova_Context/Ordin 675-2024 - Standarde minime TIC.md.
 *
 * DigiPuls does NOT have live access to the real SIME API in this
 * environment. This file documents the interface a real integration would
 * need to implement, so a school-registry lookup / auto-complete feature
 * can be built against a *mock* provider now, and swapped for a *live*
 * provider later by implementing this same interface and changing
 * SIME_PROVIDER=live in .env — see simeService.js.
 *
 * A SimeProvider must implement:
 *
 *   async searchSchools(query: string): Promise<SimeSchoolRecord[]>
 *     Free-text search (by name or partial SIME ID) against the registry.
 *     Used for the admin "add school" autocomplete (UC — Ministry
 *     provisions a school and looks it up by SIME ID/name instead of
 *     typing enrolment/address data by hand).
 *
 *   async getSchoolBySimeId(simeId: string): Promise<SimeSchoolRecord|null>
 *     Exact lookup by official SIME registry ID.
 *
 * SimeSchoolRecord shape (the fields DigiPuls actually needs for
 * auto-complete — a real integration will have many more SIME fields,
 * this is deliberately the minimal subset this app consumes):
 *   {
 *     simeId: string,
 *     name: string,
 *     address: string,
 *     territory: string,           // territorial/regional authority name
 *     enrolmentTotal: number,
 *     studentsGrades7to12: number,
 *     classroomsTotal: number,
 *   }
 */

class SimeProvider {
  // eslint-disable-next-line no-unused-vars
  async searchSchools(query) {
    throw new Error('Not implemented');
  }

  // eslint-disable-next-line no-unused-vars
  async getSchoolBySimeId(simeId) {
    throw new Error('Not implemented');
  }
}

module.exports = SimeProvider;
