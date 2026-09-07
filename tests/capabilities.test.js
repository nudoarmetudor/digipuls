const test = require('node:test');
const assert = require('node:assert');

const {
  CAPABILITIES, CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS,
  capabilitiesFor, overridesFrom, homeFor, canOpenSchoolWorkspace,
} = require('../src/services/capabilities');

test('every role has defaults, and every default is a real capability', () => {
  ROLES.forEach((role) => {
    assert.ok(Array.isArray(ROLE_DEFAULTS[role]), `no defaults for ${role}`);
    ROLE_DEFAULTS[role].forEach((cap) => {
      assert.ok(CAPABILITIES.includes(cap), `${role} defaults to unknown capability ${cap}`);
    });
  });
});

test('the admin UI groups cover every capability exactly once', () => {
  // A capability missing from the groups would be invisible in the form, and
  // therefore silently unassignable — and silently *revoked* on every save,
  // since the form posts the complete desired set.
  const grouped = CAPABILITY_GROUPS.flatMap((g) => g.capabilities);
  assert.deepStrictEqual([...grouped].sort(), [...CAPABILITIES].sort());
  assert.strictEqual(grouped.length, new Set(grouped).size, 'a capability appears in two groups');
});

test('administrators hold every capability', () => {
  assert.deepStrictEqual([...capabilitiesFor('ADMIN', [])].sort(), [...CAPABILITIES].sort());
});

test('meta-mentors get oversight views and reporting, but no administration', () => {
  const caps = capabilitiesFor('META_MENTOR', []);
  assert.ok(caps.has('view.national'));
  assert.ok(caps.has('view.regional'));
  assert.ok(caps.has('feedback.submit'));
  assert.ok(!caps.has('admin.users'), 'a mentor must not manage accounts by default');
  assert.ok(!caps.has('admin.schools'));
  assert.ok(!caps.has('feedback.triage'), 'triage is the developer side, not the reporter side');
});

test('overrides add and remove on top of the role default', () => {
  const added = capabilitiesFor('TERRITORIAL', [{ capability: 'view.national', granted: true }]);
  assert.ok(added.has('view.national'));
  assert.ok(added.has('view.regional'), 'the role default must survive');

  const removed = capabilitiesFor('MINISTRY', [{ capability: 'view.compliance', granted: false }]);
  assert.ok(removed.has('view.national'));
  assert.ok(!removed.has('view.compliance'));
});

test('a capability removed from the code cannot come back from a stale row', () => {
  const caps = capabilitiesFor('PARTNER', [{ capability: 'admin.everything', granted: true }]);
  assert.ok(!caps.has('admin.everything'));
  assert.deepStrictEqual([...caps], ['view.partner']);
});

test('overridesFrom stores only the differences from the role default', () => {
  // Ticking exactly the role's own defaults should store nothing at all —
  // otherwise every user freezes a copy of the defaults and later changes to
  // a role stop reaching anyone.
  assert.deepStrictEqual(overridesFrom('MINISTRY', ROLE_DEFAULTS.MINISTRY), []);

  const rows = overridesFrom('TERRITORIAL', ['view.regional', 'view.national']);
  assert.deepStrictEqual(rows, [{ capability: 'view.national', granted: true }]);

  const revoked = overridesFrom('MINISTRY', ['view.national']);
  assert.deepStrictEqual(revoked, [{ capability: 'view.compliance', granted: false }]);
});

test('overridesFrom ignores capabilities that do not exist', () => {
  const rows = overridesFrom('PARTNER', ['view.partner', 'made.up']);
  assert.deepStrictEqual(rows, []);
});

test('overridesFrom round-trips through capabilitiesFor', () => {
  // What an admin ticks is what the account ends up with — for every role.
  const desired = ['view.national', 'view.regional', 'feedback.submit', 'admin.audit'];
  ROLES.forEach((role) => {
    const stored = overridesFrom(role, desired);
    assert.deepStrictEqual(
      [...capabilitiesFor(role, stored)].sort(), [...desired].sort(),
      `round-trip failed for ${role}`
    );
  });
});

test('homeFor sends each account somewhere it can actually reach', () => {
  const withSchool = { schoolId: 3 };
  assert.strictEqual(homeFor(capabilitiesFor('SCHOOL_TEAM', []), withSchool), '/school');
  assert.strictEqual(homeFor(capabilitiesFor('MINISTRY', []), {}), '/ministry');
  assert.strictEqual(homeFor(capabilitiesFor('TERRITORIAL', []), {}), '/territorial');
  assert.strictEqual(homeFor(capabilitiesFor('PARTNER', []), {}), '/partner');
  assert.strictEqual(homeFor(capabilitiesFor('STRATEGIC_PARTNER', []), {}), '/strategic');
  assert.strictEqual(homeFor(capabilitiesFor('META_MENTOR', []), {}), '/ministry');
  // An account stripped of everything still gets a page rather than a loop.
  assert.strictEqual(homeFor(new Set(), {}), '/public-view/schools');
  // Someone left with only the ability to report lands on their own panel.
  assert.strictEqual(homeFor(new Set(['feedback.submit']), {}), '/feedback');
});

test('an admin is never sent to a school workspace it has no school for', () => {
  // Admins hold every capability, view.school included, but have no schoolId.
  // Without the extra check they land on /school, which then refuses them —
  // exactly what happened on the live instance before this guard existed.
  const adminCaps = capabilitiesFor('ADMIN', []);
  assert.ok(adminCaps.has('view.school'));
  const landing = homeFor(adminCaps, { schoolId: null });
  assert.notStrictEqual(landing, '/school', 'an admin must not be sent to a school workspace');
  // It falls through to the next thing an admin genuinely can open.
  assert.strictEqual(landing, '/ministry');
  assert.ok(!canOpenSchoolWorkspace(adminCaps, { schoolId: null }));
  assert.ok(!canOpenSchoolWorkspace(adminCaps, undefined));
  // An admin that *is* attached to a school may still open it.
  assert.ok(canOpenSchoolWorkspace(adminCaps, { schoolId: 1 }));
});

test('a school-team account without a school is not stranded on /school', () => {
  const caps = capabilitiesFor('SCHOOL_TEAM', []);
  assert.strictEqual(homeFor(caps, { schoolId: null }), '/public-view/schools');
});

test('every capability has a label in all three languages', () => {
  const { STRINGS, SUPPORTED_LANGS } = require('../src/i18n');
  SUPPORTED_LANGS.forEach((lang) => {
    CAPABILITIES.forEach((cap) => {
      assert.ok(STRINGS[lang]['cap_' + cap], `${lang} has no label for ${cap}`);
    });
    ROLES.forEach((role) => {
      assert.ok(STRINGS[lang]['role_' + role], `${lang} has no label for role ${role}`);
    });
    CAPABILITY_GROUPS.forEach((g) => {
      assert.ok(STRINGS[lang]['cap_group_' + g.key], `${lang} has no label for group ${g.key}`);
    });
  });
});
