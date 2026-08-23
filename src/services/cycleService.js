const prisma = require('../config/db');
const { INDICATORS } = require('../data/indicators');

/**
 * Starts a school's first assessment cycle: one draft IndicatorRating per
 * indicator (level null == unrated yet), plus empty device/network records
 * to fill in. See DigiPuls - use case catalog.md, UC-S1.
 */
async function startFirstCycle(schoolId) {
  const cycle = await prisma.assessmentCycle.create({
    data: {
      schoolId,
      cycleNumber: 1,
      status: 'DRAFT',
      deviceInventory: { create: {} },
      networkChecklist: { create: {} },
    },
  });
  // Create a placeholder (unrated, level: null) row for every indicator up
  // front. Without this, a brand-new school's very first cycle would have
  // no IndicatorRating rows at all, and the rating-save route (which looks
  // up an existing row by indicatorCode) would have nothing to find —
  // silently blocking the single most important use case in the app.
  await Promise.all(
    INDICATORS.map((ind) =>
      prisma.indicatorRating.create({
        data: { cycleId: cycle.id, indicatorCode: ind.code, level: null, changeState: null },
      })
    )
  );
  return cycle;
}

/**
 * Starts a continuation cycle from a confirmed prior cycle: pre-populates
 * every indicator with the prior cycle's level as the starting point, so
 * the school is confirming/adjusting, not starting from a blank form.
 * See DigiPuls - use case catalog.md, UC-S6, and end-to-end process flows,
 * Process 2 — this is the piece flagged as "the single largest undesigned
 * piece of the tool" in MDSF tool - requirements bridge.md, now built.
 */
async function startContinuationCycle(schoolId) {
  const priorCycle = await prisma.assessmentCycle.findFirst({
    where: { schoolId, status: 'CONFIRMED' },
    orderBy: { cycleNumber: 'desc' },
    include: { ratings: true, deviceInventory: true, networkChecklist: true },
  });
  if (!priorCycle) {
    throw new Error('No confirmed prior cycle to continue from — use startFirstCycle instead.');
  }

  const newCycle = await prisma.assessmentCycle.create({
    data: {
      schoolId,
      cycleNumber: priorCycle.cycleNumber + 1,
      status: 'DRAFT',
      previousCycleId: priorCycle.id,
      // Carry forward device/network data as the starting point — the
      // school edits it if equipment changed, rather than re-entering
      // everything from scratch.
      deviceInventory: {
        create: priorCycle.deviceInventory
          ? {
              classroomPCs: priorCycle.deviceInventory.classroomPCs,
              interactivePanels: priorCycle.deviceInventory.interactivePanels,
              itRoomPCs: priorCycle.deviceInventory.itRoomPCs,
              managementPCs: priorCycle.deviceInventory.managementPCs,
              methodicalCentrePCs: priorCycle.deviceInventory.methodicalCentrePCs,
              libraryPCs: priorCycle.deviceInventory.libraryPCs,
              printers: priorCycle.deviceInventory.printers,
              multifunctionPrinters: priorCycle.deviceInventory.multifunctionPrinters,
            }
          : {},
      },
      networkChecklist: {
        create: priorCycle.networkChecklist
          ? {
              wifiWholeSchool: priorCycle.networkChecklist.wifiWholeSchool,
              subnetsSeparated: priorCycle.networkChecklist.subnetsSeparated,
              wifi80211n: priorCycle.networkChecklist.wifi80211n,
              wifi80211ac: priorCycle.networkChecklist.wifi80211ac,
              firewallActive: priorCycle.networkChecklist.firewallActive,
              contentFiltering: priorCycle.networkChecklist.contentFiltering,
            }
          : {},
      },
    },
  });

  // Pre-populate each indicator's rating with the prior level as the
  // starting point. changeState stays null until the team actively
  // confirms maintained/grew/decayed for it (see routes/assessment.js).
  const priorByIndicator = new Map(priorCycle.ratings.map((r) => [r.indicatorCode, r]));
  await Promise.all(
    INDICATORS.map((ind) => {
      const prior = priorByIndicator.get(ind.code);
      return prisma.indicatorRating.create({
        data: {
          cycleId: newCycle.id,
          indicatorCode: ind.code,
          level: prior ? prior.level : 0,
          changeState: null,
        },
      });
    })
  );

  return newCycle;
}

/**
 * Records the school's confirm/adjust decision for one indicator during a
 * continuation cycle, deriving the changeState from the level delta.
 */
async function setContinuationRating(ratingId, newLevel, comment) {
  const rating = await prisma.indicatorRating.findUnique({
    where: { id: ratingId },
    include: { cycle: { include: { previousCycle: { include: { ratings: true } } } } },
  });
  if (!rating) throw new Error('Rating not found');

  let changeState = null;
  if (rating.cycle.previousCycle) {
    const priorRating = rating.cycle.previousCycle.ratings.find(
      (r) => r.indicatorCode === rating.indicatorCode
    );
    if (priorRating) {
      if (newLevel > priorRating.level) changeState = 'GREW';
      else if (newLevel < priorRating.level) changeState = 'DECAYED';
      else changeState = 'MAINTAINED';
    }
  }

  return prisma.indicatorRating.update({
    where: { id: ratingId },
    data: { level: newLevel, changeState, comment: comment || null },
  });
}

module.exports = { startFirstCycle, startContinuationCycle, setContinuationRating };
