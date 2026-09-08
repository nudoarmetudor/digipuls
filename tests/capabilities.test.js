const test = require('node:test');
const assert = require('node:assert');

const {
  CAPABILITIES, CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS,
  capabilitiesFor, overridesFrom, homeFor, canOpenSchoolWorkspace,
  BASELINE_CAPABILITIES, defaultsFor, capabilityIsUsableBy,
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
  assert.deepStrictEqual([...caps].sort(), ['feedback.submit', 'view.partner']);
});

test('overridesFrom stores only the differences from the role default', () => {
  // Ticking exactly the role's own defaults should store nothing at all —
  // otherwise every user freezes a copy of the defaults and later changes to
  // a role stop reaching anyone.
  assert.deepStrictEqual(overridesFrom('MINISTRY', [...defaultsFor('MINISTRY')]), []);

  const rows = overridesFrom('TERRITORIAL', [...defaultsFor('TERRITORIAL'), 'view.national']);
  assert.deepStrictEqual(rows, [{ capability: 'view.national', granted: true }]);

  const revoked = overridesFrom('MINISTRY', ['view.national', 'feedback.submit']);
  assert.deepStrictEqual(revoked, [{ capability: 'view.compliance', granted: false }]);
});

test('overridesFrom ignores capabilities that do not exist', () => {
  const rows = overridesFrom('PARTNER', [...defaultsFor('PARTNER'), 'made.up']);
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

test('a school-team account without a school is told what is wrong', () => {
  const caps = capabilitiesFor('SCHOOL_TEAM', []);
  // This used to land on /feedback, because every role holds feedback.submit
  // and that was the first entry left in the table. Reachable, but it does not
  // answer "where am I supposed to start" — the account is misconfigured and
  // nothing on the report panel says so. /school now explains it: an
  // administrator has not attached a school to this post.
  assert.strictEqual(homeFor(caps, { schoolId: null }), '/school');
  // With a school, the same route is the actual workspace.
  assert.strictEqual(homeFor(caps, { schoolId: 4 }), '/school');

  // Stripped of everything, it still gets a page rather than a redirect loop.
  const stripped = capabilitiesFor('SCHOOL_TEAM', [
    { capability: 'view.school', granted: false },
    { capability: 'feedback.submit', granted: false },
  ]);
  assert.strictEqual(homeFor(stripped, { schoolId: null }), '/public-view/schools');
});

test('an oversight post that names a school lands on that school', () => {
  // A meta-mentor supports one lyceum. Their post has named it all along and
  // nothing read it, so they arrived at a national list of fourteen and had to
  // find their own school in it.
  const mentor = capabilitiesFor('META_MENTOR', []);
  assert.strictEqual(homeFor(mentor, { schoolId: 11 }), '/ministry/schools/11');
  assert.strictEqual(homeFor(mentor, { schoolId: null }), '/ministry',
    'a mentor with no school still gets the national dashboard');

  // A post that can read only its own district gets the district's copy of
  // the page, not the Ministry's.
  const district = capabilitiesFor('TERRITORIAL', []);
  assert.strictEqual(homeFor(district, { schoolId: 11 }), '/territorial/schools/11');

  // A school team is not an oversight post: it opens the workspace, where it
  // can actually enter ratings.
  const team = capabilitiesFor('SCHOOL_TEAM', []);
  assert.strictEqual(homeFor(team, { schoolId: 11 }), '/school');
});

test('a capability that needs a particular post says so', () => {
  // view.school opens the school's own workspace, and routes/school.js also
  // insists on a SCHOOL_TEAM post. An administrator holds the capability and
  // can never use it, so the picker marks it rather than offering a control
  // that silently does nothing.
  assert.ok(capabilityIsUsableBy('view.school', 'SCHOOL_TEAM'));
  assert.ok(!capabilityIsUsableBy('view.school', 'ADMIN'));
  assert.ok(!capabilityIsUsableBy('view.school', 'META_MENTOR'));

  // Everything else is usable by whoever holds it.
  CAPABILITIES.filter((c) => c !== 'view.school').forEach((c) => {
    ROLES.forEach((r) => assert.ok(capabilityIsUsableBy(c, r), `${c} should be usable by ${r}`));
  });
});

test('everyone can report a problem, whatever their role', () => {
  // The point of the baseline: whoever hits the broken thing is the person
  // best placed to describe it, so this must not depend on the kind of
  // account. A role added later inherits it without anyone remembering to.
  ROLES.forEach((role) => {
    assert.ok(
      capabilitiesFor(role, []).has('feedback.submit'),
      `${role} cannot report a problem`
    );
  });
  assert.deepStrictEqual(BASELINE_CAPABILITIES, ['feedback.submit']);
});

test('a baseline capability is a default, not a grant that cannot be withdrawn', () => {
  // An admin must still be able to switch it off for one person — otherwise
  // "baseline" would mean "unrevokable", which is a different promise.
  const revoked = capabilitiesFor('MINISTRY', [{ capability: 'feedback.submit', granted: false }]);
  assert.ok(!revoked.has('feedback.submit'));
  assert.ok(revoked.has('view.national'), 'and the rest of the role is untouched');
  // Revoking it is a real difference from the default, so it is stored.
  assert.deepStrictEqual(
    overridesFrom('MINISTRY', ['view.national', 'view.compliance']),
    [{ capability: 'feedback.submit', granted: false }]
  );
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

// --- what makes a post distinct -------------------------------------------

test('one person can hold the same role twice when the posts differ in name', () => {
  // The account owner holds three posts: administrator, coordinator of the
  // meta-mentors, and an ordinary meta-mentor view for seeing the platform the
  // way the people being supported see it. The last two share a role and have
  // no institution, so the label is the only thing separating them — which is
  // why routes/adminUsers.js counts the label as part of a post's identity.
  const coordinator = capabilitiesFor('META_MENTOR', overridesFrom('META_MENTOR', [
    ...ROLE_DEFAULTS.META_MENTOR, 'admin.users',
  ]));
  const plain = capabilitiesFor('META_MENTOR', []);

  assert.ok(coordinator.has('admin.users'), 'the coordinator can run the pilot');
  assert.ok(!plain.has('admin.users'), 'the plain mentor post cannot');
  assert.ok(!coordinator.has('admin.grant'),
    'and neither can set privileges — that belongs to the administrator post');

  // If the two granted the same thing, splitting them would record nothing.
  const same = [...coordinator].sort().join('|') === [...plain].sort().join('|');
  assert.ok(!same, 'two posts that grant the same thing are one post with two names');
});

test('three posts between them reach everything, without any one being everything', () => {
  const admin = capabilitiesFor('ADMIN', []);
  const coordinator = capabilitiesFor('META_MENTOR', overridesFrom('META_MENTOR', [
    ...ROLE_DEFAULTS.META_MENTOR, 'admin.users',
  ]));
  const plain = capabilitiesFor('META_MENTOR', []);

  const union = new Set([...admin, ...coordinator, ...plain]);
  CAPABILITIES.forEach((c) => assert.ok(union.has(c), `nothing should be out of reach: ${c}`));

  // The point of holding three rather than one: the audit trail records which
  // authority was actually in use, so routine work is not done under the
  // administrator post.
  assert.ok(coordinator.size < admin.size, 'the coordinator post is genuinely smaller');
  assert.ok(plain.size < coordinator.size, 'and the mentor post smaller still');
});
