// What an account can actually do, expressed as capabilities rather than as
// a role check scattered through the routes.
//
// Roles still exist and still carry the sensible default for each kind of
// user, but an admin can grant or revoke individual capabilities per person
// — which is the point: the meta-mentors testing the pilot are not any one
// of the existing roles, and different mentors need to see different parts of
// the platform. Storing only the *differences* from the role default (see
// the UserCapability model) means a role's defaults can be revised later
// without rewriting every user's row.
//
// Two rules keep this honest:
//   * The navigation is built from the same capability set the route guards
//     use, so a person is never shown a link to a page that will then 403.
//   * Capabilities gate *access*, never data scope. A territorial user's
//     view is still limited to their own territory by the object-level check
//     in routes/territorial.js; granting view.regional does not widen it.

const CAPABILITIES = [
  // --- inside a school ---
  'view.school',      // work on the school's own assessment and plan
  // The three below are the principal's and the deputy's. They are separate
  // capabilities rather than one "is management" flag because they are three
  // different kinds of authority, and a school may later want to delegate one
  // without the others.
  'school.manage',    // open a cycle, confirm it, decide what the plan aims at
  'school.publish',   // put the assessment, the plan or the interim report out
  'school.accounts',  // create and administer this school's own mentor accounts
  'view.national',    // the Ministry's national dashboard
  'view.compliance',  // the Order 675 quantitative monitor
  'view.regional',    // the territorial dashboard (own territory only)
  'view.partner',     // the financing-partner school overview
  'view.training',    // the strategic-partner training-needs dashboard
  // --- administration ---
  'admin.schools',    // provision schools from SIME
  'admin.users',      // manage accounts: create, rename, activate, reset password
  'admin.grant',      // decide what a post *is*: its role and its capabilities
  'admin.audit',      // read the audit log
  // --- pilot feedback ---
  'feedback.submit',  // the click-to-report overlay, and one's own tickets
  'feedback.triage',  // the developer backlog: every ticket, and its status
];

// Grouped for the admin UI, so the checkbox list reads as something other
// than eleven undifferentiated strings.
const CAPABILITY_GROUPS = [
  { key: 'school', capabilities: ['view.school', 'school.manage', 'school.publish', 'school.accounts'] },
  { key: 'views', capabilities: [ 'view.national', 'view.compliance', 'view.regional', 'view.partner', 'view.training'] },
  { key: 'admin', capabilities: ['admin.schools', 'admin.users', 'admin.grant', 'admin.audit'] },
  { key: 'feedback', capabilities: ['feedback.submit', 'feedback.triage'] },
];

const ROLES = [
  // --- inside a school: the people who do the assessment and write the plan ---
  // A school fields a team of five or six. One position of principal, one of
  // deputy principal, and about five mentors. All three can work on the
  // school's own assessment; the two-track split between administration and
  // team is a workflow question, not a permissions one, and is not modelled
  // yet.
  'SCHOOL_PRINCIPAL',
  'SCHOOL_DEPUTY',
  'SCHOOL_MENTOR',

  // --- the DigitalAccelerator mentoring line ---
  // A meta-mentor (DigCompEdu C1) advises one school and only exists in
  // relation to it: exactly one per school, twelve in the group. They watch
  // and advise; every change to a school's record is made by that school.
  'META_MENTOR',
  // A meta-coordinator (DigCompEdu C2) is drawn from among the twelve and
  // coordinates the group itself — sessions, coaching, reporting,
  // deliverables. The position is about the mentors, not about an
  // institution, so it names none.
  'META_COORDINATOR',

  // --- oversight: reads the results, takes no part in producing them ---
  'MINISTRY',
  // The Territorial Education Agency, replacing the raion-level Direcție
  // Generală de Educație. Same function as the ministry, bounded to one
  // territory.
  'TERRITORIAL',
  'PARTNER',
  'STRATEGIC_PARTNER',

  // --- the platform itself, not a position in the programme ---
  'ADMIN',
];

// The positions a school fills. Grouped because they share what they may do
// today and are told apart by who the person is, not by what the software
// lets them touch.
const SCHOOL_ROLES = ['SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY', 'SCHOOL_MENTOR'];

// Held by every role. Reporting a problem is not a privilege attached to one
// kind of account: whoever hits the thing that is wrong is the person best
// placed to describe it, and a school secretary who cannot report a broken
// page is a bug report the developers never get.
//
// Expressed as a baseline rather than repeated in all seven lists below, so
// the intent — everyone can report — is stated once and cannot drift as roles
// are added. It is still only a *default*: an admin can revoke it from one
// person, because overrides are applied afterwards.
const BASELINE_CAPABILITIES = ['feedback.submit'];

// A few capabilities need more than themselves. view.school opens the school's
// own editing workspace, and routes/school.js also insists on a school-side
// post because every route under it reads the active school. So an
// administrator holds view.school and can never use it.
//
// Rather than quietly leave a control in the picker that does nothing for most
// roles, the requirement is declared here and the picker says so.
const CAPABILITY_REQUIRES_ROLE = {
  'view.school': SCHOOL_ROLES,
  'school.manage': SCHOOL_ROLES,
  'school.publish': SCHOOL_ROLES,
  'school.accounts': SCHOOL_ROLES,
};

/** True when this role can actually exercise the capability, not merely hold it. */
function capabilityIsUsableBy(capability, role) {
  const needed = CAPABILITY_REQUIRES_ROLE[capability];
  if (!needed) return true;
  return Array.isArray(needed) ? needed.includes(role) : needed === role;
}

// The public tier (/public-view) is deliberately absent from CAPABILITIES:
// it requires no login at all, so gating it per account would be theatre.
const ROLE_DEFAULTS = {
  // Everyone inside the school works on the same assessment. The DigiPlan is
  // written once per two-year cycle by the school, together.
  // The principal and the deputy principal are equivalent in the software.
  // Which of them holds the post is recorded in the audit trail; it is not a
  // permissions boundary, and nothing in the workflow needs one.
  SCHOOL_PRINCIPAL: ['view.school', 'school.manage', 'school.publish', 'school.accounts'],
  SCHOOL_DEPUTY: ['view.school', 'school.manage', 'school.publish', 'school.accounts'],
  // A mentor does the assessment and writes the initiatives. They cannot open
  // or close a cycle, decide the plan's targets, publish anything, or create
  // accounts.
  SCHOOL_MENTOR: ['view.school'],

  // Deliberately without view.school: a meta-mentor watches their school's
  // live status, drafts included, and cannot change any of it. Only the school
  // edits the school's record. They also read the national picture, so they
  // can see where their school stands among the twelve.
  META_MENTOR: ['view.national', 'view.compliance', 'view.regional'],

  // Everything a mentor sees, plus the account management needed to run the
  // group. Not admin.grant — coordinating mentors is not the same as deciding
  // what any post in the system may do.
  META_COORDINATOR: ['view.national', 'view.compliance', 'view.regional', 'admin.users'],

  MINISTRY: ['view.national', 'view.compliance'],
  // The same reading as the ministry, bounded to its own territory. It does
  // not get view.compliance, because that monitor is national and scoping it
  // to a district is a separate piece of work.
  TERRITORIAL: ['view.regional'],
  PARTNER: ['view.partner'],
  STRATEGIC_PARTNER: ['view.training'],
  ADMIN: CAPABILITIES.slice(),
};

/**
 * What a role grants before any per-post adjustment: the baseline everyone
 * has, plus that role's own list. Both capabilitiesFor and overridesFrom
 * measure against this, so a baseline capability is never stored as though
 * someone had deliberately added it.
 */
function defaultsFor(role) {
  return new Set([...BASELINE_CAPABILITIES, ...(ROLE_DEFAULTS[role] || [])]);
}

/**
 * The effective capability set for a user.
 *
 * @param {string} role
 * @param {Array<{capability: string, granted: boolean}>} overrides
 * @returns {Set<string>}
 */
function capabilitiesFor(role, overrides = []) {
  const effective = defaultsFor(role);
  overrides.forEach((o) => {
    // Ignore anything not in the current list — a capability removed from the
    // code shouldn't resurrect itself from a stale row.
    if (!CAPABILITIES.includes(o.capability)) return;
    if (o.granted) effective.add(o.capability);
    else effective.delete(o.capability);
  });
  return effective;
}

/**
 * Turns a desired final capability set into the minimal set of override rows
 * to store — only the differences from the role default, so the stored rows
 * stay meaningful if the defaults are later changed.
 *
 * @param {string} role
 * @param {string[]} desired  capabilities the admin ticked
 * @returns {Array<{capability: string, granted: boolean}>}
 */
function overridesFrom(role, desired) {
  const defaults = defaultsFor(role);
  const wanted = new Set(desired.filter((c) => CAPABILITIES.includes(c)));
  const rows = [];
  CAPABILITIES.forEach((cap) => {
    const isDefault = defaults.has(cap);
    const isWanted = wanted.has(cap);
    if (isWanted !== isDefault) rows.push({ capability: cap, granted: isWanted });
  });
  return rows;
}

/**
 * May an actor administer this target account?
 *
 * The rule is that you cannot act on someone who can do something you cannot.
 * Without it, admin.users is still a privilege-escalation primitive by a
 * longer route: reset the administrator's password, read it off the screen,
 * sign in as them. Resetting a *peer's* password stays allowed, because that
 * is the actual job.
 *
 * @param {Set<string>} actor   the acting account's effective capabilities
 * @param {Set<string>} target  the union of the target account's capabilities
 */
function canActOn(actor, target) {
  for (const capability of target) {
    if (!actor.has(capability)) return false;
  }
  return true;
}

/**
 * May an actor administer this target account?
 *
 * The rule is that you cannot act on someone who can do something you cannot.
 * Without it, admin.users is still a privilege-escalation primitive by a
 * longer route: reset the administrator's password, read it off the screen,
 * sign in as them. Resetting a *peer's* password stays allowed, because that
 * is the actual job.
 *
 * @param {Set<string>} actor   the acting account's effective capabilities
 * @param {Set<string>} target  the union of the target account's capabilities
 */
function canActOn(actor, target) {
  for (const capability of target) {
    if (!actor.has(capability)) return false;
  }
  return true;
}

/**
 * Where an account lands after login, given what it can actually reach.
 *
 * Order matters: the first entry whose test passes wins, so the most specific
 * destination has to come before the general dashboards.
 */
const HOME_BY_CAPABILITY = [
  ['view.school', '/school'],
  ['view.national', '/ministry'],
  ['view.regional', '/territorial'],
  ['view.partner', '/partner'],
  ['view.training', '/strategic'],
  ['admin.users', '/admin/users'],
  ['admin.schools', '/admin/schools/new'],
  ['feedback.submit', '/feedback'],
];

/**
 * The school workspace is the one destination that needs more than a
 * capability: it needs a school. Administrators hold every capability,
 * including view.school, but have no schoolId — so without this check an
 * admin is sent straight to a page that refuses them.
 */
function canOpenSchoolWorkspace(capabilities, user) {
  return capabilities.has('view.school') && !!(user && user.schoolId);
}

/**
 * A post that names a school but cannot open its workspace is an oversight
 * post about that school — a meta-mentor supporting one lyceum. Send them to
 * that school rather than to a national list of fourteen they then have to
 * search. Which detail route depends on what they may read.
 */
function mentoredSchoolPath(capabilities, user) {
  if (!user || !user.schoolId) return null;
  if (canOpenSchoolWorkspace(capabilities, user)) return null;
  if (capabilities.has('view.national') || capabilities.has('view.compliance')) {
    return `/ministry/schools/${user.schoolId}`;
  }
  if (capabilities.has('view.regional')) return `/territorial/schools/${user.schoolId}`;
  return null;
}

function homeFor(capabilities, user) {
  const mentored = mentoredSchoolPath(capabilities, user);
  if (mentored) return mentored;

  // A school-team post with no school is a misconfiguration, not a person
  // with nothing to do. /school explains what is wrong; the feedback page,
  // which is where this used to land because every role holds
  // feedback.submit, does not answer "where am I supposed to start".
  // Checked before the table below for exactly that reason.
  if (capabilities.has('view.school') && !canOpenSchoolWorkspace(capabilities, user)
      && !capabilities.has('view.national') && !capabilities.has('view.regional')
      && !capabilities.has('view.partner') && !capabilities.has('view.training')) {
    return '/school';
  }

  const found = HOME_BY_CAPABILITY.find(([cap]) => {
    if (cap === 'view.school') return canOpenSchoolWorkspace(capabilities, user);
    return capabilities.has(cap);
  });
  if (found) return found[1];

  // An account with nothing at all still gets a page rather than a redirect
  // loop — the public tier needs no login.
  return '/public-view/schools';
}

// How a role relates to an institution.
//
// Two different questions, and conflating them was a bug waiting to happen:
//   * "needs"  — the post is meaningless without one. A mentor has to name
//     their school; so does a meta-mentor, whose position exists only in
//     relation to the school they advise.
//   * "allows" — the post may name one.
//
// The programme's shape: one meta-mentor per school, twelve schools, twelve
// mentors. A meta-coordinator coordinates those mentors rather than any
// institution, so it names neither a school nor a district — and neither do
// the ministry, the partners, or an administrator.
function roleNeedsSchool(role) {
  return SCHOOL_ROLES.includes(role) || role === 'META_MENTOR';
}

function roleNeedsTerritory(role) {
  return role === 'TERRITORIAL';
}

function roleAllowsSchool(role) {
  return roleNeedsSchool(role);
}

function roleAllowsTerritory(role) {
  return role === 'TERRITORIAL';
}

/** Positions that exist only in relation to one school. */
function isSchoolRole(role) {
  return SCHOOL_ROLES.includes(role);
}

module.exports = {
  CAPABILITIES,
  SCHOOL_ROLES,
  isSchoolRole,
  BASELINE_CAPABILITIES,
  defaultsFor,
  roleNeedsSchool,
  roleNeedsTerritory,
  roleAllowsSchool,
  roleAllowsTerritory,
  CAPABILITY_GROUPS,
  ROLES,
  ROLE_DEFAULTS,
  canActOn,
  CAPABILITY_REQUIRES_ROLE,
  capabilityIsUsableBy,
  mentoredSchoolPath,
  capabilitiesFor,
  overridesFrom,
  homeFor,
  canOpenSchoolWorkspace,
};
