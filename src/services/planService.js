// The DigiPlan: what the school will hold, what it will advance, and how.
//
// The plan starts from all nineteen parameters, each carrying the level the
// school agreed in its confirmed assessment. For each one there is a single
// choice — advance to a named level, or maintain the current one — and
// maintain is the default, because staying where you are is the commitment a
// school makes by not choosing otherwise. A school advancing three parameters
// is also committing to hold sixteen, which is the honest picture of what two
// years involves.
//
// Choosing a target produces requirements automatically, from the progression
// model the instrument already carries: for each parameter and level, a
// description and whichever engagement, frequency and evidence benchmarks that
// level defines. Nothing is invented here. Those requirements are general by
// design — they say what level 4 means, not what this school must do on
// Tuesday — and closing that gap is the school's own work, written as
// initiatives.

const prisma = require('../config/db');
const { AGREED } = require('./tracks');

const ADVANCE = 'ADVANCE';
const MAINTAIN = 'MAINTAIN';
const INTENTS = [MAINTAIN, ADVANCE];

const INITIATIVE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DROPPED'];

// A DigiPlan runs two years, with a report at the halfway point.
const PLAN_YEARS = 2;

/**
 * Opens the plan for a confirmed cycle: one row per parameter, at the level the
 * school agreed, intending to maintain it.
 *
 * Idempotent. Opening a plan that exists returns it untouched rather than
 * resetting anyone's choices — the button is on a page a principal may reload.
 */
async function openPlan(cycle) {
  const existing = await prisma.developmentPlan.findUnique({
    where: { cycleId: cycle.id },
    include: { priorities: true },
  });
  if (existing) return existing;

  const agreed = await prisma.indicatorRating.findMany({
    where: { cycleId: cycle.id, track: AGREED },
  });
  const levelOf = new Map(agreed.map((r) => [r.indicatorCode, r.level]));

  const startsOn = new Date();
  const endsOn = new Date(startsOn);
  endsOn.setFullYear(endsOn.getFullYear() + PLAN_YEARS);

  return prisma.developmentPlan.create({
    data: {
      cycleId: cycle.id,
      startsOn,
      endsOn,
      priorities: {
        create: agreed.map((r) => ({
          indicatorCode: r.indicatorCode,
          intent: MAINTAIN,
          // A parameter with no agreed level cannot happen — a cycle cannot be
          // confirmed until every one has one — but a plan built on undefined
          // would be worse than one built on zero.
          currentLevel: levelOf.get(r.indicatorCode) ?? 0,
          targetLevel: levelOf.get(r.indicatorCode) ?? 0,
        })),
      },
    },
    include: { priorities: true },
  });
}

/**
 * What reaching a level means, in the reader's own language.
 *
 * Read from the localised instrument data rather than the database: the level
 * descriptions exist in all three languages there, and a school reading its own
 * requirements in English would be a poor way to explain what it has to do.
 *
 * @param {object} indicator one entry of getIndicatorData(lang).INDICATORS
 * @param {number} level
 */
function requirementsFor(indicator, level) {
  const levels = indicator && Array.isArray(indicator.levels) ? indicator.levels : [];
  const found = levels.find((l) => l.level === level) || levels[level] || null;
  if (!found) return null;

  // Benchmarks are defined for some levels and not others. Returning only the
  // ones that exist keeps the page from showing empty headings that look like
  // missing data rather than a level that simply does not set that bar.
  const benchmarks = [
    ['engagement', found.engagementBenchmark],
    ['frequency', found.frequencyBenchmark],
    ['evidence', found.evidenceBenchmark],
  ].filter(([, value]) => value).map(([key, value]) => ({ key, value }));

  return {
    level,
    levelName: found.levelName,
    description: found.description,
    benchmarks,
  };
}

/**
 * Folds a plan's stored priorities together with the instrument, so a view can
 * render one row per parameter without looking anything else up.
 */
function planRows(plan, indicators) {
  const byCode = new Map((plan && plan.priorities ? plan.priorities : []).map((p) => [p.indicatorCode, p]));

  return indicators.map((indicator) => {
    const priority = byCode.get(indicator.code) || null;
    const currentLevel = priority ? priority.currentLevel : null;
    const targetLevel = priority ? priority.targetLevel : null;
    const intent = priority ? priority.intent : MAINTAIN;
    const initiatives = priority && priority.initiatives ? priority.initiatives : [];

    return {
      indicator,
      priority,
      intent,
      currentLevel,
      targetLevel,
      advancing: intent === ADVANCE && targetLevel > currentLevel,
      // What the school is committing to: the target level when advancing, the
      // level it already holds when maintaining. Both carry requirements.
      requirements: priority ? requirementsFor(indicator, targetLevel) : null,
      initiatives,
      initiativeCount: initiatives.length,
      // A parameter the school means to advance, with nothing written about
      // how, is the gap this page exists to make visible.
      needsInitiatives: intent === ADVANCE && initiatives.length === 0,
    };
  });
}

/** A one-line summary of where the plan stands, for the overview and the nav. */
function planSummary(rows) {
  const advancing = rows.filter((r) => r.intent === ADVANCE);
  return {
    total: rows.length,
    advancing: advancing.length,
    maintaining: rows.length - advancing.length,
    initiatives: rows.reduce((n, r) => n + r.initiativeCount, 0),
    withoutInitiatives: advancing.filter((r) => r.initiatives.length === 0).map((r) => r.indicator.code),
  };
}

/**
 * The levels a parameter may be advanced to: above where it stands, and no
 * higher than the instrument goes.
 */
function targetChoices(currentLevel, maxLevel = 5) {
  const from = Number.isInteger(currentLevel) ? currentLevel : 0;
  const out = [];
  for (let l = from + 1; l <= maxLevel; l++) out.push(l);
  return out;
}

module.exports = {
  ADVANCE, MAINTAIN, INTENTS, INITIATIVE_STATUSES, PLAN_YEARS,
  openPlan, requirementsFor, planRows, planSummary, targetChoices,
};
