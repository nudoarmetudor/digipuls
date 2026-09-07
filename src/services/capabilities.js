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
  'admin.users',      // manage accounts and their capabilities
  'admin.audit',      // read the audit log
  // --- pilot feedback ---
  'feedback.submit',  // the click-to-report overlay, and one's own tickets
  'feedback.triage',  // the developer backlog: every ticket, and its status
];

// Grouped for the admin UI, so the checkbox list reads as something other
// than eleven undifferentiated strings.
const CAPABILITY_GROUPS = [
  { key: 'views', capabilities: ['view.school', 'view.national', 'view.compliance', 'view.regional', 'view.partner', 'view.training'] },
  { key: 'admin', capabilities: ['admin.schools', 'admin.users', 'admin.audit'] },
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
 * The effective capability set for a user.
 *
 * @param {string} role
 * @param {Array<{capability: string, granted: boolean}>} overrides
 * @returns {Set<string>}
 */
function capabilitiesFor(role, overrides = []) {
  const effective = new Set(ROLE_DEFAULTS[role] || []);
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
  const defaults = new Set(ROLE_DEFAULTS[role] || []);
  const wanted = new Set(desired.filter((c) => CAPABILITIES.includes(c)));
  const rows = [];
  CAPABILITIES.forEach((cap) => {
    const isDefault = defaults.has(cap);
    const isWanted = wanted.has(cap);
    if (isWanted !== isDefault) rows.push({ capability: cap, granted: isWanted });
  });
  return rows;
}

/** Where an account lands after login, given what it can actually reach. */
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

function homeFor(capabilities, user) {
  const found = HOME_BY_CAPABILITY.find(([cap]) => {
    if (cap === 'view.school') return canOpenSchoolWorkspace(capabilities, user);
    return capabilities.has(cap);
  });
  // An account with nothing at all still gets a page rather than a redirect
  // loop — the public tier needs no login.
  return found ? found[1] : '/public-view/schools';
}

module.exports = {
  CAPABILITIES,
  CAPABILITY_GROUPS,
  ROLES,
  ROLE_DEFAULTS,
  capabilitiesFor,
  overridesFrom,
  homeFor,
  canOpenSchoolWorkspace,
};
