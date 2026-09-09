// Reporting on how the DigiPlan is going.
//
// The plan runs two years with a report at the halfway point. The report is
// built from the initiatives that already exist — their status, and what their
// measures reached against the targets the school set — so nothing is
// re-entered. The school keeps the plan up to date as it works, and the report
// reads it.
//
// One thing this deliberately does not do: decide whether a target was met. A
// target is written by the school in its own words ("80%", "all teachers",
// "two sessions per term"), and so is what actually happened. Comparing them is
// a judgement, and software that guessed would be confidently wrong in front of
// the Ministry. The report puts the two side by side and counts what has been
// recorded, not what has been achieved.

const INTERIM = 'INTERIM';
const FINAL = 'FINAL';
const REPORT_KINDS = [INTERIM, FINAL];

/** Where in the plan's life each report belongs. */
const DUE_AFTER_YEARS = { [INTERIM]: 1, [FINAL]: 2 };

/**
 * When a report becomes due, and whether it is yet.
 *
 * A school may write it early — plans slip in both directions and a report
 * blocked by a date is a report nobody can prepare — so this informs the page
 * rather than gating the route.
 */
function reportTiming(plan, kind, now = new Date()) {
  const years = DUE_AFTER_YEARS[kind];
  if (!plan || !plan.startsOn || !years) return { dueOn: null, due: false };
  const dueOn = new Date(plan.startsOn);
  dueOn.setFullYear(dueOn.getFullYear() + years);
  return { dueOn, due: now >= dueOn };
}

/**
 * Every initiative in the plan, flattened with the parameter it belongs to.
 * This is the report's content; the report itself only adds a narrative.
 */
function reportLines(rows) {
  return rows.flatMap((row) => row.initiatives.map((ini) => ({
    indicatorCode: row.indicator.code,
    indicatorName: row.indicator.name,
    intent: row.intent,
    currentLevel: row.currentLevel,
    targetLevel: row.targetLevel,
    initiativeId: ini.id,
    title: ini.title,
    status: ini.status,
    responsible: ini.responsibleUser ? ini.responsibleUser.name : (ini.responsibleName || null),
    supervisor: ini.supervisorUser ? ini.supervisorUser.name : (ini.supervisorName || null),
    dueOn: ini.dueOn || null,
    kpis: (ini.kpis || []).map((k) => ({
      id: k.id,
      measure: k.measure,
      target: k.target,
      // null means nobody has said yet — which is different from a measure
      // that was recorded as missed, and the report must not blur the two.
      actual: k.actual || null,
    })),
  })));
}

/** What the report says at a glance, counting only what can be counted. */
function reportProgress(lines) {
  const byStatus = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0, DROPPED: 0 };
  let kpis = 0;
  let recorded = 0;

  lines.forEach((line) => {
    if (byStatus[line.status] !== undefined) byStatus[line.status] += 1;
    line.kpis.forEach((k) => {
      kpis += 1;
      if (k.actual) recorded += 1;
    });
  });

  return {
    initiatives: lines.length,
    byStatus,
    kpis,
    recorded,
    // Not "unmet" — nobody has said what happened, which is a gap in the
    // report rather than a failure of the initiative.
    unrecorded: kpis - recorded,
  };
}

/**
 * What is frozen when the report is published.
 *
 * Implementation continues afterwards, so a report reading live data would
 * quietly rewrite itself: a year-one report would end up describing year two.
 * The snapshot is the report as it was sent out.
 */
function buildSnapshot(rows, { narrative, kind, publishedAt }) {
  const lines = reportLines(rows);
  return {
    kind,
    publishedAt: publishedAt instanceof Date ? publishedAt.toISOString() : publishedAt,
    narrative: narrative || null,
    progress: reportProgress(lines),
    lines: lines.map((l) => ({
      ...l,
      dueOn: l.dueOn ? new Date(l.dueOn).toISOString() : null,
    })),
  };
}

module.exports = {
  INTERIM, FINAL, REPORT_KINDS, DUE_AFTER_YEARS,
  reportTiming, reportLines, reportProgress, buildSnapshot,
};
