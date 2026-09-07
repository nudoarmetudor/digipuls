const test = require('node:test');
const assert = require('node:assert');

const { extractWorkspace, makeHref, describe: describeAssignment } = require('../src/middleware/workspace');

// The point of all this: one person, several posts, and each browser tab
// working in exactly one of them. The active post travels in the URL rather
// than the session, because session state is shared across tabs and a cookie
// is shared across the whole browser — neither can keep two tabs apart.

function run(url) {
  const req = { url };
  extractWorkspace(req, {}, () => {});
  return req;
}

test('the workspace prefix is stripped, so routes never see it', () => {
  const req = run('/w/12/school/cycles/3');
  assert.strictEqual(req.requestedWorkspaceId, 12);
  assert.strictEqual(req.url, '/school/cycles/3', 'the router must see the plain path');
});

test('a bare workspace URL becomes the root path', () => {
  const req = run('/w/8');
  assert.strictEqual(req.requestedWorkspaceId, 8);
  assert.strictEqual(req.url, '/');

  const withSlash = run('/w/8/');
  assert.strictEqual(withSlash.requestedWorkspaceId, 8);
  assert.strictEqual(withSlash.url, '/');
});

test('query strings survive the rewrite', () => {
  const req = run('/w/3/ministry?band=251-500&sort=name-asc');
  assert.strictEqual(req.url, '/ministry?band=251-500&sort=name-asc');
});

test('paths that only look like a workspace prefix are left alone', () => {
  // A non-numeric id, or a route that merely starts with /w, must not be
  // silently swallowed.
  ['/wheel', '/w/abc/school', '/school/w/1', '/workspace'].forEach((url) => {
    const req = run(url);
    assert.strictEqual(req.url, url, `${url} should be untouched`);
    assert.strictEqual(req.requestedWorkspaceId, undefined);
  });
});

test('href() prefixes the links that belong to a post', () => {
  const href = makeHref(12);
  assert.strictEqual(href('/school'), '/w/12/school');
  assert.strictEqual(href('/school/cycles/3/plan'), '/w/12/school/cycles/3/plan');
  assert.strictEqual(href('/ministry?band=251-500'), '/w/12/ministry?band=251-500');
  assert.strictEqual(href('/'), '/w/12');
});

test('href() leaves alone the routes that mean the same in every post', () => {
  const href = makeHref(12);
  // These act on the person, or on nobody at all — prefixing them would make
  // the language switcher and the logout button post-specific, which they
  // are not.
  ['/login', '/logout', '/lang/ru', '/preferences', '/change-password',
    '/workspace', '/public-view/schools', '/public-view/schools/4'].forEach((path) => {
    assert.strictEqual(href(path), path, `${path} must not be workspace-scoped`);
  });
});

test('href() passes through anything that is not an internal path', () => {
  const href = makeHref(12);
  assert.strictEqual(href('https://example.md'), 'https://example.md');
  assert.strictEqual(href('#main'), '#main');
  assert.strictEqual(href(undefined), undefined);
  assert.strictEqual(href(null), null);
});

test('two workspaces produce two independent link spaces', () => {
  // This is what makes two tabs possible: the same page, addressed two ways.
  const asMentor = makeHref(7);
  const asCoordinator = makeHref(8);
  assert.strictEqual(asMentor('/ministry'), '/w/7/ministry');
  assert.strictEqual(asCoordinator('/ministry'), '/w/8/ministry');
  assert.notStrictEqual(asMentor('/school'), asCoordinator('/school'));
});

test('describe() exposes the institution under either scope', () => {
  const school = describeAssignment({
    id: 7, role: 'META_MENTOR', label: null, schoolId: 1, territoryId: null,
    school: { name: 'LT Boris Dînga' }, territory: null,
  });
  assert.strictEqual(school.schoolName, 'LT Boris Dînga');
  assert.strictEqual(school.territoryName, null);

  const territory = describeAssignment({
    id: 9, role: 'TERRITORIAL', label: 'Raion', schoolId: null, territoryId: 4,
    school: null, territory: { name: 'Criuleni' },
  });
  assert.strictEqual(territory.territoryName, 'Criuleni');
  assert.strictEqual(territory.label, 'Raion');
});

test('the worked example holds together', () => {
  // Elena Guriță: meta-mentor for LT „Boris Dînga", coordinator for
  // LT „Gaudeamus", one account. Two posts, two link spaces, and the school
  // routes scoped to whichever school the active post names.
  const { capabilitiesFor } = require('../src/services/capabilities');
  const mentor = { id: 7, role: 'META_MENTOR', schoolId: 11, capabilities: [] };
  const coordinator = { id: 8, role: 'SCHOOL_TEAM', schoolId: 22, capabilities: [] };

  const mentorCaps = capabilitiesFor(mentor.role, mentor.capabilities);
  const coordCaps = capabilitiesFor(coordinator.role, coordinator.capabilities);

  assert.ok(mentorCaps.has('view.national'), 'the mentor post sees the oversight views');
  assert.ok(!mentorCaps.has('view.school'), 'and not a school workspace');
  assert.ok(coordCaps.has('view.school'), 'the coordinator post sees its school');
  assert.ok(!coordCaps.has('view.national'), 'and not the national dashboard');

  // Never both at once in one tab: the capability set comes from exactly one
  // post, so the two can't merge.
  const merged = [...mentorCaps].filter((c) => coordCaps.has(c));
  assert.deepStrictEqual(merged, [], 'the two posts share no capabilities to blur together');
});
