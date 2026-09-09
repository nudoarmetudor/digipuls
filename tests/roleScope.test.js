const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { render, plural } = require('../scripts/role-scope');

// The role-scope document is full of counts — schools, districts, accounts,
// how many posts hold each capability. They used to be typed in, and two
// schools left the pilot the same afternoon it was published, so every figure
// was wrong within hours. Now every one is a token filled from the database.
//
// These tests cover the part that makes that safe: a token with no value must
// stop the build rather than ship a page that says "{{schools}}" or
// "undefined accounts" while looking authoritative.

test('a template with every value supplied renders', () => {
  const out = render('<p>{{schools}} schools in {{districts}} districts</p>',
    { schools: 12, districts: 12 });
  assert.strictEqual(out, '<p>12 schools in 12 districts</p>');
});

test('a token with no value stops the build', () => {
  assert.throws(
    () => render('<p>{{schools}} schools, {{accounts}} accounts</p>', { schools: 12 }),
    /accounts/,
    'the missing token must be named, so it is obvious what to add');
});

test('a value that is undefined or null is treated as missing, not printed', () => {
  // The failure this prevents: a query that returns nothing renders the word
  // "undefined" into a sentence about the pilot.
  [undefined, null].forEach((bad) => {
    assert.throws(() => render('<p>{{schools}}</p>', { schools: bad }), /schools/);
  });
});

test('zero is a real value and renders', () => {
  // Distinct from the case above: no schools yet to confirm a cycle is a fact
  // worth printing, not a missing value.
  assert.strictEqual(render('<p>{{noConfirmed}}</p>', { noConfirmed: 0 }), '<p>0</p>');
});

test('counts read like English rather than "1 school(s)"', () => {
  assert.strictEqual(plural(1, 'school', 'schools'), '1 school');
  assert.strictEqual(plural(12, 'school', 'schools'), '12 schools');
  assert.strictEqual(plural(0, 'school', 'schools'), '0 schools');
});

test('every token in the real template has a name the builder knows how to fill', () => {
  // Catches a token added to the template that the gather step was never
  // taught to produce — which would otherwise only surface at build time,
  // usually while trying to publish.
  const template = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'role-scope.template.html'), 'utf8');
  const tokens = [...new Set((template.match(/\{\{(\w+)\}\}/g) || [])
    .map((t) => t.slice(2, -2)))];

  assert.ok(tokens.length > 10, 'the template should be data-driven, not hand-typed');

  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'role-scope.js'), 'utf8');
  const { CAPABILITIES } = require('../src/services/capabilities');
  // Capability tokens are built from the capability list rather than written
  // out, so a new capability gets a slot on the page without anyone editing
  // the builder — check them against that list instead of against the source.
  const capTokens = new Set(CAPABILITIES.map((c) => 'cap_' + c.replace('.', '_')));

  const unknown = tokens.filter((t) => !capTokens.has(t) && !source.includes(t));
  assert.deepStrictEqual(unknown, [],
    'these tokens appear in the template but nothing in the builder produces them');

  const orphaned = [...capTokens].filter((t) => !tokens.includes(t));
  assert.deepStrictEqual(orphaned, [],
    'every capability should appear in the reference table — these are missing');
});

test('no figure is hard-coded in the template', () => {
  // A number typed straight into a sentence is exactly what went stale before.
  // Counts belong in tokens; years, legal references and indicator codes do not.
  const template = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'role-scope.template.html'), 'utf8');
  const body = template.slice(template.indexOf('<div class="wrap">'));
  const text = body
    .replace(/<[^>]+>/g, ' ')
    // Character entities carry digits of their own — &#259; is the Romanian
    // ă in "Echipa digitală" — and those are not figures about the pilot.
    .replace(/&#?\w+;/g, ' ')
    .replace(/\{\{\w+\}\}/g, ' ');

  const ALLOWED = new Set([
    '675',   // Order 675/2024, a legal reference
    '19',    // the instrument's indicator count, fixed by the framework
    '2',     // "Annex 2", and "level 2 upward"
    '5',     // "Annex 5"
    '1',     // "cycle 1"
    '0',     // "a genuine level 0" — a level on the instrument, not a count
    '500',   // an HTTP status, in the regression this page records
  ]);
  const numbers = [...new Set((text.match(/\b\d+\b/g) || []))].filter((n) => !ALLOWED.has(n));
  assert.deepStrictEqual(numbers, [],
    'these look like counts typed into the prose — they belong in {{tokens}}');
});
