/* eslint-disable no-console */
const bcrypt = require('bcryptjs');
const prisma = require('../src/config/db');
const { INDICATORS } = require('../src/data/indicators');
const { bandFor } = require('../src/data/order675');

async function hash(pw) {
  return bcrypt.hash(pw, 10);
}

// Demo password for every seeded account — documented in README.md.
const DEMO_PASSWORD = 'DigiPuls2026!';

async function seedIndicators() {
  for (const ind of INDICATORS) {
    await prisma.indicator.upsert({
      where: { code: ind.code },
      update: {},
      create: {
        code: ind.code,
        domain: ind.domain,
        name: ind.name,
        description: ind.description,
        sortOrder: INDICATORS.indexOf(ind),
        levels: { create: ind.levels },
      },
    });
  }
  console.log(`Seeded ${INDICATORS.length} indicators with levels.`);
}

async function seedTerritories() {
  const names = ['Chișinău', 'Bălți', 'Orhei', 'Căușeni', 'Drochia', 'Florești', 'Cimișlia'];
  const territories = {};
  for (const name of names) {
    territories[name] = await prisma.territory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${names.length} territories.`);
  return territories;
}

// Helper to create a fully-rated CONFIRMED cycle for a school, from a
// { code: level } ratings map (unlisted indicators default to level 2) plus
// device/network data. Returns the cycle id.
async function createConfirmedCycle(schoolId, cycleNumber, { ratings, device, network, previousCycleId, changeStates = {} }) {
  const cycle = await prisma.assessmentCycle.create({
    data: {
      schoolId,
      cycleNumber,
      status: 'CONFIRMED',
      confirmedAt: new Date(),
      previousCycleId: previousCycleId || null,
      deviceInventory: { create: device },
      networkChecklist: { create: network },
    },
  });

  await Promise.all(
    INDICATORS.map((ind) => {
      const level = ratings[ind.code] ?? 2;
      return prisma.indicatorRating.create({
        data: {
          cycleId: cycle.id,
          indicatorCode: ind.code,
          level,
          changeState: changeStates[ind.code] || null,
        },
      });
    })
  );

  return cycle;
}

async function seedSchoolsAndUsers(territories) {
  // ---- School 1: LT Petru Zadnipru — Chișinău (large, high-maturity, 2 cycles) ----
  const zadnipru = await prisma.school.create({
    data: {
      name: 'LT Petru Zadnipru — Chișinău',
      simeId: 'MD-CHI-014',
      territoryId: territories['Chișinău'].id,
      address: 'mun. Chișinău',
      enrolmentTotal: 980,
      studentsGrades7to12: 410,
      classroomsTotal: 42,
      enrolmentBand: bandFor(980),
      publicDisclosureOptIn: true,
    },
  });
  const zadnipruCycle1 = await createConfirmedCycle(zadnipru.id, 1, {
    ratings: { A1: 3, A2: 3, A3: 2, A4: 3, A5: 3, B1: 3, B2: 2, B3: 3, B4: 2, B5: 3, C1: 3, C2: 2, C3: 3, C4: 2, D1: 3, D2: 3, D3: 3, D4: 2, D5: 2 },
    device: { classroomPCs: 21, interactivePanels: 21, itRoomPCs: 45, managementPCs: 6, methodicalCentrePCs: 6, libraryPCs: 7, printers: 5, multifunctionPrinters: 2 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await createConfirmedCycle(zadnipru.id, 2, {
    previousCycleId: zadnipruCycle1.id,
    ratings: { A1: 3, A2: 4, A3: 3, A4: 3, A5: 2, B1: 3, B2: 3, B3: 3, B4: 2, B5: 4, C1: 4, C2: 2, C3: 3, C4: 3, D1: 4, D2: 3, D3: 3, D4: 3, D5: 2 },
    changeStates: { A2: 'GREW', A3: 'GREW', A5: 'DECAYED', B2: 'GREW', B5: 'GREW', C1: 'GREW', C4: 'GREW', D1: 'GREW', D4: 'GREW', A1: 'MAINTAINED', A4: 'MAINTAINED', B1: 'MAINTAINED', B3: 'MAINTAINED', B4: 'MAINTAINED', C2: 'MAINTAINED', C3: 'MAINTAINED', D2: 'MAINTAINED', D3: 'MAINTAINED', D5: 'MAINTAINED' },
    device: { classroomPCs: 21, interactivePanels: 21, itRoomPCs: 45, managementPCs: 6, methodicalCentrePCs: 6, libraryPCs: 7, printers: 5, multifunctionPrinters: 2 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await prisma.user.create({
    data: { email: 'zadnipru@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT Petru Zadnipru', role: 'SCHOOL_TEAM', schoolId: zadnipru.id },
  });

  // ---- School 2: LT B. P. Hașdeu — Bălți (large, network OK, device-poor: DEVICE-donation candidate) ----
  const hasdeu = await prisma.school.create({
    data: {
      name: 'LT B. P. Hașdeu — Bălți', simeId: 'MD-BAL-002', territoryId: territories['Bălți'].id, address: 'mun. Bălți',
      enrolmentTotal: 1240, studentsGrades7to12: 520, classroomsTotal: 51, enrolmentBand: bandFor(1240),
    },
  });
  await createConfirmedCycle(hasdeu.id, 1, {
    ratings: { A1: 2, A2: 2, A3: 1, A4: 2, A5: 2, B1: 2, B2: 2, B3: 2, B4: 1, B5: 2, C1: 2, C2: 1, C3: 2, C4: 1, D1: 1, D2: 0, D3: 2, D4: 1, D5: 1 },
    device: { classroomPCs: 15, interactivePanels: 3, itRoomPCs: 45, managementPCs: 6, methodicalCentrePCs: 6, libraryPCs: 7, printers: 5, multifunctionPrinters: 2 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await prisma.user.create({
    data: { email: 'hasdeu@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT B. P. Hașdeu', role: 'SCHOOL_TEAM', schoolId: hasdeu.id },
  });

  // ---- School 3: LT Onisifor Ghibu — Orhei (network non-compliant — excluded from DEVICE matching hard floor) ----
  const ghibu = await prisma.school.create({
    data: {
      name: 'LT Onisifor Ghibu — Orhei', simeId: 'MD-ORH-007', territoryId: territories['Orhei'].id, address: 'r. Orhei',
      enrolmentTotal: 640, studentsGrades7to12: 260, classroomsTotal: 28, enrolmentBand: bandFor(640),
    },
  });
  const ghibuCycle = await createConfirmedCycle(ghibu.id, 1, {
    ratings: { A1: 2, A2: 1, A3: 1, A4: 1, A5: 2, B1: 2, B2: 2, B3: 2, B4: 2, B5: 2, C1: 1, C2: 1, C3: 1, C4: 1, D1: 0, D2: 0, D3: 1, D4: 1, D5: 1 },
    device: { classroomPCs: 8, interactivePanels: 2, itRoomPCs: 30, managementPCs: 4, methodicalCentrePCs: 4, libraryPCs: 5, printers: 2, multifunctionPrinters: 1 },
    network: { wifiWholeSchool: false, subnetsSeparated: false, wifi80211n: true, wifi80211ac: false, firewallActive: false, contentFiltering: false },
  });
  await prisma.user.create({
    data: { email: 'ghibu@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT Onisifor Ghibu', role: 'SCHOOL_TEAM', schoolId: ghibu.id },
  });
  await prisma.validationRecord.create({
    data: { cycleId: ghibuCycle.id, reviewerName: 'Territorial authority, Orhei', reviewerType: 'external_evaluator', verdict: 'agree', reliabilityNote: 'broadly_reliable', notes: 'On-site visit confirmed network non-compliance.' },
  });

  // ---- School 4: LT Alexei Mateevici — Căinari, Căușeni (small rural, high need, LOW readiness, UNVALIDATED) ----
  const cainari = await prisma.school.create({
    data: {
      name: 'LT Alexei Mateevici — Căinari, Căușeni', simeId: 'MD-CAU-003', territoryId: territories['Căușeni'].id, address: 'r. Căușeni, s. Căinari',
      enrolmentTotal: 310, studentsGrades7to12: 130, classroomsTotal: 16, enrolmentBand: bandFor(310),
    },
  });
  await createConfirmedCycle(cainari.id, 1, {
    ratings: { A1: 1, A2: 1, A3: 1, A4: 1, A5: 1, B1: 1, B2: 1, B3: 1, B4: 1, B5: 1, C1: 1, C2: 1, C3: 1, C4: 0, D1: 1, D2: 0, D3: 1, D4: 1, D5: 1 },
    device: { classroomPCs: 4, interactivePanels: 1, itRoomPCs: 45, managementPCs: 1, methodicalCentrePCs: 1, libraryPCs: 1, printers: 0, multifunctionPrinters: 0 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  // Deliberately NOT validated — demonstrates the matching engine's
  // validation split (this school will show up flagged "self-reported only").
  await prisma.user.create({
    data: { email: 'cainari@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT Alexei Mateevici', role: 'SCHOOL_TEAM', schoolId: cainari.id },
  });

  // ---- School 5: LT Mihai Eminescu — Drochia (real pilot pattern: good infra, weak pedagogy -> improves via training) ----
  const drochia = await prisma.school.create({
    data: {
      name: 'LT Mihai Eminescu — Drochia', simeId: 'MD-DRO-011', territoryId: territories['Drochia'].id, address: 'r. Drochia',
      enrolmentTotal: 720, studentsGrades7to12: 300, classroomsTotal: 30, enrolmentBand: bandFor(720),
      publicDisclosureOptIn: true,
    },
  });
  const drochiaCycle1 = await createConfirmedCycle(drochia.id, 1, {
    ratings: { A1: 2, A2: 2, A3: 2, A4: 2, A5: 2, B1: 2, B2: 2, B3: 2, B4: 1, B5: 1, C1: 2, C2: 2, C3: 2, C4: 1, D1: 2, D2: 2, D3: 2, D4: 2, D5: 2 },
    device: { classroomPCs: 15, interactivePanels: 15, itRoomPCs: 45, managementPCs: 4, methodicalCentrePCs: 4, libraryPCs: 5, printers: 3, multifunctionPrinters: 1 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await createConfirmedCycle(drochia.id, 2, {
    previousCycleId: drochiaCycle1.id,
    ratings: { A1: 2, A2: 2, A3: 2, A4: 2, A5: 2, B1: 2, B2: 2, B3: 2, B4: 1, B5: 3, C1: 3, C2: 2, C3: 3, C4: 1, D1: 2, D2: 2, D3: 2, D4: 2, D5: 2 },
    changeStates: { B5: 'GREW', C1: 'GREW', C3: 'GREW', A1: 'MAINTAINED', A2: 'MAINTAINED', A3: 'MAINTAINED', A4: 'MAINTAINED', A5: 'MAINTAINED', B1: 'MAINTAINED', B2: 'MAINTAINED', B3: 'MAINTAINED', B4: 'MAINTAINED', C2: 'MAINTAINED', C4: 'MAINTAINED', D1: 'MAINTAINED', D2: 'MAINTAINED', D3: 'MAINTAINED', D4: 'MAINTAINED', D5: 'MAINTAINED' },
    device: { classroomPCs: 15, interactivePanels: 15, itRoomPCs: 45, managementPCs: 4, methodicalCentrePCs: 4, libraryPCs: 5, printers: 3, multifunctionPrinters: 1 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await prisma.user.create({
    data: { email: 'drochia@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT Mihai Eminescu', role: 'SCHOOL_TEAM', schoolId: drochia.id },
  });

  // ---- School 6: LT Miron Costin — Florești (small, strong internal PD/mentoring — "Digital Pill" pattern) ----
  const floresti = await prisma.school.create({
    data: {
      name: 'LT Miron Costin — Florești', simeId: 'MD-FLO-004', territoryId: territories['Florești'].id, address: 'r. Florești',
      enrolmentTotal: 210, studentsGrades7to12: 85, classroomsTotal: 12, enrolmentBand: bandFor(210),
    },
  });
  const florestiCycle = await createConfirmedCycle(floresti.id, 1, {
    ratings: { A1: 2, A2: 2, A3: 3, A4: 2, A5: 2, B1: 2, B2: 3, B3: 2, B4: 1, B5: 2, C1: 3, C2: 1, C3: 4, C4: 1, D1: 1, D2: 0, D3: 1, D4: 2, D5: 1 },
    device: { classroomPCs: 6, interactivePanels: 1, itRoomPCs: 45, managementPCs: 1, methodicalCentrePCs: 1, libraryPCs: 1, printers: 0, multifunctionPrinters: 0 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await prisma.validationRecord.create({
    data: { cycleId: florestiCycle.id, reviewerName: 'Meta-mentor, DigitalAccelerator', reviewerType: 'meta_mentor', verdict: 'agree', reliabilityNote: 'broadly_reliable', notes: '"Pastila Digitală" peer micro-learning confirmed via session logs.' },
  });
  await prisma.user.create({
    data: { email: 'floresti@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT Miron Costin', role: 'SCHOOL_TEAM', schoolId: floresti.id },
  });

  // ---- School 7: LT "Alexandru cel Bun" — Cimișlia (mid-size, balanced/average profile) ----
  const cimislia = await prisma.school.create({
    data: {
      name: 'LT "Alexandru cel Bun" — Cimișlia', simeId: 'MD-CIM-006', territoryId: territories['Cimișlia'].id, address: 'r. Cimișlia',
      enrolmentTotal: 560, studentsGrades7to12: 230, classroomsTotal: 26, enrolmentBand: bandFor(560),
    },
  });
  await createConfirmedCycle(cimislia.id, 1, {
    ratings: { A1: 2, A2: 2, A3: 2, A4: 2, A5: 2, B1: 2, B2: 2, B3: 2, B4: 2, B5: 2, C1: 2, C2: 2, C3: 2, C4: 2, D1: 1, D2: 1, D3: 2, D4: 2, D5: 2 },
    device: { classroomPCs: 13, interactivePanels: 8, itRoomPCs: 45, managementPCs: 3, methodicalCentrePCs: 3, libraryPCs: 4, printers: 1, multifunctionPrinters: 1 },
    network: { wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true, wifi80211ac: true, firewallActive: true, contentFiltering: true },
  });
  await prisma.user.create({
    data: { email: 'cimislia@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — LT "Alexandru cel Bun"', role: 'SCHOOL_TEAM', schoolId: cimislia.id },
  });

  // ---- School 8: Gimnaziul Ion Vatamanu — Sîngera (freshly onboarded, DRAFT only — mid-workflow demo) ----
  const singera = await prisma.school.create({
    data: {
      name: 'Gimnaziul "Ion Vatamanu" — Sîngera', simeId: 'MD-SNG-019', territoryId: territories['Chișinău'].id, address: 'mun. Chișinău, or. Sîngera',
      enrolmentTotal: 480, studentsGrades7to12: 190, classroomsTotal: 22, enrolmentBand: bandFor(480),
    },
  });
  const singeraCycle = await prisma.assessmentCycle.create({
    data: {
      schoolId: singera.id, cycleNumber: 1, status: 'DRAFT',
      deviceInventory: { create: { classroomPCs: 5, interactivePanels: 2 } },
      networkChecklist: { create: { wifiWholeSchool: true, wifi80211n: true } },
    },
  });
  // Every indicator gets a placeholder row (matching cycleService.startFirstCycle's
  // real behaviour) — some pre-rated, the rest left null to demonstrate a
  // school genuinely mid-assessment.
  const partiallyRated = new Set(['A1', 'A2', 'B1', 'B5', 'C1', 'D1', 'D2']);
  await Promise.all(
    INDICATORS.map((ind) =>
      prisma.indicatorRating.create({
        data: { cycleId: singeraCycle.id, indicatorCode: ind.code, level: partiallyRated.has(ind.code) ? 1 : null },
      })
    )
  );
  await prisma.user.create({
    data: { email: 'singera@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Echipa digitală — Gimnaziul Ion Vatamanu', role: 'SCHOOL_TEAM', schoolId: singera.id },
  });

  console.log('Seeded 8 schools (7 confirmed + 1 in-progress) with realistic, varied data.');

  // ---- Non-school role accounts ----
  await prisma.user.create({
    data: { email: 'admin@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'DigiPuls Administrator', role: 'ADMIN' },
  });
  await prisma.user.create({
    data: { email: 'ministry@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'MEC Task Force', role: 'MINISTRY' },
  });
  await prisma.user.create({
    data: { email: 'territorial-chisinau@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Autoritatea teritorială — Chișinău', role: 'TERRITORIAL', territoryId: territories['Chișinău'].id },
  });
  await prisma.user.create({
    data: { email: 'unicef@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'UNICEF Moldova — Programme Officer', role: 'PARTNER' },
  });
  await prisma.user.create({
    data: { email: 'clasaviitorului@digipuls.md', passwordHash: await hash(DEMO_PASSWORD), name: 'Clasa Viitorului — Training Coordination', role: 'STRATEGIC_PARTNER' },
  });
  console.log('Seeded 5 non-school demo accounts (admin, ministry, territorial, partner, strategic partner).');
}

async function main() {
  console.log('Seeding DigiPuls demo data...\n');
  await seedIndicators();
  const territories = await seedTerritories();
  await seedSchoolsAndUsers(territories);
  console.log(`\nDone. All demo accounts use the password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
