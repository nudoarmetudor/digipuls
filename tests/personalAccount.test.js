const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  nameProblem, isPersonalName, normaliseName, suggestLogin, fold,
} = require('../src/services/personalAccount');

// One account, one person. The pilot spent its first weeks on twelve shared
// logins — "Echipa digitală — <school>", handed round a staffroom — and every
// signature in the audit trail was therefore unattributable. These tests hold
// the two rules that replaced them: a school account must be named after a
// person, and a credential nobody has claimed cannot be used.

test('a person’s name passes', () => {
  ['Guriță Elena', 'Băț Iulia', 'Calistru Victoria', 'Ion Popescu',
    'Anna Militan', 'Godovaniuc Sergiu'].forEach((name) => {
    assert.strictEqual(nameProblem(name), null, name);
    assert.ok(isPersonalName(name), name);
  });
});

test('the name of a body does not', () => {
  // The exact strings the twelve shared accounts carried, and the shapes the
  // same shortcut takes in the other two languages.
  [
    'Echipa digitală — LT Petru Zadnipru',
    'Echipa digitală',
    'ECHIPA DIGITALA',
    'Administrația liceului',
    'Digital team',
    'Shared account',
    'Команда школы',
    'Администрация',
  ].forEach((name) => {
    assert.strictEqual(nameProblem(name), 'collective', name);
  });
});

test('one word is a handle, not a name', () => {
  assert.strictEqual(nameProblem('Ion'), 'incomplete');
  assert.strictEqual(nameProblem('gurita'), 'incomplete');
  assert.strictEqual(nameProblem(''), 'missing');
  assert.strictEqual(nameProblem('   '), 'missing');
});

test('a surname that merely starts like a collective word is fine', () => {
  // The rule matches whole words, so it must not catch these. If it ever
  // does, a real person is locked out of the platform by a regex.
  ['Echim Vasile', 'Grupenco Maria', 'Contu Ana', 'Scobioală Radu']
    .forEach((name) => assert.strictEqual(nameProblem(name), null, name));
});

test('the two ways Romanian writes ș and ț are the same letter here', () => {
  // U+0219 (comma below) and U+015F (cedilla) are different code points, and
  // a school will type whichever its keyboard produces.
  assert.strictEqual(fold('Şcoala'), fold('Școala'));
  assert.strictEqual(nameProblem('Şcoala primară'), 'collective');
  assert.strictEqual(nameProblem('Școala primară'), 'collective');
});

test('spacing is tidied rather than treated as a different name', () => {
  assert.strictEqual(normaliseName('  Ion   Popescu '), 'Ion Popescu');
});

test('a personal handle is offered in place of an institutional one', () => {
  assert.strictEqual(suggestLogin('Guriță Elena'), 'gurita.elena');
  assert.strictEqual(suggestLogin('Băț Iulia'), 'bat.iulia');
  // Nothing usable to derive: better to ask than to hand someone a mangled
  // handle they would have to correct anyway.
  assert.strictEqual(suggestLogin('Ion'), null);
});

// --- the rule where it is actually enforced ---------------------------------
//
// The service above is only advice until something calls it. These read the
// routes, because a validation helper that no route uses is the classic way
// for a rule like this to be quietly true and completely ineffective.

function source(file) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
}

test('a school cannot create a shared account', () => {
  const s = source('routes/schoolAccounts.js');
  assert.match(s, /nameProblem\(name\)/,
    'the school account form must check the name against the rule');
  assert.match(s, /identityConfirmedAt: new Date\(\)/,
    'an account created for a named person has nothing left to claim');
});

test('an administrator cannot create or rename a school account into a shared one', () => {
  const s = source('routes/adminUsers.js');
  assert.match(s, /SCHOOL_ROLES\.includes\(role\) \? nameProblem\(name\) : null/,
    'creating a school-level account must check the name');
  assert.match(s, /assignments\.some\(\(a\) => SCHOOL_ROLES\.includes\(a\.role\)\)/,
    'renaming a school-level account must check it too');
});

test('an unclaimed credential reaches nothing but the claim screen', () => {
  const s = source('app.js');
  assert.match(s, /identityConfirmed === false/,
    'the gate must be on the flag, not on a role or a name');
  assert.match(s, /redirect\('\/claim-account'\)/);
  // The password gate has to come first: someone arriving with a one-time
  // credential sets a password, then says who they are.
  assert.ok(s.indexOf("redirect('/change-password')") < s.indexOf("redirect('/claim-account')"),
    'the password change is asked for before the identity');
});

test('claiming an account records which login became whose', () => {
  const s = source('routes/auth.js');
  assert.match(s, /IDENTITY_CONFIRMED/,
    'the audit trail is the reason this screen exists');
  assert.match(s, /identityConfirmedAt: new Date\(\)/);
  assert.match(s, /claim_err_login_taken/,
    'a new handle must not collide with someone else’s');
});

test('the migration un-claims the shared logins and leaves everyone else alone', () => {
  const sql = fs.readFileSync(path.join(
    __dirname, '..', 'prisma', 'migrations',
    '20260909210000_personal_accounts', 'migration.sql'), 'utf8');

  // Order matters: mark everything claimed, *then* un-claim the shared ones.
  // The other way round would re-claim the very accounts it just released and
  // silently do nothing at all.
  const claimAll = sql.indexOf('COALESCE(`createdAt`');
  const unclaim = sql.indexOf('= NULL');
  assert.ok(claimAll > 0 && unclaim > claimAll,
    'existing accounts are claimed before the shared ones are released');
  assert.match(sql, /Echipa digital%/);
  assert.match(sql, /SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY', 'SCHOOL_MENTOR/,
    'only school-level accounts are affected');
});
