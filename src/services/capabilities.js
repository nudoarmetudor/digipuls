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
  // --- what the account can see ---
  'view.school',      // a school's own assessment workspace
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
  { key: 'views', capabilities: ['view.school', 'view.national', 'view.compliance', 'view.regional', 'view.partner', 'view.training'] },
  { key: 'admin', capabilities: ['admin.schools', 'admin.users', 'admin.grant', 'admin.audit'] },
  { key: 'feedback', capabilities: ['feedback.submit', 'feedback.triage'] },
];

const ROLES = [
  'SCHOOL_TEAM',
  'MINISTRY',
  'TERRITORIAL',
  'PARTNER',
  'STRATEGIC_PARTNER',
  'META_MENTOR',
  'ADMIN',
];

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
// own editing workspace, and routes/school.js also insists on a SCHOOL_TEAM
// post because every route under it reads the active school. So an
// administrator holds view.school and can never use it.
//
// Rather than quietly leave a control in the picker that does nothing for six
// of the seven roles, the requirement is declared here and the picker says so.
const CAPABILITY_REQUIRES_ROLE = {
  'view.school': 'SCHOOL_TEAM',
};

/** True when this role can actually exercise the capability, not merely hold it. */
function capabilityIsUsableBy(capability, role) {
  const needed = CAPABILITY_REQUIRES_ROLE[capability];
  return !needed || needed === role;
}


// Why admin.users and admin.grant are two capabilities and not one.
//
// They used to be one, and holding it meant: create any account, reset
// anyone's password and read the new one, and add an ADMIN post to any
// account including your own. That last part makes it not an administrative
// capability but a route to becoming the administrator, which is more than
// anyone was ever knowingly granted.
//
//   admin.users  running the pilot: add a mentor, correct a name, switch an
//                account off, issue a new one-time password.
//   admin.grant  deciding what a post may do. This is the privilege boundary,
//                so it is held by fewer people than admin.users.
//
// canActOn() below closes the remaining sideways route: admin.users can issue
// a new password for an account, which would be a takeover if the target were
// more privileged than the actor.

// Why admin.users and admin.grant are two capabilities and not one.
//
// They used to be one, and holding it meant: create any account, reset
// anyone's password and read the new one, and add an ADMIN post to any
// account including your own. That last part makes it not an administrative
// capability but a route to becoming the administrator, which is more than
// anyone was ever knowingly granted.
//
//   admin.users  running the pilot: add a mentor, correct a name, switch an
//                account off, issue a new one-time password.
//   admin.grant  deciding what a post may do. This is the privilege boundary,
//                so it is held by fewer people than admin.users.
//
// canActOn() below closes the remaining sideways route: admin.users can issue
// a new password for an account, which would be a takeover if the target were
// more privileged than the actor.

// The public tier (/public-view) is deliberately absent from CAPABILITIES:
// it requires no login at all, so gating it per account would be theatre.
const ROLE_DEFAULTS = {
  SCHOOL_TEAM: ['view.school'],
  MINISTRY: ['view.national', 'view.compliance'],
  TERRITORIAL: ['view.regional'],
  PARTNER: ['view.partner'],
  STRATEGIC_PARTNER: ['view.training'],
  // Meta-mentors evaluate the platform rather than operate it: they get the
  // read-only oversight views plus the ability to report what they find, and
  // no administrative powers. An admin can widen or narrow any individual
  // mentor from the user-management screen.
  META_MENTOR: ['view.national', 'view.compliance', 'view.regional', 'feedback.submit'],
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
//   * "needs"  — the post is meaningless without one. A school-team post has
//     to name a school; a territorial post has to name a territory.
//   * "allows" — the post may name one. A meta-mentor mentors a *particular*
//     school ("Elena is meta-mentor for LT Boris Dînga"), but may also work
//     across a territory or nationally, so the institution is optional.
// Ministry and Admin posts are national and take neither.
function roleNeedsSchool(role) {
  return role === 'SCHOOL_TEAM';
}

function roleNeedsTerritory(role) {
  return role === 'TERRITORIAL';
}

function roleAllowsSchool(role) {
  return role === 'SCHOOL_TEAM' || role === 'META_MENTOR';
}

function roleAllowsTerritory(role) {
  return role === 'TERRITORIAL' || role === 'META_MENTOR';
}

module.exports = {
  CAPABILITIES,
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
