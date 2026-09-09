const prisma = require('../config/db');
const { INDICATORS } = require('../data/indicators');
const { TRACKS, AGREED } = require('./tracks');
// AGREED is still read by setContinuationRating below, which derives the change
// state from the previous cycle's official level.

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
  // A placeholder (unrated, level: null) row for every indicator on every
  // track, up front. Two reasons, and the first is older than tracks: without
  // rows, a brand-new school's first cycle has nothing for the rating-save
  // route to find, silently blocking the most important use case in the app.
  //
  // The second is that a missing row and an unrated row mean different things
  // on the reconciliation screen — "nobody has looked at this" versus "this
  // side has not answered" — and only actually creating them keeps the two
  // distinguishable without inventing a third state.
  await prisma.indicatorRating.createMany({
    data: INDICATORS.flatMap((ind) => TRACKS.map((track) => ({
      cycleId: cycle.id, indicatorCode: ind.code, track, level: null, changeState: null,
    }))),
  });
  return cycle;
}

/**
 * Starts a continuation cycle from a confirmed prior cycle.
 *
 * The ratings start empty, on all three tracks, exactly as a first cycle
 * does. This used to copy the prior cycle's agreed level into every track, so
 * that a school was "adjusting a shared baseline rather than re-deriving one
 * from nothing" — which sounds reasonable and quietly destroyed the two
 * things a cycle is for:
 *
 *   Both sides began holding the same number, so they never assessed
 *   independently. "The administration and the team both reached 3" was not a
 *   finding on a renewal; it was a copy. The masking that keeps the two
 *   readings apart had nothing to hide, because every parameter already had
 *   an answer on both sides the moment the cycle opened.
 *
 *   The agreed track was pre-filled too, which meant last cycle's record
 *   silently became this cycle's — a renewal could be confirmed with nobody
 *   having looked at anything. Confirmation is a signature, and it was
 *   available for free.
 *
 * The baseline is not lost: previousCycleId links the two, every parameter
 * shows last cycle's agreed level beside the picker (see the step pages), and
 * the change state — grew, maintained, decayed — is still derived from that
 * link rather than from a copied row. What changes is that somebody now has
 * to say what the level is this time.
 *
 * See DigiPuls - use case catalog.md, UC-S6.
 */
async function startContinuationCycle(schoolId) {
  const priorCycle = await prisma.assessmentCycle.findFirst({
    where: { schoolId, status: 'CONFIRMED' },
    orderBy: { cycleNumber: 'desc' },
    // The equipment data only. Last cycle's *levels* are deliberately not
    // read here any more — they are context shown beside each parameter, from
    // previousCycle, not a starting value copied into this cycle's rows.
    include: { deviceInventory: true, networkChecklist: true },
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

  // Empty, on every track — the same shape a first cycle starts in. See the
  // note above this function for why a copy of last cycle's levels is worse
  // than a blank one, and where the baseline lives instead.
  await prisma.indicatorRating.createMany({
    data: INDICATORS.flatMap((ind) => TRACKS.map((track) => ({
      cycleId: newCycle.id, indicatorCode: ind.code, track, level: null, changeState: null,
    }))),
  });

  return newCycle;
}

/**
 * Records the school's confirm/adjust decision for one indicator during a
 * continuation cycle, deriving the changeState from the level delta.
 */
async function setContinuationRating(ratingId, newLevel, comment) {
  const rating = await prisma.indicatorRating.findUnique({
    where: { id: ratingId },
    include: { cycle: { include: { previousCycle: { include: { ratings: { where: { track: AGREED } } } } } } },
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
