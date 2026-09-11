const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const ejs = require('ejs');

const i18n = require('../src/i18n');
const prefsUtil = require('../src/utils/prefs');
const { getIndicatorData } = require('../src/data/indicatorsI18n');
const { ENROLMENT_BANDS, checkDeviceCompliance, checkNetworkCompliance } = require('../src/data/order675');
const { renderWheel, itemsFromRatings, itemsFromDomainScores } = require('../src/services/wheelChart');
const { computeStepStatuses, finalizeReviewStatus, progressSummary } = require('../src/services/stepStatus');
const {
  CAPABILITIES, CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS, capabilitiesFor, defaultsFor,
  capabilityIsUsableBy, CAPABILITY_REQUIRES_ROLE,
} = require('../src/services/capabilities');
const { developerBlock, SEVERITIES, STATUSES } = require('../src/services/feedbackContext');
const { buildTour } = require('../src/services/tour');
const {
  describe: describeWorkspace, describeInSchool,
} = require('../src/middleware/workspace');

// Built through the middleware rather than written out by hand, so a field
// the views start reading cannot be missing here and present in production.
function ws(id, role, opts = {}) {
  return describeWorkspace({
    id, role, label: opts.label || null,
    schoolId: opts.school ? opts.school.id : null,
    school: opts.school || null,
    territoryId: opts.territory ? opts.territory.id : null,
    territory: opts.territory || null,
  });
}
const DINGA = { id: 1, name: 'LT Boris Dînga', territoryId: null, territory: null };
const GAUDEAMUS = { id: 2, name: 'LT Gaudeamus', territoryId: null, territory: null };
const GHIBU = { id: 3, name: 'LT Onisifor Ghibu', territoryId: null, territory: null };

const VIEWS = path.join(__dirname, '..', 'src', 'views');

// Renders every page template against realistic fixtures, once per language.
// This is the cheap version of clicking through the whole app three times:
// it catches EJS syntax errors, locals a view forgot to receive, and — the
// reason it exists — any English string left hardcoded in a view, which is
// invisible in English and obvious here.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeRatings(indicators, level = 3) {
  return indicators.map((ind, i) => ({
    id: i + 1,
    indicatorCode: ind.code,
    level: i % 5 === 0 ? null : level,
    changeState: i % 3 === 0 ? 'GREW' : null,
    comment: i % 4 === 0 ? 'A comment' : null,
    evidences: level >= 2 && i % 2 === 0
      ? [{ id: i, type: 'document', description: 'Some evidence', source: 'Minutes' }]
      : [],
  }));
}

const DEVICE_INVENTORY = {
  classroomPCs: 10, interactivePanels: 10, itRoomPCs: 15, managementPCs: 3,
  methodicalCentrePCs: 3, libraryPCs: 4, printers: 1, multifunctionPrinters: 1,
};
const NETWORK_CHECKLIST = {
  wifiWholeSchool: true, subnetsSeparated: true, wifi80211n: true,
  wifi80211ac: false, firewallActive: true, contentFiltering: false,
};

function makeSchool() {
  return {
    id: 1, name: 'Liceul Teoretic „Mihai Eminescu”', simeId: 'SIME-0001',
    territory: { id: 1, name: 'Chișinău' }, territoryId: 1,
    enrolmentTotal: 400, studentsGrades7to12: 120, classroomsTotal: 20,
    enrolmentBand: '251-500', publicDisclosureOptIn: true,
    cycles: [{ id: 1, cycleNumber: 1, status: 'CONFIRMED', confirmedAt: new Date('2026-03-01'), startedAt: new Date('2026-01-01') }],
  };
}

function makeCycle(indicators, status = 'DRAFT') {
  return {
    id: 1, cycleNumber: 2, status,
    startedAt: new Date('2026-01-01'),
    confirmedAt: status === 'CONFIRMED' ? new Date('2026-03-01') : null,
    previousCycleId: 1,
    ratings: makeRatings(indicators),
    deviceInventory: DEVICE_INVENTORY,
    networkChecklist: NETWORK_CHECKLIST,
    plan: {
      id: 1, publishedAt: new Date('2026-04-01'), fundingSource: 'School budget',
      approvingAuthority: 'Pedagogical council', stakeholderConsultationNotes: 'Consulted',
      priorities: [{
        id: 1, indicatorCode: 'A1', indicator: { name: indicators[0].name },
        currentLevel: 2, targetLevel: 4, rationale: 'Because', actions: 'Do things',
        responsible: 'Director', timeline: 'Months 1-6', outcomeStatus: null,
      }],
    },
  };
}

function overviewRow(school, cycle) {
  return {
    school,
    cycle,
    confirmed: cycle.status === 'CONFIRMED',
    hasNewerDraft: true,
    domainScores: { A: 2.4, B: 3.1, C: 1.8, D: null },
    deviceCompliance: checkDeviceCompliance(school, DEVICE_INVENTORY),
    networkCompliance: checkNetworkCompliance(NETWORK_CHECKLIST),
  };
}

// ---------------------------------------------------------------------------
// The template list: [file, extra locals], built per language.
// ---------------------------------------------------------------------------
// One advancing parameter with an initiative and a measure, and one being
// held. Enough for every branch the plan pages take.
const samplePlan = {
  id: 1, cycleId: 4, publishedAt: null,
  startsOn: new Date('2026-09-01'), endsOn: new Date('2028-09-01'),
  fundingSource: null, approvingAuthority: null, stakeholderConsultationNotes: null,
};

const planRowsFixture = [
  {
    indicator: { code: 'A1', name: 'Viziune' },
    priority: { id: 11, rationale: 'Consiliul a cerut acest lucru' },
    intent: 'ADVANCE', currentLevel: 2, targetLevel: 4, advancing: true,
    requirements: {
      level: 4, levelName: 'Integrare', description: 'Descrierea nivelului',
      benchmarks: [{ key: 'engagement', value: '≥50%' }],
    },
    initiatives: [{
      id: 21, title: 'Formarea cadrelor didactice', description: 'Trei sesiuni pe an',
      responsibleUserId: 2, responsibleUser: { id: 2, name: 'Elena Guriță' }, responsibleName: null,
      supervisorUserId: null, supervisorUser: null, supervisorName: 'Ion Popescu',
      startsOn: new Date('2026-10-01'), dueOn: new Date('2027-06-01'), status: 'IN_PROGRESS',
      kpis: [{ id: 31, measure: 'Cadre formate', target: '80%', actual: null }],
    }],
    initiativeCount: 1, needsInitiatives: false,
  },
  {
    indicator: { code: 'A2', name: 'Conducere' },
    priority: { id: 12, rationale: null },
    intent: 'MAINTAIN', currentLevel: 3, targetLevel: 3, advancing: false,
    requirements: { level: 3, levelName: 'Coordonare', description: 'Descriere', benchmarks: [] },
    initiatives: [], initiativeCount: 0, needsInitiatives: false,
  },
];

// One initiative with a recorded measure and an unrecorded one — the
// distinction the report rests on.
const reportLinesFixture = [{
  indicatorCode: 'A1', indicatorName: 'Viziune', intent: 'ADVANCE',
  currentLevel: 2, targetLevel: 4, initiativeId: 21,
  title: 'Formarea cadrelor didactice', status: 'IN_PROGRESS',
  responsible: 'Elena Guriță', supervisor: 'Ion Popescu',
  dueOn: new Date('2027-06-01'),
  kpis: [
    { id: 31, measure: 'Cadre formate', target: '80%', actual: '62%' },
    { id: 32, measure: 'Sesiuni', target: '3', actual: null },
  ],
}];

function templatesFor(lang) {
  const data = getIndicatorData(lang);
  const indicators = data.INDICATORS;
  const school = makeSchool();
  const draftCycle = makeCycle(indicators, 'DRAFT');
  const confirmedCycle = makeCycle(indicators, 'CONFIRMED');
  const translate = i18n.t(lang);
  const stepStatuses = finalizeReviewStatus(computeStepStatuses(draftCycle));
  // Built by the real service, so this fixture cannot describe a shape
  // progressSummary never produces.
  const progress = progressSummary(draftCycle);
  const flags = [
    { id: 1, raisedAt: new Date('2026-09-01T10:00:00Z'), reason: 'Datele de rețea par incomplete.', byName: 'Autoritatea teritorială' },
    { id: 2, raisedAt: new Date('2026-08-20T09:30:00Z'), reason: null, byName: null },
  ];
  const mentors = [{ name: 'Elena Guriță', label: null }];
  const territories = [{ id: 1, name: 'Chișinău' }, { id: 2, name: 'Criuleni' }];
  const wheelSvg = renderWheel(itemsFromRatings(draftCycle.ratings, indicators), { mode: 'indicators', t: translate });
  const domainScores = { A: 2.4, B: 3.1, C: 1.8, D: 0.5 };
  const row = overviewRow(school, confirmedCycle);
  const ticket = {
    id: 7, status: 'OPEN', severity: 'MAJOR',
    comment: 'The wording here is unclear to a school director.',
    route: '/school/cycles/1/step/infra', viewName: 'school/step-infra',
    selector: 'main > div.card > form > button.btn', elementSummary: 'button.btn.btn-sm',
    elementText: 'Save inventory', i18nKeys: 'save_inventory',
    lang: 'ro', displayPrefs: 'theme:dark', viewport: '1280x800', userAgent: 'Mozilla/5.0',
    createdAt: new Date('2026-09-01T10:00:00Z'), updatedAt: new Date('2026-09-01T10:00:00Z'),
    resolvedAt: null, developerNote: null, triagedBy: null,
  };
  const withIndicators = (extra) => Object.assign({ INDICATORS: indicators }, extra);

  return [
    ['error.ejs', { title: 'T', message: 'M' }],
    ['auth/login.ejs', { title: 'Log in', error: 'Bad credentials' }],
    // mustChange false is the ordinary case: someone changing a password they
    // already know, who therefore has to prove they know it. The forced-reset
    // variant is covered separately below.
    ['auth/change-password.ejs', { title: 'Change', error: null, mustChange: false }],

    ['school/dashboard.ejs', { school, cycles: [confirmedCycle], latest: confirmedCycle, hasConfirmedPrior: true, mentors }],
    // A school with no mentor assigned yet must render just as happily.
    ['school/dashboard.ejs', { school, cycles: [], latest: null, hasConfirmedPrior: false, mentors: [] }],
    ['school/cycle-overview.ejs', { school, cycle: draftCycle, isContinuation: true, stepStatuses, progress: { rated: 15, total: 19 }, wheelSvg }],
    ['school/step-domain.ejs', {
      school, cycle: draftCycle, stepStatuses, domainCode: 'A', domainName: data.DOMAINS.A,
      domainIntro: 'Intro', ratedInDomain: 4, totalInDomain: 5, errorMessage: 'Something went wrong',
      indicators: indicators.filter((i) => i.domain === 'A').map((ind) => Object.assign({}, ind, {
        rating: { level: 3, comment: '', changeState: 'GREW', evidences: [] },
        priorRating: { level: 2 },
      })),
    }],
    ['school/step-infra.ejs', {
      school, cycle: draftCycle, stepStatuses, errorMessage: null,
      deviceCompliance: checkDeviceCompliance(school, DEVICE_INVENTORY),
      networkCompliance: checkNetworkCompliance(NETWORK_CHECKLIST),
    }],
    ['school/step-review.ejs', {
      school, cycle: draftCycle, stepStatuses, wheelSvg, errorMessage: null,
      domains: ['A', 'B', 'C', 'D'].map((code) => ({
        code,
        indicators: indicators.filter((i) => i.domain === code).map((ind) => Object.assign({}, ind, {
          rating: { level: 3, evidences: [] },
        })),
      })),
    }],
    // The plan before anyone opens it, and after — two genuinely different
    // pages, both of which a principal will see.
    ['school/plan.ejs', {
      school, cycle: confirmedCycle, plan: null, rows: [], summary: null,
      canManage: true, canPublish: true, cycleConfirmed: true,
    }],
    ['school/plan.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, rows: planRowsFixture,
      summary: { total: 2, advancing: 1, maintaining: 1, initiatives: 1, withoutInitiatives: [] },
      canManage: true, canPublish: true, cycleConfirmed: true,
    }],
    // And for a mentor, who writes initiatives but sets no targets.
    ['school/plan.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, rows: planRowsFixture,
      summary: { total: 2, advancing: 1, maintaining: 1, initiatives: 1, withoutInitiatives: ['A2'] },
      canManage: false, canPublish: false, cycleConfirmed: true,
    }],
    ['school/plan-parameter.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, row: planRowsFixture[0],
      currentRequirements: { level: 2, levelName: 'Coordonare', description: 'Descriere', benchmarks: [] },
      targetChoices: [3, 4, 5],
      people: [{ id: 2, name: 'Elena Guriță', role: 'SCHOOL_PRINCIPAL' }],
      statuses: ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'DROPPED'],
      canManage: true, errorMessage: null,
    }],
    ['school/plan-report.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, kind: 'INTERIM',
      report: { id: 1, kind: 'INTERIM', narrative: 'A fost un an bun', publishedAt: null },
      lines: reportLinesFixture,
      progress: { initiatives: 1, byStatus: { NOT_STARTED: 0, IN_PROGRESS: 1, DONE: 0, DROPPED: 0 },
        kpis: 2, recorded: 1, unrecorded: 1 },
      timing: { dueOn: new Date('2027-09-01'), due: false },
      canManage: true, canPublish: true,
    }],
    // A mentor records what the measures reached but writes no narrative and
    // publishes nothing.
    ['school/plan-report.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, kind: 'FINAL',
      report: null, lines: [],
      progress: { initiatives: 0, byStatus: { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0, DROPPED: 0 },
        kpis: 0, recorded: 0, unrecorded: 0 },
      timing: { dueOn: null, due: false },
      canManage: false, canPublish: false,
    }],
    ['school/report-document.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, title: 'Report',
      report: { kind: 'INTERIM', narrative: 'A fost un an bun', publishedAt: new Date('2027-09-15') },
      snapshot: {
        kind: 'INTERIM', publishedAt: '2027-09-15T00:00:00.000Z', narrative: 'A fost un an bun',
        progress: { initiatives: 1, byStatus: { NOT_STARTED: 0, IN_PROGRESS: 1, DONE: 0, DROPPED: 0 },
          kpis: 2, recorded: 1, unrecorded: 1 },
        lines: reportLinesFixture.map((l) => ({ ...l, dueOn: '2027-06-01T00:00:00.000Z' })),
      },
    }],
    ['school/plan-document.ejs', {
      school, cycle: confirmedCycle, plan: samplePlan, rows: planRowsFixture,
      summary: { total: 2, advancing: 1, maintaining: 1, initiatives: 1, withoutInitiatives: [] },
      title: 'Plan',
    }],
    ['school/history.ejs', {
      school, cycles: [confirmedCycle],
      cycleWheels: [{ cycleNumber: 1, svg: wheelSvg }],
      history: indicators.map((ind) => ({
        code: ind.code, name: ind.name, domain: ind.domain,
        series: [{ level: 3, changeState: 'GREW' }],
      })),
    }],

    ['ministry/dashboard.ejs', {
      rows: [row], totalSchools: 8, filteredCount: 1, confirmedCount: 7, complianceCount: 2,
      avgA: '1.9', avgB: '2.0', avgC: '1.8', avgD: '1.4', bands: ENROLMENT_BANDS, territories,
      query: { band: '251-500', territoryId: '2' },
      scopedToOneSchool: false, scopedSchoolName: null,
    }],
    // The same page read by a metamentor, whose post names one institution.
    ['ministry/dashboard.ejs', {
      rows: [row], totalSchools: 1, filteredCount: 1, confirmedCount: 1, complianceCount: 0,
      avgA: '1.9', avgB: '2.0', avgC: '1.8', avgD: '1.4', bands: ENROLMENT_BANDS, territories,
      query: {},
      scopedToOneSchool: true, scopedSchoolName: 'LT Onisifor Ghibu — Orhei',
    }],
    ['ministry/compliance.ejs', { rows: [row], allCount: 7 }],
    ['ministry/compliance.ejs', { rows: [], allCount: 7 }],
    ['ministry/school-detail.ejs', withIndicators({
      school, latest: confirmedCycle, currentCycle: draftCycle, hasNewerDraft: true, wheelSvg,
      deviceCompliance: row.deviceCompliance, networkCompliance: row.networkCompliance,
      validations: [], progress, flags,
    })],
    // The case half the pilot is in: work under way, nothing confirmed yet.
    ['ministry/school-detail.ejs', withIndicators({
      school, latest: null, currentCycle: draftCycle, hasNewerDraft: false, wheelSvg: null,
      deviceCompliance: null, networkCompliance: null, validations: [], progress, flags: [],
    })],

    ['territorial/dashboard.ejs', { rows: [row], totalSchools: 3, confirmedCount: 2, territoryName: 'Chișinău', scopedToOneDistrict: true }],
    // An unscoped post — an administrator, or a mentor with no school — sees
    // every district and no name in the heading.
    ['territorial/dashboard.ejs', { rows: [row], totalSchools: 14, confirmedCount: 7, territoryName: null, scopedToOneDistrict: false }],
    ['territorial/school-detail.ejs', withIndicators({
      school, latest: confirmedCycle, currentCycle: draftCycle, hasNewerDraft: true, wheelSvg,
      progress, flags,
    })],
    ['territorial/school-detail.ejs', withIndicators({
      school, latest: null, currentCycle: null, hasNewerDraft: false, wheelSvg: null,
      progress: null, flags: [],
    })],

    ['partner/dashboard.ejs', { rows: [row], totalSchools: 8, filteredCount: 1, bands: ENROLMENT_BANDS, query: {} }],
    ['strategic/dashboard.ejs', {
      rows: [{ school, c1: 2, c3: 1, c4: 1, total: 4 }],
      incomplete: [
        { school, reason: 'partial', c1: 2, c3: null, c4: 1 },
        { school, reason: 'not_started', c1: null, c3: null, c4: null },
      ],
      totalSchools: 14,
    }],
    ['strategic/dashboard.ejs', { rows: [], incomplete: [], totalSchools: 14 }],

    ['public/schools-list.ejs', { schools: [school], q: '' }],
    ['public/school-summary.ejs', {
      school, hasData: true, compliant: false, hasPlan: true,
      domains: { A: translate('public_band_2'), B: translate('public_band_3'), C: null, D: translate('public_band_0') },
      richDetail: domainScores,
      wheelSvg: renderWheel(itemsFromDomainScores(domainScores, translate), { mode: 'domains', size: 320, t: translate }),
    }],
    ['public/school-summary.ejs', { school, hasData: false }],

    ['school/reconcile.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [
        { indicator: { code: 'A1', name: 'Viziune' }, administrationLevel: 4, teamLevel: 2,
          agreedLevel: 3, settled: true, state: 'differ', gap: 2 },
        { indicator: { code: 'A2', name: 'Conducere' }, administrationLevel: 1, teamLevel: 1,
          agreedLevel: null, settled: false, state: 'agree', gap: 0 },
        { indicator: { code: 'B1', name: 'Infrastructură' }, administrationLevel: null, teamLevel: 5,
          agreedLevel: null, settled: false, state: 'incomplete', gap: null },
        { indicator: { code: 'B2', name: 'Rețea' }, administrationLevel: null, teamLevel: null,
          agreedLevel: null, settled: false, state: 'empty', gap: null },
      ],
      summary: { unsettled: ['A2', 'B1', 'B2'], differing: ['A1'], incomplete: ['B1'], untouched: ['B2'] },
      hiddenCount: 0,
      canSettle: true, myTrack: 'ADMINISTRATION', errorMessage: null, predatesTracks: false,
    }],
    // A mentor who has not answered two of these yet: the administration's
    // column is not theirs to read until they have. See maskForTrack.
    ['school/reconcile.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [
        { indicator: { code: 'A1', name: 'Viziune' }, administrationLevel: 4, teamLevel: 2,
          agreedLevel: null, settled: false, state: 'differ', gap: 2 },
        { indicator: { code: 'A2', name: 'Conducere' }, administrationLevel: null, teamLevel: null,
          agreedLevel: null, settled: false, state: 'hidden', gap: null, hidden: true },
        { indicator: { code: 'B1', name: 'Infrastructură' }, administrationLevel: null, teamLevel: null,
          agreedLevel: null, settled: false, state: 'hidden', gap: null, hidden: true },
      ],
      summary: { unsettled: ['A1', 'A2', 'B1'], differing: ['A1'], incomplete: [], untouched: [] },
      hiddenCount: 2,
      canSettle: false, myTrack: 'TEAM', errorMessage: null, predatesTracks: false,
    }],
    // The same page for a mentor, who sees the gaps but cannot record what was
    // agreed — a different rendering, not a hidden button.
    ['school/reconcile.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [
        { indicator: { code: 'A1', name: 'Viziune' }, administrationLevel: 4, teamLevel: 2,
          agreedLevel: 3, settled: true, state: 'differ', gap: 2 },
      ],
      summary: { unsettled: [], differing: ['A1'], incomplete: [], untouched: [] },
      hiddenCount: 0,
      canSettle: false, myTrack: 'TEAM', errorMessage: null, predatesTracks: true,
    }],
    ['school/delegation.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [
        { indicator: { code: 'A1', name: 'Viziune' }, assignees: [{ id: 2, name: 'Elena Guriță' }] },
        { indicator: { code: 'A2', name: 'Conducere' }, assignees: [] },
      ],
      people: [
        { id: 2, name: 'Elena Guriță', role: 'SCHOOL_PRINCIPAL' },
        { id: 3, name: 'Ana Novic', role: 'SCHOOL_MENTOR' },
      ],
      unassigned: ['A2'], mine: ['A1'], canAssign: true,
    }],
    // The same screen for a mentor, who reads the split but does not make it.
    ['school/delegation.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [{ indicator: { code: 'A1', name: 'Viziune' }, assignees: [] }],
      people: [{ id: 3, name: 'Ana Novic', role: 'SCHOOL_MENTOR' }],
      unassigned: ['A1'], mine: [], canAssign: false,
    }],
    // A school that has not created its team yet.
    ['school/delegation.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      cycle: { id: 4, cycleNumber: 1, status: 'DRAFT' },
      rows: [], people: [], unassigned: [], mine: [], canAssign: true,
    }],
    ['school/accounts.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      people: [
        { id: 2, postId: 5, name: 'Elena Guriță', login: 'gurita.elena', role: 'SCHOOL_PRINCIPAL',
          isActive: true, mustChangePassword: false, manageable: false, isSelf: true, capabilityCount: 5 },
        { id: 3, postId: 6, name: 'Ion Băbălău', login: 'babalau.ion', role: 'SCHOOL_MENTOR',
          isActive: true, mustChangePassword: true, manageable: true, isSelf: false, capabilityCount: 2 },
      ],
      grantableRole: 'SCHOOL_MENTOR', errorMessage: null,
    }],
    ['school/account-form.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      grantableRole: 'SCHOOL_MENTOR', body: {}, errorMessage: null,
    }],
    // Both paths render this page. The create path forgot to pass wasReset,
    // and EJS throws on an undefined variable rather than treating it as
    // false — so a mentor was created and the page confirming it 500'd.
    ['school/account-created.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      user: { id: 3, name: 'Ion Băbălău', login: 'babalau.ion' },
      tempPassword: 'Qx7mKp2ntDvR', wasReset: false,
    }],
    ['school/account-created.ejs', {
      school: { id: 1, name: 'LT „Boris Dînga” — Criuleni' },
      user: { id: 3, name: 'Ion Băbălău', login: 'babalau.ion' },
      tempPassword: 'Qx7mKp2ntDvR', wasReset: true,
    }],
    ['admin/school-new.ejs', {
      territories: [{ id: 1, name: 'Chișinău' }],
      // The form re-renders itself with what was typed when validation fails,
      // so both locals are always supplied by the route.
      errorMessage: null, body: {},
    }],
    ['admin/school-created.ejs', { school, teamAccountLogin: 'eminescu.echipa', tempPassword: 'abc123XYZ!' }],
    ['admin/school-created.ejs', { school, teamAccountLogin: null, tempPassword: null }],
    ['admin/audit-log.ejs', {
      entries: [{ id: 1, createdAt: new Date(), user: { name: 'Admin' }, action: 'SET_RATING', entityType: 'IndicatorRating', entityId: '1', details: 'A1 -> level 3' }],
    }],

    ['admin/users.ejs', {
      users: [
        { id: 1, name: 'Ana Popescu', login: 'popescu.ana', isActive: true, mustChangePassword: false,
          posts: [{ id: 1, role: 'ADMIN', label: null, institution: null, capabilityCount: 11, customised: false, isActive: true }] },
        { id: 2, name: 'Elena Guriță', login: 'gurita.elena', isActive: true, mustChangePassword: true,
          posts: [
            { id: 7, role: 'META_MENTOR', label: null, institution: 'LT Boris Dînga', capabilityCount: 4, customised: false, isActive: true },
            { id: 8, role: 'SCHOOL_MENTOR', label: 'Coordonator DigiPuls', institution: 'LT Gaudeamus', capabilityCount: 1, customised: true, isActive: false },
          ] },
        { id: 3, name: 'Fără funcție', login: 'fara.functie', isActive: false, mustChangePassword: false, posts: [] },
      ],
      roles: ROLES, filteredCount: 3, total: 15, query: { role: 'META_MENTOR' },
    }],
    ['admin/user-form.ejs', {
      mode: 'new', user: null, posts: [], errorMessage: null,
      schools: [{ id: 1, name: 'LT Mihai Eminescu' }], territories: [{ id: 1, name: 'Chișinău' }],
      roles: ROLES, capabilityGroups: CAPABILITY_GROUPS, roleDefaults: ROLE_DEFAULTS, defaultsFor, capabilityIsUsableBy, CAPABILITY_REQUIRES_ROLE,
    }],
    ['admin/user-form.ejs', {
      mode: 'edit',
      user: { id: 2, name: 'Elena Guriță', login: 'gurita.elena', isActive: true },
      // The worked example: two posts, two institutions, one account.
      posts: [
        { id: 7, role: 'META_MENTOR', label: null, isActive: true, institution: 'LT Boris Dînga',
          selected: capabilitiesFor('META_MENTOR', []) },
        { id: 8, role: 'SCHOOL_MENTOR', label: 'Coordonator DigiPuls', isActive: true, institution: 'LT Gaudeamus',
          selected: capabilitiesFor('SCHOOL_MENTOR', []) },
      ],
      errorMessage: 'Something is wrong',
      schools: [{ id: 1, name: 'LT Mihai Eminescu' }], territories: [{ id: 1, name: 'Chișinău' }],
      roles: ROLES, capabilityGroups: CAPABILITY_GROUPS, roleDefaults: ROLE_DEFAULTS, defaultsFor, capabilityIsUsableBy, CAPABILITY_REQUIRES_ROLE,
    }],
    ['admin/user-created.ejs', {
      user: { id: 2, name: 'Ion Rusu', login: 'rusu.ion', role: 'META_MENTOR' },
      tempPassword: 'Xq7tR2p9Lmz4',
    }],
    ['admin/user-created.ejs', {
      user: { id: 2, name: 'Ion Rusu', login: 'rusu.ion', role: 'META_MENTOR' },
      tempPassword: 'Xq7tR2p9Lmz4', wasReset: true,
    }],

    ['feedback/mine.ejs', { tickets: [ticket], openCount: 1, closedCount: 0, submittedId: 7 }],
    ['feedback/mine.ejs', { tickets: [], openCount: 0, closedCount: 0, submittedId: null }],
    ['feedback/backlog.ejs', {
      tickets: [{ ...ticket, author: { id: 2, name: 'Ion Rusu', role: 'META_MENTOR' }, block: developerBlock(ticket) }],
      authors: [{ id: 2, name: 'Ion Rusu' }],
      byStatus: { OPEN: 3, FIXED: 1 }, totalCount: 4,
      statuses: STATUSES, severities: SEVERITIES, query: { status: 'open' },
    }],
    ['feedback/backlog.ejs', {
      tickets: [], authors: [], byStatus: {}, totalCount: 0,
      statuses: STATUSES, severities: SEVERITIES, query: {},
    }],
    ['workspace/choose.ejs', {
      hasNone: false,
      options: [
        { key: '7', role: 'META_MENTOR', label: null, institution: 'LT Boris Dînga', isSchool: true,
          capabilityCount: 4, href: '/w/7/ministry', isCurrent: true },
        { key: '8', role: 'SCHOOL_MENTOR', label: 'Coordonator DigiPuls', institution: 'LT Gaudeamus', isSchool: true,
          capabilityCount: 1, href: '/w/8/school', isCurrent: false },
      ],
      institutions: [],
    }],
    // An administrator: one post, and every institution offered beneath it.
    ['workspace/choose.ejs', {
      hasNone: false,
      options: [
        { key: '3', role: 'ADMIN', label: null, institution: null, isSchool: false,
          capabilityCount: 15, href: '/w/3/admin/users', isCurrent: true },
      ],
      institutions: [
        { key: '3s1', role: 'ADMIN', label: null, institution: 'LT Boris Dînga', isSchool: true,
          capabilityCount: 15, href: '/w/3s1/school', isCurrent: false },
        { key: '3s2', role: 'ADMIN', label: null, institution: 'LT Gaudeamus', isSchool: true,
          capabilityCount: 15, href: '/w/3s2/school', isCurrent: false },
      ],
    }],
    ['workspace/choose.ejs', { hasNone: true, options: [], institutions: [] }],

    ['feedback/new.ejs', { severities: SEVERITIES, errorMessage: null, body: { route: '/school' } }],
    ['feedback/new.ejs', { severities: SEVERITIES, errorMessage: 'Please describe it', body: {} }],
  ];
}

function baseLocals(lang) {
  const prefs = prefsUtil.DEFAULTS;
  return {
    lang,
    t: i18n.t(lang),
    STATUS_LABELS: i18n.STATUS_LABELS[lang],
    CHANGE_STATE_LABELS: i18n.CHANGE_STATE_LABELS[lang],
    SUPPORTED_LANGS: i18n.SUPPORTED_LANGS,
    LANG_NAMES: i18n.LANG_NAMES,
    LANG_SHORT: i18n.LANG_SHORT,
    prefs,
    prefsAttrs: prefsUtil.htmlAttrs(prefs),
    currentUser: { id: 1, name: 'Test User', role: 'ADMIN', schoolId: 1 },
    // Rendered as an admin, so every navigation branch is exercised.
    capabilities: new Set(CAPABILITIES),
    can: (capability) => CAPABILITIES.includes(capability),
    viewName: 'test/fixture',
    // Two posts, so the switcher renders and href() actually prefixes —
    // rendering with a single post would leave the multi-post paths untested.
    workspace: ws(7, 'META_MENTOR', { school: DINGA }),
    workspaces: [
      ws(7, 'META_MENTOR', { school: DINGA }),
      ws(8, 'SCHOOL_MENTOR', { label: 'Coordonator DigiPuls', school: GAUDEAMUS }),
    ],
    href: (path) => (typeof path === 'string' && path.startsWith('/')
      && !/^\/(public-view|login|logout|lang|preferences|change-password|workspace)(\/|$)/.test(path)
      ? '/w/7' + (path === '/' ? '' : path) : path),
    currentPath: '/ministry',
    // Set for every request by middleware/csrf.js and middleware/
    // securityHeaders.js. Present here so the views are exercised as they are
    // actually served: every POST form must carry the token, and the two
    // inline scripts must carry the nonce, or a strict CSP silently drops
    // them.
    csrfToken: 'test-csrf-token',
    cspNonce: 'test-nonce',
    cspMeta: "default-src 'self'; script-src 'self' 'nonce-test-nonce'",
    demoMode: true,
    // Set in app.js for every render; the layout builds the guided tutorial
    // from it. See src/services/tour.js.
    buildTour,
    title: 'Page',
    wide: false,
  };
}

function render(file, locals) {
  const filename = path.join(VIEWS, file);
  return ejs.render(fs.readFileSync(filename, 'utf8'), locals, { filename });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
for (const lang of i18n.SUPPORTED_LANGS) {
  test(`every view renders in ${lang}`, () => {
    for (const [file, extra] of templatesFor(lang)) {
      const locals = Object.assign(baseLocals(lang), extra);
      let html;
      try {
        html = render(file, locals);
      } catch (err) {
        assert.fail(`${file} (${lang}) failed to render: ${err.message}`);
      }
      assert.ok(html.length > 0, `${file} (${lang}) rendered empty`);
      // An unresolved key renders as the key itself (see i18n.t). Catch the
      // ones our own naming conventions make identifiable.
      const leaked = html.match(/\b(?:err|a11y|nav|admin|public|ministry|territorial|partner|strategic|plan|assessment|school|step|domain|dev|net|o675|ev|demo|th|f|login)_[a-z0-9_]{3,}\b/g);
      assert.strictEqual(leaked, null, `${file} (${lang}) leaked untranslated keys: ${(leaked || []).join(', ')}`);
    }
  });
}

test('the layout renders and carries the accessibility scaffolding', () => {
  const locals = Object.assign(baseLocals('ru'), { body: '<p>Body</p>' });
  const html = render('layout.ejs', locals);
  assert.match(html, /<html lang="ru"/, 'the html lang attribute must follow the chosen language');
  assert.match(html, /class="skip-link"/, 'a skip link is required');
  assert.match(html, /<main id="main"/, 'a main landmark is required');
  assert.match(html, /aria-label=/, 'landmarks must be labelled');
  assert.match(html, /Настройки|Отображение/, 'the display-settings control must be translated');
});

test('preference attributes reach <html>, and only when they differ from the default', () => {
  const defaults = Object.assign(baseLocals('en'), { body: '' });
  assert.ok(!/data-theme=/.test(render('layout.ejs', defaults)), 'defaults must not pin any attribute');

  const chosen = { theme: 'dark', contrast: 'high', text: 'xl', motion: 'reduced', underline: 'on' };
  const custom = Object.assign(baseLocals('en'), {
    body: '', prefs: chosen, prefsAttrs: prefsUtil.htmlAttrs(chosen),
  });
  const html = render('layout.ejs', custom);
  ['data-theme="dark"', 'data-contrast="high"', 'data-text="xl"',
    'data-motion="reduced"', 'data-underline="on"'].forEach((attr) => {
    assert.ok(html.includes(attr), `missing ${attr} on <html>`);
  });
});

test('the navigation panel is grouped, labelled, and marks the current page', () => {
  const html = render('layout.ejs', Object.assign(baseLocals('en'), { body: '', currentPath: '/ministry' }));
  assert.match(html, /class="sidebar"/, 'the left panel must render for a signed-in account');
  assert.match(html, /navgroup-oversight/, 'links must be grouped, not one flat row');
  assert.match(html, /aria-current="page"/, 'the current page must be marked');
  assert.match(html, /data-nav-toggle/, 'the fold control must be present');
  // The fold control is a real form button, so folding works with scripting
  // off — the same guarantee the display settings make.
  assert.match(html, /<form method="POST" action="\/preferences" class="sidebar-toggle-form">/);
});

test('folding the navigation round-trips the other display preferences', () => {
  // The no-JS toggle posts the whole preference form; if it only sent `nav`
  // it would silently reset the viewer's theme and text size.
  const chosen = { theme: 'dark', contrast: 'high', text: 'xl', motion: 'reduced', underline: 'on', nav: 'expanded' };
  const html = render('layout.ejs', Object.assign(baseLocals('en'), { body: '', prefs: chosen }));
  ['theme" value="dark', 'contrast" value="high', 'text" value="xl',
    'motion" value="reduced', 'underline" value="on'].forEach((fragment) => {
    assert.ok(html.includes(fragment), `the toggle form must carry ${fragment}`);
  });
  assert.match(html, /name="nav" value="collapsed"/, 'and flip only the nav value');
});

test('a signed-out page has no navigation panel to fold', () => {
  const html = render('layout.ejs', Object.assign(baseLocals('en'), { body: '', currentUser: null }));
  assert.ok(!html.includes('class="sidebar"'));
});

test('the language switcher offers all three languages, marking the current one', () => {
  const html = render('layout.ejs', Object.assign(baseLocals('ro'), { body: '' }));
  i18n.SUPPORTED_LANGS.forEach((code) => {
    assert.ok(html.includes(`hreflang="${code}"`), `no switcher link for ${code}`);
  });
  assert.match(html, /hreflang="ro" lang="ro"\s+aria-current="true"/, 'the active language must be marked');
});

test('every page renders before a workspace has been chosen', () => {
  // The state on /workspace, and on any page reached before a choice is made:
  // several posts, none active yet. The topbar sits in the layout and its
  // switcher read workspace.role unconditionally, so this threw — and because
  // it threw inside the layout, the error page could not render either and
  // Express answered with a bare "Internal Server Error". Every authenticated
  // page failed at once for anyone holding more than one post, which is to say
  // for the account that runs the pilot.
  const locals = Object.assign(baseLocals('ro'), {
    workspace: null,
    can: () => true,
    workspaces: [
      ws(7, 'ADMIN'),
      ws(8, 'META_MENTOR', { label: 'Meta-coordonator', school: GHIBU }),
      ws(9, 'META_MENTOR', { label: 'Mentor simplu' }),
    ],
  });

  assert.doesNotThrow(() => render('partials/workspace-switch.ejs', locals),
    'the switcher must render with nothing selected — that is the whole point of the picker');

  const html = render('partials/workspace-switch.ejs', locals);
  assert.ok(html.includes('/w/7/') && html.includes('/w/8/') && html.includes('/w/9/'),
    'all three posts are offered');
  assert.ok(!html.includes('is-current'), 'and none is marked current, because none is');
});

test('the switcher still marks the active post once one is chosen', () => {
  const locals = Object.assign(baseLocals('ro'), {
    can: () => true,
    workspace: ws(8, 'META_MENTOR', { school: GHIBU }),
    workspaces: [
      ws(7, 'ADMIN'),
      ws(8, 'META_MENTOR', { school: GHIBU }),
    ],
  });
  const html = render('partials/workspace-switch.ejs', locals);
  assert.ok(html.includes('is-current'), 'the active post is marked');
  assert.ok(html.includes('LT Onisifor Ghibu'), 'and named in the summary');
});

test('the DigiPlan is drawn on the wheel as a line, never as an area', () => {
  // "Not a filled area, but a bold dotted line that shows what is currently
  // being developed." A second filled wedge would read as a second
  // measurement, and a target is not a measurement.
  const indicators = getIndicatorData('en').INDICATORS;
  const ratings = indicators.map((ind, i) => ({ indicatorCode: ind.code, level: (i % 4) + 1 }));
  const priorities = [
    { indicatorCode: 'A1', currentLevel: 2, targetLevel: 4 },   // advancing
    { indicatorCode: 'B1', currentLevel: 1, targetLevel: 3 },   // advancing
    { indicatorCode: 'C1', currentLevel: 3, targetLevel: 3 },   // maintaining
    { indicatorCode: 'D1', currentLevel: 4, targetLevel: 2 },   // "target" below today
  ];

  const withPlan = itemsFromRatings(ratings, indicators, priorities);
  const targets = withPlan.filter((i) => i.target !== null).map((i) => i.code);
  assert.deepStrictEqual(targets.sort(), ['A1', 'B1'],
    'only the parameters actually being advanced carry a target');

  const svg = renderWheel(withPlan, { mode: 'indicators', t: i18n.t('ro') });
  const arcs = svg.match(/stroke-dasharray="5 4"/g) || [];
  assert.strictEqual(arcs.length, 2, 'one dotted arc per advancing parameter');
  // A line, not a wedge: no fill, and no path closing back to the centre.
  const arcPaths = svg.match(/<path d="M[^"]*A[^"]*" fill="none"[^>]*stroke-dasharray[^>]*>/g) || [];
  assert.strictEqual(arcPaths.length, 2, 'the plan is stroked, never filled');
  assert.match(svg, /Ținta DigiPlanului/, 'and its tooltip is translated');

  // Without a plan, nothing is drawn — the wheel is unchanged for a school
  // that has only assessed itself.
  const noPlan = renderWheel(itemsFromRatings(ratings, indicators), { t: i18n.t('en') });
  assert.ok(!noPlan.includes('stroke-dasharray'), 'no plan, no line');
  assert.strictEqual(
    itemsFromRatings(ratings, indicators, null).filter((i) => i.target !== null).length, 0);
});

test('the wheel gives level 0 a band of its own, and an unrated parameter none', () => {
  // Reported from the live site: level 0 was drawn as a 2px sliver against the
  // hub — "we have nothing of this kind" was invisible, and indistinguishable
  // from a parameter nobody had rated. The platform says everywhere else that
  // level 0 is an answer and a blank is not; the picture now says it too.
  const indicators = getIndicatorData('ro').INDICATORS;
  const ratings = indicators.map((ind, i) => ({
    indicatorCode: ind.code,
    level: i === 0 ? 0 : i === 1 ? null : 3,
  }));
  const svg = renderWheel(itemsFromRatings(ratings, indicators), {
    mode: 'indicators', t: i18n.t('ro'),
  });

  // Six bands of equal width for six levels, so 0 is as tall as any other.
  const circles = [...svg.matchAll(/<circle cx="210" cy="210" r="([\d.]+)" fill="none"/g)]
    .map((m) => Number(m[1]));
  assert.strictEqual(circles.length, 7, 'the hub plus one edge per level 0-5');
  const widths = circles.slice(1).map((r, i) => +(r - circles[i]).toFixed(1));
  assert.strictEqual(new Set(widths).size, 1, `bands must be equal, got ${widths}`);

  // The rated-0 parameter is drawn; the unrated one is not.
  assert.match(svg, /fill-opacity="0\.9"/);
  assert.match(svg, /fill="transparent"/, 'an unrated sector is empty, not faint');
  assert.match(svg, /încă neevaluat/, 'and says so on hover');
});

test('the wheel shows where one parameter ends and the next begins', () => {
  // "liniile verticale (ca raze a cercului) ca să pot vedea mai ușor
  // delimitarea între parametri" — a 0.6° gap was not enough, and under the
  // wedges a divider vanished exactly where two neighbours touch.
  const indicators = getIndicatorData('ro').INDICATORS;
  const ratings = indicators.map((ind) => ({ indicatorCode: ind.code, level: 4 }));
  const svg = renderWheel(itemsFromRatings(ratings, indicators), {
    mode: 'indicators', t: i18n.t('ro'),
  });

  assert.strictEqual((svg.match(/<line /g) || []).length, indicators.length,
    'one divider per sector boundary');
  // Painted after the wedges, or they are hidden by them.
  assert.ok(svg.indexOf('<line ') > svg.lastIndexOf('fill-opacity="0.9"'),
    'dividers must be drawn on top of the wedges');

  // And which colour means which domain.
  assert.strictEqual((svg.match(/<rect /g) || []).length, 4, 'a legend swatch per domain');
  assert.match(svg, /A — /, 'named, not just coloured');
});

test('the public wheel is labelled to the top of its own scale', () => {
  // It counted to 5 on a wheel whose highest band is 4 — a parent reading it
  // would think the school was one step lower than it is.
  const svg = renderWheel(
    itemsFromDomainScores({ A: 2.4, B: 1.1, C: 0.4, D: 3.6 }, i18n.t('ro')),
    { mode: 'domains', size: 320, showLabels: true, t: i18n.t('ro') },
  );
  const ticks = [...svg.matchAll(/font-size="9" fill="var\(--text-muted\)">(\d)</g)]
    .map((m) => Number(m[1]));
  assert.deepStrictEqual(ticks.sort(), [0, 1, 2, 3, 4], 'bands 0-4, and no phantom 5');
  // The four sectors are the domains here, so no legend is drawn.
  assert.ok(!svg.includes('<rect '), 'the public wheel names its sectors already');
});
