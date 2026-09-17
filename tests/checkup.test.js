const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ejs = require('ejs');

// Regressions for what the end-to-end check-up of September 2026 found on the
// live site. Each of these was a real behaviour a school would have met.

const { ADMINISTRATION, TEAM, AGREED, reconciliation, maskForTrack } = require('../src/services/tracks');
const { reportLines, buildSnapshot, INTERIM, FINAL } = require('../src/services/reportService');
const { floorCodes, pick } = require('../src/services/cycleService');
const { DEVICE_FIELDS, NETWORK_FIELDS } = require('../src/data/order675');
const { EVIDENCE_TYPES } = require('../src/data/evidenceTypes');
const i18n = require('../src/i18n');

const VIEWS = path.join(__dirname, '..', 'src', 'views');

test('the agreed level is hidden from someone who has not answered and cannot settle', () => {
  const ratings = [
    { indicatorCode: 'A1', track: ADMINISTRATION, level: 5 },
    { indicatorCode: 'A1', track: AGREED, level: 5 },
    { indicatorCode: 'A2', track: TEAM, level: 2 },
    { indicatorCode: 'A2', track: AGREED, level: 3 },
  ];
  const rows = reconciliation(ratings, [{ code: 'A1' }, { code: 'A2' }]);

  const mentor = maskForTrack(rows, TEAM, { hideAgreed: true });
  assert.strictEqual(mentor[0].agreedLevel, null, 'a mentor who has not rated A1 must not read the agreed 5');
  assert.ok(mentor[0].agreedHidden);
  // Once they have answered, the agreed level is theirs to see.
  assert.strictEqual(mentor[1].agreedLevel, 3);
  assert.ok(!mentor[1].agreedHidden);

  // The principal wrote the agreed level; hiding it from them would only make
  // them overwrite it by accident.
  const principal = maskForTrack(rows, ADMINISTRATION, { hideAgreed: false });
  assert.strictEqual(principal[1].agreedLevel, 3);
});

test('a KPI keeps its year-one result when the year-two result is recorded', () => {
  const rows = [{
    indicator: { code: 'B1', name: 'Predare' },
    intent: 'ADVANCE', currentLevel: 1, targetLevel: 3,
    initiatives: [{
      id: 1, title: 'Formare', status: 'DONE', responsibleUser: null, responsibleName: 'X',
      supervisorUser: null, supervisorName: null, dueOn: null,
      kpis: [{ id: 7, measure: 'Profesori instruiți', target: '80%', actual: '60%', finalActual: '85%' }],
    }],
  }];

  const interim = reportLines(rows, INTERIM)[0].kpis[0];
  assert.strictEqual(interim.actual, '60%');
  assert.strictEqual(interim.interimActual, undefined);

  const final = reportLines(rows, FINAL)[0].kpis[0];
  assert.strictEqual(final.actual, '85%');
  assert.strictEqual(final.interimActual, '60%', 'the final report shows year one beside year two');

  const snap = buildSnapshot(rows, { kind: FINAL, narrative: null, publishedAt: new Date() });
  assert.strictEqual(snap.lines[0].kpis[0].interimActual, '60%');
  assert.strictEqual(snap.progress.recorded, 1);
});

test('the final report counts year-two results, not year-one ones', () => {
  const rows = [{
    indicator: { code: 'B1', name: 'x' }, intent: 'ADVANCE', currentLevel: 1, targetLevel: 2,
    initiatives: [{ id: 1, title: 't', status: 'IN_PROGRESS', kpis: [{ id: 1, measure: 'm', target: 't', actual: '1', finalActual: null }] }],
  }];
  assert.strictEqual(buildSnapshot(rows, { kind: FINAL }).progress.recorded, 0);
  assert.strictEqual(buildSnapshot(rows, { kind: INTERIM }).progress.recorded, 1);
});

test('D1 and D2 are held at 0 by whichever part of Order 675 fails', () => {
  const school = { enrolmentTotal: 300, classroomsTotal: 12, studentsGrades7to12: 150 };
  const allNetwork = Object.fromEntries(NETWORK_FIELDS.map((f) => [f, true]));
  assert.deepStrictEqual(floorCodes(school, null, null), ['D1', 'D2']);
  assert.deepStrictEqual(floorCodes(school, null, allNetwork), ['D2']);
  assert.ok(floorCodes(school, null, { ...allNetwork, firewallActive: false }).includes('D1'));
});

test('a renewal carries write-off counts forward with the devices', () => {
  const prior = { id: 9, cycleId: 3 };
  DEVICE_FIELDS.forEach((f, i) => { prior[f] = 10 + i; prior[`${f}Obsolete`] = i; });
  const copied = pick(prior, DEVICE_FIELDS.flatMap((f) => [f, `${f}Obsolete`]));
  assert.strictEqual(copied.classroomPCs, 10);
  assert.strictEqual(copied.interactivePanelsObsolete, 1);
  assert.strictEqual(Object.keys(copied).length, DEVICE_FIELDS.length * 2);
  assert.ok(!('id' in copied) && !('cycleId' in copied), 'identity columns are not copied');
  assert.deepStrictEqual(pick(null, DEVICE_FIELDS), {});
});

test('the evidence form offers exactly the types the server accepts', () => {
  const form = fs.readFileSync(path.join(VIEWS, 'school', '_indicator-block.ejs'), 'utf8');
  const offered = [...form.matchAll(/\['([a-z_]+)', t\('ev_/g)].map((m) => m[1]);
  assert.deepStrictEqual(offered.sort(), [...EVIDENCE_TYPES].sort());
});

test('the step buttons keep the post in their links', () => {
  const html = ejs.render(fs.readFileSync(path.join(VIEWS, 'school', '_step-nav.ejs'), 'utf8'), {
    cycle: { id: 24, status: 'DRAFT' },
    stepStatuses: ['A', 'B', 'C', 'D', 'infra', 'review'].map((key) => ({
      key, kind: key === 'review' ? 'review' : key === 'infra' ? 'infra' : 'domain', status: 'grey',
    })),
    activeStep: 'A',
    t: i18n.t('ro'),
    href: (p) => `/w/268${p}`,
  });
  const links = [...html.matchAll(/<a href="([^"]+)" class="step-pill/g)].map((m) => m[1]);
  assert.strictEqual(links.length, 6);
  links.forEach((l) => assert.ok(l.startsWith('/w/268/school/cycles/24/'), l));
});

test('the evidence refusal exists in every language', () => {
  ['en', 'ro', 'ru'].forEach((lang) => {
    const msg = i18n.t(lang)('err_evidence_missing', { n: 2, codes: 'A3, B2' });
    assert.ok(msg.includes('A3, B2') && !msg.includes('err_evidence_missing'), `${lang}: ${msg}`);
  });
  ['report_year_one', 'report_year_two'].forEach((key) => ['en', 'ro', 'ru'].forEach((lang) => {
    assert.notStrictEqual(i18n.t(lang)(key), key, `${lang} ${key}`);
  }));
});

const { summariseDomains, isEvidenceLink } = require('../src/services/assessmentSummary');

test('domain averages leave unrated parameters out and name the strongest and weakest', () => {
  const indicators = [
    { code: 'A1', domain: 'A', levels: [] }, { code: 'A2', domain: 'A', levels: [] },
    { code: 'B1', domain: 'B', levels: [] }, { code: 'C1', domain: 'C', levels: [] },
  ];
  const ratings = [
    { indicatorCode: 'A1', level: 3 }, { indicatorCode: 'A2', level: null },
    { indicatorCode: 'B1', level: 0 }, { indicatorCode: 'C1', level: 2 },
  ];
  const s = summariseDomains(ratings, indicators, { A: 'Leadership' });
  const a = s.domains.find((d) => d.code === 'A');
  assert.strictEqual(a.average, 3, 'a blank is not a 0');
  assert.strictEqual(a.rated, 1);
  assert.strictEqual(s.domains.find((d) => d.code === 'B').average, 0, 'a 0 is an answer');
  assert.strictEqual(s.domains.find((d) => d.code === 'D').average, null);
  assert.deepStrictEqual(s.strongest, ['A']);
  assert.deepStrictEqual(s.weakest, ['B']);

  const level = summariseDomains([{ indicatorCode: 'A1', level: 2 }, { indicatorCode: 'B1', level: 2 }], indicators);
  assert.deepStrictEqual(level.strongest, [], 'domains level with each other have no strongest');
});

test('only http and https sources become links', () => {
  assert.ok(isEvidenceLink('https://drive.google.com/file/d/abc/view'));
  assert.ok(isEvidenceLink(' http://school.md/plan.pdf '));
  assert.ok(!isEvidenceLink('javascript:alert(1)'));
  assert.ok(!isEvidenceLink('dosarul nr. 3, cabinetul directorului'));
  assert.ok(!isEvidenceLink('https://x.md/"onmouseover="alert(1)'));
});

const { sideLevel } = require('../src/services/tracks');

test('a side reads as the middle of its members, rounded down', () => {
  assert.strictEqual(sideLevel([]), null);
  assert.strictEqual(sideLevel([null, undefined]), null);
  assert.strictEqual(sideLevel([3]), 3);
  assert.strictEqual(sideLevel([2, 4]), 2);
  assert.strictEqual(sideLevel([4, 1, 3]), 3);
  assert.strictEqual(sideLevel([0, 5, 5, 1]), 1);
});

test('each person’s reading is kept, and the spread within a side is visible', () => {
  const ratings = [
    { indicatorCode: 'A1', track: TEAM, level: 2 },
    { indicatorCode: 'A1', track: ADMINISTRATION, level: 3 },
  ];
  const personal = [
    { indicatorCode: 'A1', track: TEAM, userId: 2, level: 1, user: { name: 'Ion' } },
    { indicatorCode: 'A1', track: TEAM, userId: 3, level: 4, user: { name: 'Ana' } },
    { indicatorCode: 'A1', track: ADMINISTRATION, userId: 1, level: 3, user: { name: 'Elena' } },
  ];
  const [row] = reconciliation(ratings, [{ code: 'A1' }], personal);
  assert.deepStrictEqual(row.readings[TEAM].map((r) => r.name), ['Ana', 'Ion']);
  assert.strictEqual(row.spread[TEAM], 3);
  assert.strictEqual(row.spread[ADMINISTRATION], 0);
});

test('a colleague having answered does not open the row for you', () => {
  const ratings = [
    { indicatorCode: 'A1', track: TEAM, level: 4 },
    { indicatorCode: 'A1', track: ADMINISTRATION, level: 2 },
    { indicatorCode: 'A2', track: TEAM, level: 3 },
    { indicatorCode: 'A2', track: ADMINISTRATION, level: 3 },
  ];
  const personal = [
    { indicatorCode: 'A1', track: TEAM, userId: 9, level: 4, user: { name: 'Colleague' } },
    { indicatorCode: 'A2', track: TEAM, userId: 7, level: 3, user: { name: 'Me' } },
  ];
  const rows = reconciliation(ratings, [{ code: 'A1' }, { code: 'A2' }], personal);
  const masked = maskForTrack(rows, TEAM, { hideAgreed: true, answered: new Set(['A2']) });
  assert.ok(masked[0].hidden, 'A1 was answered by a colleague, not by me');
  assert.strictEqual(masked[0].teamLevel, null, 'my side’s reading is a colleague’s here, so it is hidden too');
  assert.strictEqual(masked[0].administrationLevel, null);
  assert.deepStrictEqual(masked[0].readings[TEAM], []);
  assert.ok(!masked[1].hidden);
  assert.strictEqual(masked[1].administrationLevel, 3);
});
