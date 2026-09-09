const test = require('node:test');
const assert = require('node:assert');

const {
  CAPABILITIES, CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS,
  capabilitiesFor, overridesFrom, homeFor, canOpenSchoolWorkspace,
  SCHOOL_ROLES, roleNeedsSchool, roleNeedsTerritory, roleAllowsTerritory,
  BASELINE_CAPABILITIES, defaultsFor, capabilityIsUsableBy, CAPABILITY_REQUIRES_ROLE,
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
  assert.strictEqual(homeFor(capabilitiesFor('SCHOOL_MENTOR', []), withSchool), '/school');
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
  const caps = capabilitiesFor('SCHOOL_MENTOR', []);
  // This used to land on /feedback, because every role holds feedback.submit
  // and that was the first entry left in the table. Reachable, but it does not
  // answer "where am I supposed to start" — the account is misconfigured and
  // nothing on the report panel says so. /school now explains it: an
  // administrator has not attached a school to this post.
  assert.strictEqual(homeFor(caps, { schoolId: null }), '/school');
  // With a school, the same route is the actual workspace.
  assert.strictEqual(homeFor(caps, { schoolId: 4 }), '/school');

  // Stripped of everything, it still gets a page rather than a redirect loop.
  const stripped = capabilitiesFor('SCHOOL_MENTOR', [
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
  const team = capabilitiesFor('SCHOOL_MENTOR', []);
  assert.strictEqual(homeFor(team, { schoolId: 11 }), '/school');
});

test('a capability that needs a particular post says so', () => {
  // Some capabilities need more than themselves: the routes under /school also
  // insist on a school-side post, so an administrator holds view.school and
  // can never use it. The picker marks those rather than offering a control
  // that silently does nothing.
  //
  // Derived from CAPABILITY_REQUIRES_ROLE rather than listed here, so a
  // capability added to that map is covered the day it is added.
  Object.entries(CAPABILITY_REQUIRES_ROLE).forEach(([capability, needed]) => {
    const allowed = Array.isArray(needed) ? needed : [needed];
    allowed.forEach((role) => assert.ok(capabilityIsUsableBy(capability, role),
      `${capability} should be usable by ${role}`));
    ROLES.filter((r) => !allowed.includes(r)).forEach((role) => {
      assert.ok(!capabilityIsUsableBy(capability, role),
        `${capability} should be marked as unusable by ${role}`);
    });
  });

  // The school workspace is the case this was built for.
  assert.ok(capabilityIsUsableBy('view.school', 'SCHOOL_MENTOR'));
  assert.ok(!capabilityIsUsableBy('view.school', 'ADMIN'));
  assert.ok(!capabilityIsUsableBy('view.school', 'META_MENTOR'));

  // Everything not in the map is usable by whoever holds it.
  CAPABILITIES.filter((c) => !(c in CAPABILITY_REQUIRES_ROLE)).forEach((c) => {
    ROLES.forEach((r) => assert.ok(capabilityIsUsableBy(c, r), `${c} should be usable by ${r}`));
  });
});

test('only the principal and the deputy can run a school', () => {
  // Opening and confirming a cycle, deciding what the plan aims at, publishing
  // anything, and creating the school's own accounts. A mentor does the work
  // inside a cycle; they do not decide that one is starting or closing.
  const MANAGEMENT = ['school.manage', 'school.publish', 'school.accounts'];

  ['SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY'].forEach((role) => {
    MANAGEMENT.forEach((c) => assert.ok(capabilitiesFor(role, []).has(c),
      `${role} should hold ${c}`));
  });

  const mentor = capabilitiesFor('SCHOOL_MENTOR', []);
  MANAGEMENT.forEach((c) => assert.ok(!mentor.has(c), `a mentor must not hold ${c}`));
  assert.ok(mentor.has('view.school'), 'but a mentor still works on the assessment');

  // The two management positions are equivalent: which of them holds the post
  // is recorded in the audit trail, not enforced as a difference in power.
  const principal = [...capabilitiesFor('SCHOOL_PRINCIPAL', [])].sort().join('|');
  const deputy = [...capabilitiesFor('SCHOOL_DEPUTY', [])].sort().join('|');
  assert.strictEqual(principal, deputy);
});

test('a school can only ever create mentors, for its own school', () => {
  // The bound that matters: school.accounts must not become a way to climb.
  // Whatever a principal creates holds strictly less than they do.
  const principal = capabilitiesFor('SCHOOL_PRINCIPAL', []);
  const created = capabilitiesFor('SCHOOL_MENTOR', []);

  [...created].forEach((c) => assert.ok(principal.has(c),
    `a created account must not hold ${c}, which its creator does not`));
  assert.ok(created.size < principal.size, 'and must hold strictly less');
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

test('a meta-mentor only exists in relation to a school', () => {
  // The position is "meta-mentor for LT „Boris Dînga”" — there is no such
  // thing as a meta-mentor at large. One per school, twelve in the group.
  assert.ok(roleNeedsSchool('META_MENTOR'),
    'a meta-mentor post without a school is not a position, it is a mistake');
  assert.ok(!roleAllowsTerritory('META_MENTOR'),
    'their district follows from their school rather than being set separately');
});

test('a meta-coordinator coordinates mentors, not an institution', () => {
  // Drawn from among the twelve, and leading the group: sessions, coaching,
  // reporting, deliverables. It used to be modelled as a meta-mentor carrying
  // an extra permission, which made a distinct position look like a footnote
  // on another one.
  assert.ok(ROLES.includes('META_COORDINATOR'));
  assert.ok(!roleNeedsSchool('META_COORDINATOR'), 'names no school');
  assert.ok(!roleNeedsTerritory('META_COORDINATOR'), 'and no district');

  const coordinator = capabilitiesFor('META_COORDINATOR', []);
  const mentor = capabilitiesFor('META_MENTOR', []);

  assert.ok(coordinator.has('admin.users'), 'can run the group: add a mentor, reissue a password');
  assert.ok(!mentor.has('admin.users'), 'an ordinary mentor cannot');
  assert.ok(!coordinator.has('admin.grant'),
    'but deciding what any post may do stays with the administrator');
  assert.ok(!coordinator.has('view.school'),
    'and coordinating mentors is not editing a school');
});

test('nobody in the mentoring line can edit a school', () => {
  // Every change to a school's record is made by that school. A mentor watches
  // the live status, drafts included, and advises.
  ['META_MENTOR', 'META_COORDINATOR'].forEach((role) => {
    assert.ok(!capabilitiesFor(role, []).has('view.school'),
      `${role} must not hold the school editing capability`);
  });
});

test('the three school positions can all work on their own assessment', () => {
  // Five or six people per school: a principal, a deputy, and about five
  // mentors. The two-track split between administration and team is a
  // workflow question, not a permissions boundary, and is not modelled yet.
  SCHOOL_ROLES.forEach((role) => {
    assert.ok(capabilitiesFor(role, []).has('view.school'), `${role} works on the assessment`);
    assert.ok(roleNeedsSchool(role), `${role} must name a school`);
    assert.ok(capabilityIsUsableBy('view.school', role), `${role} can actually use it`);
  });
  assert.deepStrictEqual(SCHOOL_ROLES,
    ['SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY', 'SCHOOL_MENTOR']);
});

test('the oversight roles read results and take no part in producing them', () => {
  // The ministry, the territorial agency, the financing partner and the
  // development partner. None of them can touch a school's record.
  ['MINISTRY', 'TERRITORIAL', 'PARTNER', 'STRATEGIC_PARTNER'].forEach((role) => {
    const caps = capabilitiesFor(role, []);
    assert.ok(!caps.has('view.school'), `${role} must not edit a school`);
    assert.ok(![...caps].some((c) => c.startsWith('admin.')),
      `${role} must hold no administrative power`);
  });

  // The territorial agency has the ministry's function bounded to one district,
  // so it is the one oversight role that names an institution.
  assert.ok(roleNeedsTerritory('TERRITORIAL'));
  assert.ok(!roleNeedsTerritory('MINISTRY'), 'the ministry reads nationally');
});

test('the three posts a coordinator holds are nested, not identical', () => {
  // Someone who coordinates the group is also one of the twelve mentors, and
  // on this instance also administers the platform. Three posts, and the point
  // of keeping them apart is that the audit trail records which authority was
  // in use — so routine mentoring is not done under the administrator post.
  const admin = capabilitiesFor('ADMIN', []);
  const coordinator = capabilitiesFor('META_COORDINATOR', []);
  const mentor = capabilitiesFor('META_MENTOR', []);

  const union = new Set([...admin, ...coordinator, ...mentor]);
  CAPABILITIES.forEach((c) => assert.ok(union.has(c), `nothing should be out of reach: ${c}`));

  assert.ok(coordinator.size < admin.size, 'the coordinator post is genuinely smaller');
  assert.ok(mentor.size < coordinator.size, 'and the mentor post smaller still');

  // Nested: a mentor can do nothing a coordinator cannot.
  [...mentor].forEach((c) => assert.ok(coordinator.has(c),
    `a coordinator should also be able to ${c}`));
});
