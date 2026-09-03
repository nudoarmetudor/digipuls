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
const { computeStepStatuses, finalizeReviewStatus } = require('../src/services/stepStatus');

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
function templatesFor(lang) {
  const data = getIndicatorData(lang);
  const indicators = data.INDICATORS;
  const school = makeSchool();
  const draftCycle = makeCycle(indicators, 'DRAFT');
  const confirmedCycle = makeCycle(indicators, 'CONFIRMED');
  const translate = i18n.t(lang);
  const stepStatuses = finalizeReviewStatus(computeStepStatuses(draftCycle));
  const wheelSvg = renderWheel(itemsFromRatings(draftCycle.ratings, indicators), { mode: 'indicators', t: translate });
  const domainScores = { A: 2.4, B: 3.1, C: 1.8, D: 0.5 };
  const row = overviewRow(school, confirmedCycle);
  const withIndicators = (extra) => Object.assign({ INDICATORS: indicators }, extra);

  return [
    ['error.ejs', { title: 'T', message: 'M' }],
    ['auth/login.ejs', { title: 'Log in', error: 'Bad credentials' }],
    ['auth/change-password.ejs', { title: 'Change', error: null }],

    ['school/dashboard.ejs', { school, cycles: [confirmedCycle], latest: confirmedCycle, hasConfirmedPrior: true }],
    ['school/dashboard.ejs', { school, cycles: [], latest: null, hasConfirmedPrior: false }],
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
    ['school/plan.ejs', { school, cycle: confirmedCycle, plan: confirmedCycle.plan, priorPlan: confirmedCycle.plan, indicators }],
    ['school/plan-document.ejs', { school, cycle: confirmedCycle, plan: confirmedCycle.plan, title: 'Plan' }],
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
      avgA: '1.9', avgB: '2.0', avgC: '1.8', avgD: '1.4', bands: ENROLMENT_BANDS, query: { band: '251-500' },
    }],
    ['ministry/compliance.ejs', { rows: [row], allCount: 7 }],
    ['ministry/compliance.ejs', { rows: [], allCount: 7 }],
    ['ministry/school-detail.ejs', withIndicators({
      school, latest: confirmedCycle, currentCycle: draftCycle, hasNewerDraft: true, wheelSvg,
      deviceCompliance: row.deviceCompliance, networkCompliance: row.networkCompliance,
      validations: [],
    })],
    ['ministry/school-detail.ejs', withIndicators({
      school, latest: null, currentCycle: draftCycle, hasNewerDraft: false, wheelSvg: null,
      deviceCompliance: null, networkCompliance: null, validations: [],
    })],

    ['territorial/dashboard.ejs', { rows: [row], totalSchools: 3, confirmedCount: 2, territoryName: 'Chișinău' }],
    ['territorial/school-detail.ejs', withIndicators({
      school, latest: confirmedCycle, currentCycle: draftCycle, hasNewerDraft: true, wheelSvg,
    })],
    ['territorial/school-detail.ejs', withIndicators({
      school, latest: null, currentCycle: null, hasNewerDraft: false, wheelSvg: null,
    })],

    ['partner/dashboard.ejs', { rows: [row], totalSchools: 8, filteredCount: 1, bands: ENROLMENT_BANDS, query: {} }],
    ['strategic/dashboard.ejs', { rows: [{ school, c1: 2, c3: null, c4: 1 }] }],
    ['strategic/dashboard.ejs', { rows: [] }],

    ['public/schools-list.ejs', { schools: [school], q: '' }],
    ['public/school-summary.ejs', {
      school, hasData: true, compliant: false, hasPlan: true,
      domains: { A: translate('public_band_2'), B: translate('public_band_3'), C: null, D: translate('public_band_0') },
      richDetail: domainScores,
      wheelSvg: renderWheel(itemsFromDomainScores(domainScores, translate), { mode: 'domains', size: 320, t: translate }),
    }],
    ['public/school-summary.ejs', { school, hasData: false }],

    ['admin/school-new.ejs', { territories: [{ id: 1, name: 'Chișinău' }] }],
    ['admin/school-created.ejs', { school, teamAccountEmail: 'team@example.md', tempPassword: 'abc123XYZ!' }],
    ['admin/school-created.ejs', { school, teamAccountEmail: null, tempPassword: null }],
    ['admin/audit-log.ejs', {
      entries: [{ id: 1, createdAt: new Date(), user: { name: 'Admin' }, action: 'SET_RATING', entityType: 'IndicatorRating', entityId: '1', details: 'A1 -> level 3' }],
    }],
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
    currentPath: '/ministry',
    demoMode: true,
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

test('the language switcher offers all three languages, marking the current one', () => {
  const html = render('layout.ejs', Object.assign(baseLocals('ro'), { body: '' }));
  i18n.SUPPORTED_LANGS.forEach((code) => {
    assert.ok(html.includes(`hreflang="${code}"`), `no switcher link for ${code}`);
  });
  assert.match(html, /hreflang="ro" lang="ro"\s+aria-current="true"/, 'the active language must be marked');
});
