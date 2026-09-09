#!/usr/bin/env node
//
// Rebuilds the role-scope document from the live database.
//
//   node scripts/role-scope.js [--out <file>]
//
// Why this exists: the document is a description of who can see what, and it
// is full of counts — schools, districts, accounts, posts, how many hold each
// capability. Those were typed in by hand, and two schools were removed from
// the pilot the same afternoon it was published, so every figure on the page
// was wrong within hours.
//
// So no figure in the template is written by a person. Every one of them is a
// {{token}} filled from a query here, and the build fails loudly if a token is
// left unfilled or a value comes back undefined — a page that quietly renders
// "{{schools}}" or "undefined accounts" is worse than one that is merely out
// of date, because it looks authoritative.
//
// The prose — the findings, the verdicts, what each role reaches — is in the
// template and stays there. Only the arithmetic is derived.
//
// Run it whenever schools or accounts change, then republish the artifact with
// the file it writes.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = path.join(__dirname, '..');
const prisma = require(path.join(APP, 'src/services/../config/db'));
const { CAPABILITIES, capabilitiesFor } = require(path.join(APP, 'src/services/capabilities'));
const { schoolsWithLatestCycle } = require(path.join(APP, 'src/services/schoolOverview'));

const TEMPLATE = path.join(__dirname, 'role-scope.template.html');

/** Runs the suite and reports what it actually says, rather than counting
 *  `test(` declarations — several tests are generated in a loop, so counting
 *  declarations under-reports by three. */
function testTotals() {
  try {
    const out = execFileSync('npm', ['test'], {
      cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true,
    });
    const pass = (out.match(/pass (\d+)/) || [])[1];
    const fail = (out.match(/fail (\d+)/) || [])[1];
    return { pass: Number(pass), fail: Number(fail) };
  } catch (e) {
    // A failing suite still prints its totals on stdout.
    const out = (e.stdout || '') + (e.stderr || '');
    const pass = (out.match(/pass (\d+)/) || [])[1];
    const fail = (out.match(/fail (\d+)/) || [])[1];
    if (pass === undefined) throw new Error('could not read the test totals');
    return { pass: Number(pass), fail: Number(fail) };
  }
}

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
      { cwd: APP, encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

const RO_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function today() {
  const d = new Date();
  return `${d.getDate()} ${RO_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Plural that reads like English rather than "1 school(s)". */
function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

async function gather() {
  const [schools, districts, accounts] = await Promise.all([
    prisma.school.count(),
    prisma.territory.count(),
    prisma.user.count(),
  ]);

  const posts = await prisma.assignment.findMany({
    where: { isActive: true },
    include: { capabilities: true, school: { include: { territory: true } }, territory: true },
  });

  const rows = await schoolsWithLatestCycle();
  const noConfirmed = rows.filter((r) => !r.confirmed).length;
  const withDraft = rows.filter((r) => !r.confirmed && r.cycle).length;

  const byRole = {};
  posts.forEach((p) => { byRole[p.role] = (byRole[p.role] || 0) + 1; });

  const holders = (cap) => posts.filter((p) => capabilitiesFor(p.role, p.capabilities).has(cap)).length;

  // A regional view resolves when the post names a district, or names a school
  // from which one can be derived, or is unscoped and therefore national.
  const regionalPosts = posts.filter((p) => capabilitiesFor(p.role, p.capabilities).has('view.regional'));
  const regionalResolving = regionalPosts.filter(
    (p) => p.territoryId || (p.school && p.school.territoryId) || (!p.schoolId && !p.territoryId)).length;

  const mentorPosts = posts.filter((p) => p.role === 'META_MENTOR');
  const mentorsWithSchool = mentorPosts.filter((p) => p.schoolId).length;

  const territorialPost = posts.find((p) => p.role === 'TERRITORIAL');
  let territorialName = '—';
  let territorialSchools = 0;
  if (territorialPost && territorialPost.territoryId) {
    territorialName = territorialPost.territory ? territorialPost.territory.name : '—';
    territorialSchools = await prisma.school.count({ where: { territoryId: territorialPost.territoryId } });
  }

  const tests = testTotals();

  const values = {
    schools,
    districts,
    accounts,
    posts: posts.length,
    noConfirmed,
    withDraft,
    schoolTeamPosts: byRole.SCHOOL_TEAM || 0,
    mentorPosts: mentorPosts.length,
    mentorsWithSchool,
    adminPosts: byRole.ADMIN || 0,
    ministryPosts: byRole.MINISTRY || 0,
    territorialPosts: byRole.TERRITORIAL || 0,
    partnerPosts: byRole.PARTNER || 0,
    strategicPosts: byRole.STRATEGIC_PARTNER || 0,
    regionalHolders: regionalPosts.length,
    regionalResolving,
    territorialName,
    territorialSchools: plural(territorialSchools, 'school', 'schools'),
    allSchools: plural(schools, 'school', 'schools'),
    testsPass: tests.pass,
    commit: currentCommit(),
    date: today(),
  };

  CAPABILITIES.forEach((c) => { values['cap_' + c.replace('.', '_')] = holders(c); });
  return values;
}

function render(template, values) {
  const missing = [];
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values) || values[key] === undefined || values[key] === null) {
      missing.push(key);
      return `{{${key}}}`;
    }
    return String(values[key]);
  });

  if (missing.length) {
    throw new Error('no value for: ' + [...new Set(missing)].join(', '));
  }
  const leftovers = out.match(/\{\{\w+\}\}/g);
  if (leftovers) throw new Error('unsubstituted tokens remain: ' + leftovers.join(', '));
  return out;
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outFile = outIdx > -1 ? process.argv[outIdx + 1] : path.join(APP, 'role-scope.html');

  const values = await gather();
  const template = fs.readFileSync(TEMPLATE, 'utf8');
  const html = render(template, values);
  fs.writeFileSync(outFile, html);

  console.log(`wrote ${outFile}\n`);
  const width = Math.max(...Object.keys(values).map((k) => k.length));
  Object.entries(values).forEach(([k, v]) => console.log(`  ${k.padEnd(width)}  ${v}`));
  if (values.testsPass !== undefined && Number.isFinite(values.testsPass)) {
    console.log(`\n${values.testsPass} tests passing at ${values.commit}`);
  }
}

// Exported so the substitution guard can be tested without a database: it is
// the whole reason this script exists, and a guard nobody tests is a guard
// nobody knows is working.
module.exports = { render, plural };

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
