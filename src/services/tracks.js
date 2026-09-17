// Which of the three readings of a parameter a person is writing.
//
// The school's administration and its team assess independently, and neither
// sees the other while doing it — that is the point. A level both sides
// arrived at separately means something a level negotiated in one room does
// not. Afterwards the principal records what the two settled on.
//
// Nobody chooses their track and nobody can write to both: it follows from the
// position they hold, which is why this is a lookup rather than a form field.

const ADMINISTRATION = 'ADMINISTRATION';
const TEAM = 'TEAM';
const AGREED = 'AGREED';

/** Every track a cycle carries, in the order the reconciliation screen shows. */
const TRACKS = [ADMINISTRATION, TEAM, AGREED];

/** The two that are filled in independently, before anyone reconciles. */
const WORKING_TRACKS = [ADMINISTRATION, TEAM];

const BY_ROLE = {
  SCHOOL_PRINCIPAL: ADMINISTRATION,
  SCHOOL_DEPUTY: ADMINISTRATION,
  SCHOOL_MENTOR: TEAM,
};

/**
 * @param {string} role
 * @returns {string|null} the track this position writes to, or null for
 *   anyone who does not take part in the assessment — a metamentor watching
 *   it, the ministry reading the result.
 */
function trackForRole(role) {
  return BY_ROLE[role] || null;
}

/**
 * Compares the two working readings of one parameter.
 *
 * A gap is only a gap when both sides have actually answered. One side having
 * left a parameter blank is a different situation from the two disagreeing,
 * and the reconciliation screen has to say which — treating silence as assent
 * is exactly the failure the two-track design exists to prevent.
 *
 * @returns {{state: 'agree'|'differ'|'incomplete'|'empty', gap: number|null}}
 */
function compare(administrationLevel, teamLevel) {
  const a = administrationLevel;
  const t = teamLevel;
  const hasA = a !== null && a !== undefined;
  const hasT = t !== null && t !== undefined;

  if (!hasA && !hasT) return { state: 'empty', gap: null };
  if (!hasA || !hasT) return { state: 'incomplete', gap: null };
  if (a === t) return { state: 'agree', gap: 0 };
  return { state: 'differ', gap: Math.abs(a - t) };
}

/**
 * A side's reading of one parameter, from the readings of the people on it:
 * the median, rounded down when the count is even.
 *
 * The median, because one outlier on a team of five should not move the side's
 * number the way an average would. Rounded down, because between two readings
 * the lower one is the one the evidence has to support anyway. Either way the
 * individual readings are shown beside it, so nothing is hidden by the choice.
 *
 * @param {Array<number|null>} levels
 * @returns {number|null} null when nobody on the side has answered
 */
function sideLevel(levels) {
  const answered = (levels || []).filter(Number.isInteger).sort((a, b) => a - b);
  if (!answered.length) return null;
  return answered[Math.floor((answered.length - 1) / 2)];
}

/**
 * Folds a cycle's rating rows into one entry per parameter, carrying all three
 * readings side by side, and each person's reading under their side's.
 *
 * @param {Array} ratings every rating row of the cycle, any track
 * @param {Array} indicators the instrument, in display order
 * @param {Array} [personal] PersonalRating rows, with `user` loaded
 */
function reconciliation(ratings, indicators, personal = []) {
  const readingsFor = (code, track) => (personal || [])
    .filter((p) => p.indicatorCode === code && p.track === track && Number.isInteger(p.level))
    .map((p) => ({
      userId: p.userId,
      name: p.user ? p.user.name : '',
      level: p.level,
      comment: p.comment || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const spread = (list) => (list.length > 1
    ? Math.max(...list.map((r) => r.level)) - Math.min(...list.map((r) => r.level)) : 0);

  const byCodeAndTrack = new Map();
  (ratings || []).forEach((r) => byCodeAndTrack.set(`${r.indicatorCode}:${r.track}`, r));

  return indicators.map((ind) => {
    const administration = byCodeAndTrack.get(`${ind.code}:${ADMINISTRATION}`) || null;
    const team = byCodeAndTrack.get(`${ind.code}:${TEAM}`) || null;
    const agreed = byCodeAndTrack.get(`${ind.code}:${AGREED}`) || null;
    const levelOf = (row) => (row ? row.level : null);
    const comparison = compare(levelOf(administration), levelOf(team));
    const readings = {
      [ADMINISTRATION]: readingsFor(ind.code, ADMINISTRATION),
      [TEAM]: readingsFor(ind.code, TEAM),
    };

    return {
      readings,
      // How far apart the people on one side are. A side reading of 2 made of
      // a 1 and a 4 is a conversation the side has to have with itself.
      spread: { [ADMINISTRATION]: spread(readings[ADMINISTRATION]), [TEAM]: spread(readings[TEAM]) },
      indicator: ind,
      administration,
      team,
      agreed,
      administrationLevel: levelOf(administration),
      teamLevel: levelOf(team),
      agreedLevel: levelOf(agreed),
      settled: levelOf(agreed) !== null,
      ...comparison,
    };
  });
}

/**
 * Hides the other side's answer on any parameter the viewer's own side has
 * not answered yet.
 *
 * The two-track design rests entirely on neither side seeing the other while
 * they work — a level both sides reached separately means something a level
 * copied from the other column does not. The reconciliation screen puts the
 * two side by side, and nothing stopped a mentor opening it on day one and
 * reading the administration's answers before writing their own. The
 * documentation said the readings were kept apart; the software did not keep
 * them apart.
 *
 * The rule is per parameter rather than per screen: answer A1 and you can see
 * what the other side said about A1, whatever else is still blank. That is
 * the same threshold compare() already calls 'incomplete', and it keeps the
 * screen useful while a school works through the list.
 *
 * Someone who writes to no working track — an administrator acting inside the
 * school — is not one of the two sides and is not masked.
 *
 * The agreed level goes with them when `hideAgreed` is set — for anyone who
 * cannot settle, and so did not write it. Agreeing a level before the team has
 * answered otherwise tells the team what to answer.
 *
 * Now that readings are kept per person, "answered" means *this person* has
 * answered — pass `answered`, the set of parameter codes they have rated. A
 * colleague on the same side having answered does not open the row, and while
 * it is closed the viewer's own side's reading is hidden too, because it may
 * be entirely a colleague's. Without `answered` (a cycle nobody has rated
 * individually) the side's own value decides, as before.
 *
 * @param {Array} rows      from reconciliation()
 * @param {string} myTrack  the track this viewer writes to
 * @param {{hideAgreed?: boolean, answered?: Set<string>}} [options]
 */
function maskForTrack(rows, myTrack, { hideAgreed = false, answered } = {}) {
  if (!WORKING_TRACKS.includes(myTrack)) return rows;
  const mine = myTrack === ADMINISTRATION ? 'administrationLevel' : 'teamLevel';
  const theirs = myTrack === ADMINISTRATION ? 'teamLevel' : 'administrationLevel';

  return rows.map((row) => {
    const hasAnswered = answered
      ? answered.has(row.indicator.code)
      : row[mine] !== null && row[mine] !== undefined;
    if (hasAnswered) return row;
    return {
      ...row,
      [theirs]: null,
      ...(answered ? { [mine]: null } : {}),
      readings: { [ADMINISTRATION]: [], [TEAM]: [] },
      // The state and the gap disclose the same thing more quietly — "differ
      // by 3" tells you what the other side wrote as surely as the number
      // does — so they go with it.
      state: 'hidden',
      gap: null,
      hidden: true,
      ...(hideAgreed ? { agreedLevel: null, agreedHidden: true } : {}),
    };
  });
}

/**
 * The parameters at least one side has not read. Agreeing a level for one of
 * these is an agreement that side never took part in.
 */
function missingReadings(rows) {
  return rows
    .filter((r) => r.administrationLevel === null || r.teamLevel === null)
    .map((r) => r.indicator.code);
}

/** What still stands between the school and a confirmable assessment. */
function outstanding(rows) {
  return {
    unsettled: rows.filter((r) => !r.settled).map((r) => r.indicator.code),
    differing: rows.filter((r) => r.state === 'differ').map((r) => r.indicator.code),
    incomplete: rows.filter((r) => r.state === 'incomplete').map((r) => r.indicator.code),
    untouched: rows.filter((r) => r.state === 'empty').map((r) => r.indicator.code),
  };
}

module.exports = {
  ADMINISTRATION, TEAM, AGREED, TRACKS, WORKING_TRACKS,
  trackForRole, compare, reconciliation, outstanding, maskForTrack, sideLevel, missingReadings,
};
