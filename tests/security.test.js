const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { safeRedirect } = require('../src/utils/safeRedirect');
const { csrf, rotateToken, issueToken } = require('../src/middleware/csrf');
const { createLimiter } = require('../src/middleware/rateLimit');
const { capabilitiesFor, canActOn, CAPABILITIES } = require('../src/services/capabilities');
const { toCsv } = require('../src/services/schoolOverview');
const { renderWheel } = require('../src/services/wheelChart');

// Each of these pins a specific finding from the September 2026 review. They
// are written as "the attack no longer works" rather than "the function
// returns X", because what matters is the property, not the implementation
// that currently provides it.

// ---------------------------------------------------------------------------
// Open redirect
// ---------------------------------------------------------------------------

test('a redirect target may only be a path on this site', () => {
  const bs = String.fromCharCode(92);
  const hostile = [
    '//evil.md',                       // protocol-relative
    '/' + bs + 'evil.md',              // browsers normalise the backslash
    '//' + bs + 'evil.md',
    'https://evil.md',
    'http://evil.md',
    'javascript:alert(1)',
    '/a' + String.fromCharCode(13) + String.fromCharCode(10) + 'Set-Cookie: a=b',
    '/a' + String.fromCharCode(0),
  ];
  hostile.forEach((value) => {
    assert.strictEqual(safeRedirect(value), '/', `${JSON.stringify(value)} must not be followed`);
  });
});

test('ordinary in-app paths still work, or the guard is useless', () => {
  ['/school', '/w/12/ministry', '/ministry?band=251-500&sort=name-asc',
    '/school/cycles/3/plan'].forEach((value) => {
    assert.strictEqual(safeRedirect(value), value);
  });
});

test('a missing or non-string target falls back to the root', () => {
  [undefined, null, '', 42, {}, []].forEach((value) => {
    assert.strictEqual(safeRedirect(value), '/');
  });
});

// ---------------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------------

function fakeReq(method, opts = {}) {
  return {
    method,
    path: opts.path || '/admin/users/1/reset-password',
    body: opts.body || {},
    session: opts.session === undefined ? {} : opts.session,
    get(name) { return (opts.headers || {})[name.toLowerCase()]; },
  };
}

function fakeRes() {
  return {
    locals: {},
    statusCode: 200,
    rendered: null,
    jsonBody: null,
    status(code) { this.statusCode = code; return this; },
    render(view, options) { this.rendered = { view, options }; return this; },
    json(body) { this.jsonBody = body; return this; },
  };
}

function run(req, res) {
  let passed = false;
  csrf(req, res, () => { passed = true; });
  return passed;
}

test('a GET is never blocked', () => {
  const req = fakeReq('GET', { path: '/login' });
  const res = fakeRes();
  assert.ok(run(req, res), 'reads must not be blocked');
});

test('the login page gets a token, because it carries the one anonymous form', () => {
  const req = fakeReq('GET', { path: '/login' });
  const res = fakeRes();
  run(req, res);
  assert.ok(req.session.csrfToken, 'a token is minted');
  assert.strictEqual(res.locals.csrfToken, req.session.csrfToken, 'and published to the view');
});

test('a signed-in person gets a token on any page', () => {
  const req = fakeReq('GET', { path: '/ministry', session: { user: { id: 1 } } });
  const res = fakeRes();
  run(req, res);
  assert.ok(req.session.csrfToken);
});

test('an anonymous reader of the public pages is given no session at all', () => {
  // Storing a token modifies the session, which makes express-session persist
  // it even with saveUninitialized off. Issuing one to every request meant
  // every visitor — and every crawler — was handed a session on a
  // memory-backed store, on a host with a memory limit. That is a leak with
  // the whole internet holding the pump, and the public tier needs no token:
  // it is read-only, and /preferences is exempt.
  const req = fakeReq('GET', { path: '/public-view/schools' });
  const res = fakeRes();
  assert.ok(run(req, res), 'public pages must still render');
  assert.strictEqual(req.session.csrfToken, undefined,
    'nothing may be written to the session, or a session is created and stored');
  assert.strictEqual(res.locals.csrfToken, '', 'views get an empty token, not undefined');
});

test('a session that already has a token keeps it', () => {
  const session = { csrfToken: 'existing-token' };
  const req = fakeReq('GET', { path: '/public-view/schools', session });
  const res = fakeRes();
  run(req, res);
  assert.strictEqual(res.locals.csrfToken, 'existing-token');
});

test('a POST without the token is refused', () => {
  const session = {};
  issueToken({ session });
  const req = fakeReq('POST', { session });
  const res = fakeRes();
  assert.ok(!run(req, res), 'the request must not reach the route');
  assert.strictEqual(res.statusCode, 403);
});

test('a POST with the wrong token is refused', () => {
  const session = {};
  issueToken({ session });
  const req = fakeReq('POST', { session, body: { _csrf: 'not-the-token' } });
  const res = fakeRes();
  assert.ok(!run(req, res));
  assert.strictEqual(res.statusCode, 403);
});

test('a POST carrying the session token is allowed, by field or by header', () => {
  const session = {};
  const token = issueToken({ session });

  const viaField = fakeReq('POST', { session, body: { _csrf: token } });
  assert.ok(run(viaField, fakeRes()), 'hidden form field');

  // The feedback overlay posts JSON, so it has no form field to put it in.
  const viaHeader = fakeReq('POST', { session, headers: { 'x-csrf-token': token } });
  assert.ok(run(viaHeader, fakeRes()), 'request header');
});

test('a JSON client is refused in JSON, not with an HTML error page', () => {
  const session = {};
  issueToken({ session });
  const req = fakeReq('POST', { session, headers: { accept: 'application/json' } });
  const res = fakeRes();
  assert.ok(!run(req, res));
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.jsonBody, { ok: false, error: 'csrf' });
});

test('display preferences are exempt, so anonymous readers need no session', () => {
  // Forging someone's font size is not an attack, and requiring a token here
  // would mean minting a cookie for every anonymous visitor to the public
  // school pages.
  const req = fakeReq('POST', { path: '/preferences' });
  assert.ok(run(req, fakeRes()), '/preferences must stay usable without a token');
});

test('logging in issues a new token, because regenerate() discarded the old', () => {
  const req = fakeReq('GET');
  run(req, fakeRes());
  const before = req.session.csrfToken;

  // What express-session's regenerate() effectively does to our copy.
  req.session = {};
  const after = rotateToken(req);

  assert.ok(after, 'a fresh token exists after login');
  assert.notStrictEqual(after, before, 'and it is not the pre-login one');
});

test('every POST form in the views carries the token', () => {
  // A form added later without one fails closed — it just stops working — so
  // this is the test that catches it at the point it is written rather than
  // when someone reports that a button does nothing.
  const VIEWS = path.join(__dirname, '..', 'src', 'views');
  const ejsBlock = /<%[\s\S]*?%>/g;
  const missing = [];

  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith('.ejs')) return;

      const source = fs.readFileSync(full, 'utf8');
      // Mask EJS blocks so a '>' inside `<%= href(...) %>` cannot be mistaken
      // for the end of the form tag.
      // Filler of the same length, so every offset still lines up with the
      // original text.
      const masked = source.replace(ejsBlock, (m) => 'x'.repeat(m.length));
      let match;
      const opener = /<form\b/gi;
      // eslint-disable-next-line no-cond-assign
      while ((match = opener.exec(masked)) !== null) {
        const end = masked.indexOf('>', match.index);
        if (end === -1) continue;
        const tag = masked.slice(match.index, end + 1);
        if (!/method\s*=\s*["']?\s*post/i.test(tag)) continue;
        if (!source.slice(end, end + 400).includes('name="_csrf"')) {
          missing.push(path.relative(VIEWS, full));
        }
      }
      return undefined;
    });
  };
  walk(VIEWS);

  assert.deepStrictEqual(missing, [], 'these POST forms have no CSRF token');
});

// ---------------------------------------------------------------------------
// Privilege boundaries
// ---------------------------------------------------------------------------

test('managing accounts and handing out powers are separate capabilities', () => {
  // They used to be one. Holding it meant you could add yourself an ADMIN
  // post, which is not an administrative power but a way of becoming the
  // administrator.
  assert.ok(CAPABILITIES.includes('admin.users'));
  assert.ok(CAPABILITIES.includes('admin.grant'));

  const coordinator = capabilitiesFor('META_MENTOR', [{ capability: 'admin.users', granted: true }]);
  assert.ok(coordinator.has('admin.users'), 'can run the pilot');
  assert.ok(!coordinator.has('admin.grant'), 'but cannot redefine what a post may do');
});

test('you cannot administer an account that can do more than you', () => {
  const admin = capabilitiesFor('ADMIN');
  const coordinator = capabilitiesFor('META_MENTOR', [{ capability: 'admin.users', granted: true }]);
  const mentor = capabilitiesFor('META_MENTOR');

  assert.ok(!canActOn(coordinator, admin),
    'resetting the administrator password would be a takeover');
  assert.ok(canActOn(admin, coordinator), 'an administrator may act on anyone');
  assert.ok(canActOn(coordinator, mentor), 'and a coordinator may still run the pilot');
  assert.ok(canActOn(mentor, mentor), 'a peer is not a promotion');
});

test('an administrator still holds every capability, including new ones', () => {
  // ADMIN is defined as the whole list rather than an enumeration, so a
  // capability added later cannot leave the administrator unable to use it.
  const admin = capabilitiesFor('ADMIN');
  CAPABILITIES.forEach((c) => assert.ok(admin.has(c), `ADMIN should hold ${c}`));
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

test('one password sprayed across many accounts is caught', () => {
  // The previous limiter keyed on IP+login, so each of these touched a
  // different counter and none of them ever tripped.
  const perIp = createLimiter({ windowMs: 60000, max: 40 });
  for (let i = 0; i < 40; i++) perIp.record('198.51.100.7');
  assert.ok(perIp.exceeded('198.51.100.7'), 'the attacker is throttled');
  assert.ok(!perIp.exceeded('203.0.113.9'), 'a bystander on another address is not');
});

test('the attempt table cannot be grown without bound', () => {
  // Every distinct login anyone submits used to stay resident for the life of
  // the process, which an anonymous client could use to exhaust memory.
  const limiter = createLimiter({ windowMs: 60000, max: 5, maxKeys: 100 });
  for (let i = 0; i < 5000; i++) limiter.record(`attacker-supplied-${i}`);
  assert.ok(limiter.size() <= 200, `expected the table to stay bounded, saw ${limiter.size()}`);
});

test('an expired window forgets, so a genuine user is not locked out forever', () => {
  const limiter = createLimiter({ windowMs: 1, max: 1 });
  limiter.record('someone');
  assert.ok(limiter.exceeded('someone'));
  return new Promise((resolve) => setTimeout(() => {
    assert.ok(!limiter.exceeded('someone'), 'the window has passed');
    resolve();
  }, 5));
});

// ---------------------------------------------------------------------------
// Output that leaves the app
// ---------------------------------------------------------------------------

function csvRow(name) {
  return {
    school: { name, territory: { name: 'Criuleni' }, enrolmentBand: '0-250' },
    confirmed: true, cycle: null, hasNewerDraft: false,
    domainScores: { A: 1, B: 2, C: 3, D: 4 },
    deviceCompliance: { compliant: true }, networkCompliance: { compliant: true },
  };
}

test('a spreadsheet formula in a school name is not executable in the export', () => {
  // Quoting stops a value breaking out of its column; it does not stop Excel
  // evaluating a leading =, +, - or @ inside the quotes.
  ['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://evil.md","click")'].forEach((name) => {
    const line = toCsv([csvRow(name)]).split('\n')[1];
    assert.ok(line.startsWith('"\''), `${name} should be prefixed so it stays text: ${line}`);
  });
});

test('an ordinary school name is exported unchanged', () => {
  const line = toCsv([csvRow('LT „Ion Creangă”, Fălești')]).split('\n')[1];
  assert.ok(line.startsWith('"LT „Ion Creangă”, Fălești"'), line);
  assert.ok(!line.includes('\'LT'), 'nothing should be prefixed that did not need it');
});

test('a quote in a school name still cannot break the CSV structure', () => {
  const line = toCsv([csvRow('The "Best" Lyceum')]).split('\n')[1];
  assert.ok(line.startsWith('"The ""Best"" Lyceum"'), line);
});

test('the wheel escapes what it is given, whatever the caller passes', () => {
  // No caller passes user input today. This is here so that the first one to
  // do so does not introduce stored XSS on every dashboard at once — the SVG
  // is emitted unescaped, by necessity.
  const svg = renderWheel(
    [{ code: '<script>alert(1)</script>', domain: 'A', level: 3, name: '"><img src=x onerror=alert(1)>' }],
    { t: (k) => k },
  );
  // The test is that no *markup* survives, not that the words do not appear:
  // "onerror=alert(1)" sitting inside an escaped text node is inert, and
  // asserting on the words rather than the syntax would be checking the wrong
  // thing.
  assert.ok(!svg.includes('<script>'), 'no raw script tag may reach the output');
  assert.ok(!svg.includes('<img'), 'nor a raw element that could carry a handler');
  assert.ok(!/<[a-z]+[^>]*\son[a-z]+=/i.test(svg), 'nor any tag with an event handler on it');
  assert.ok(svg.includes('&lt;script&gt;'), 'it should be escaped, not silently dropped');
  assert.ok(svg.includes('&quot;'), 'and quotes too, or an attribute could be broken out of');
});

// ---------------------------------------------------------------------------
// Content-Security-Policy compatibility
// ---------------------------------------------------------------------------

test('no view carries an inline event handler', () => {
  // A nonce authorises a <script> element; it does nothing for an onclick
  // attribute. So an inline handler under this policy does not error — it
  // simply never runs, which for the two confirm() dialogs on the account
  // screen would mean a delete button that deletes without asking. Silent, and
  // exactly the kind of regression a header is supposed to prevent rather than
  // cause.
  const VIEWS = path.join(__dirname, '..', 'src', 'views');
  const offenders = [];
  const walk = (dir) => {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith('.ejs')) return;
      const source = fs.readFileSync(full, 'utf8');
      const match = source.match(/\son(?:click|submit|change|input|load|error|focus|blur)\s*=/i);
      if (match) offenders.push(`${path.relative(VIEWS, full)} (${match[0].trim()})`);
      return undefined;
    });
  };
  walk(VIEWS);
  assert.deepStrictEqual(offenders, [],
    'move these to public/js/ui.js and drive them from a data- attribute');
});

test('the policy authorises the inline scripts that remain, and nothing more', () => {
  const { CSP_PARTS } = require('../src/middleware/securityHeaders');
  const scriptSrc = CSP_PARTS.find((p) => p.startsWith('script-src'));
  assert.ok(scriptSrc.includes("'self'"), 'own scripts load');
  assert.ok(scriptSrc.includes('{NONCE}'), 'the two inline scripts are nonce-authorised');
  assert.ok(!scriptSrc.includes("'unsafe-inline'"),
    "'unsafe-inline' would make the whole policy decorative");
  assert.ok(!scriptSrc.includes("'unsafe-eval'"));

  assert.ok(CSP_PARTS.includes("frame-ancestors 'none'"), 'clickjacking');
  assert.ok(CSP_PARTS.includes("object-src 'none'"));
  assert.ok(CSP_PARTS.includes("base-uri 'self'"), 'a base tag could redirect every relative URL');
  assert.ok(CSP_PARTS.includes("form-action 'self'"), 'a form must not post off-site');
});

test('a post editor is not drawn for someone who cannot save it', () => {
  // The capability model promises that a control is never shown to someone
  // the route will then refuse.
  const ejs = require('ejs');
  const {
    CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS, defaultsFor,
    capabilityIsUsableBy, CAPABILITY_REQUIRES_ROLE,
  } = require('../src/services/capabilities');
  const i18n = require('../src/i18n');
  const file = path.join(__dirname, '..', 'src', 'views', 'admin', 'user-form.ejs');

  const locals = (grants) => ({
    t: i18n.t('en'),
    can: (c) => grants.includes(c),
    href: (p) => p,
    csrfToken: 'tok',
    cspNonce: 'n',
    mode: 'edit',
    user: { id: 2, name: 'Elena Guriță', login: 'gurita.elena', isActive: true },
    posts: [{
      id: 7, role: 'META_MENTOR', label: null, isActive: true, institution: 'LT Boris Dînga',
      selected: capabilitiesFor('META_MENTOR', []),
    }],
    errorMessage: null,
    schools: [{ id: 1, name: 'LT Mihai Eminescu' }],
    territories: [{ id: 1, name: 'Chișinău' }],
    roles: ROLES,
    capabilityGroups: CAPABILITY_GROUPS,
    roleDefaults: ROLE_DEFAULTS,
    defaultsFor,
    capabilityIsUsableBy,
    CAPABILITY_REQUIRES_ROLE,
  });

  const render = (grants) => ejs.render(fs.readFileSync(file, 'utf8'), locals(grants), { filename: file });

  const withGrant = render(['admin.users', 'admin.grant']);
  assert.ok(withGrant.includes('/admin/users/2/assignments/7'), 'the editor is there for a granter');
  assert.ok(withGrant.includes('/admin/users/2/assignments'), 'and so is add-post');

  const withoutGrant = render(['admin.users']);
  assert.ok(!withoutGrant.includes('/admin/users/2/assignments'),
    'no form may point at a route this account cannot use');
  assert.ok(!withoutGrant.includes('/admin/users/2/delete'), 'nor the delete button');
  assert.ok(withoutGrant.includes('/admin/users/2/reset-password'),
    'but running the pilot — issuing a new password — still works');
  assert.ok(withoutGrant.includes('LT Boris Dînga'), 'the post is still visible, just not editable');
});

test('the policy is also delivered in the document, since the host strips the header', () => {
  const { securityHeaders, META_IGNORED } = require('../src/middleware/securityHeaders');
  const res = { locals: {}, headers: {}, setHeader(k, v) { this.headers[k] = v; } };
  securityHeaders({ path: '/ministry' }, res, () => {});

  const header = res.headers['Content-Security-Policy'];
  const meta = res.locals.cspMeta;

  assert.ok(header.includes("script-src 'self' 'nonce-"), 'the header carries the policy');
  assert.ok(meta.includes("script-src 'self' 'nonce-"), 'and so does the meta copy');
  assert.ok(meta.includes(res.locals.cspNonce),
    'the meta copy must name the same nonce, or the inline scripts are blocked');

  // A meta tag silently ignores these, so they are dropped from that copy
  // rather than left in to look reassuring.
  META_IGNORED.forEach((directive) => {
    assert.ok(header.includes(directive), `${directive} belongs in the header`);
    assert.ok(!meta.includes(directive), `${directive} is ignored in a meta tag`);
  });

  // Which is only acceptable because this says the same thing and survives.
  assert.strictEqual(res.headers['X-Frame-Options'], 'DENY');
});

test('the CSP meta tag is the first policy-bearing thing in the document', () => {
  // A meta policy governs what follows it. Placed after a <script> or a
  // <link>, it would not apply to them.
  const head = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'views', 'partials', 'head.ejs'), 'utf8');
  const metaAt = head.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(metaAt !== -1, 'head.ejs must carry the policy');

  const before = head.slice(0, metaAt);
  assert.ok(!before.includes('<script'), 'no script may precede the policy');
  assert.ok(!before.includes('<link'), 'no link may precede the policy');
});

// ---------------------------------------------------------------------------
// Rate limits on a deployment that cannot see client addresses
// ---------------------------------------------------------------------------

test('twelve people mistyping their passwords do not lock each other out', () => {
  // The scenario this has to survive: a room of meta-mentors at a workshop,
  // behind one connection, typing twelve-character one-time passwords. The
  // CDN gives every request the same address, so an address-keyed budget is
  // really one budget for everybody — and the old numbers (40 failures) would
  // have been spent between them.
  const { createLimiter } = require('../src/middleware/rateLimit');
  const { MAX_PER_ACCOUNT, MAX_OVERALL } = require('../src/middleware/loginRateLimit');

  const perAccount = createLimiter({ windowMs: 900000, max: MAX_PER_ACCOUNT });
  const overall = createLimiter({ windowMs: 900000, max: MAX_OVERALL });

  const people = Array.from({ length: 12 }, (_, i) => `mentor.${i}`);
  const TYPOS = 3;
  people.forEach((login) => {
    for (let i = 0; i < TYPOS; i++) { perAccount.record(login); overall.record('all'); }
  });

  people.forEach((login) => {
    assert.ok(!perAccount.exceeded(login), `${login} must still be able to sign in`);
  });
  assert.ok(!overall.exceeded('all'),
    `12 people x ${TYPOS} typos must stay under the overall ceiling of ${MAX_OVERALL}`);
});

test('one account being guessed at is still stopped', () => {
  const { createLimiter } = require('../src/middleware/rateLimit');
  const { MAX_PER_ACCOUNT } = require('../src/middleware/loginRateLimit');
  const perAccount = createLimiter({ windowMs: 900000, max: MAX_PER_ACCOUNT });

  for (let i = 0; i < MAX_PER_ACCOUNT; i++) perAccount.record('gurita.elena');
  assert.ok(perAccount.exceeded('gurita.elena'), 'the account under attack is protected');
  assert.ok(!perAccount.exceeded('donos.inna'), 'and nobody else is affected');
});

test('the per-account budget does not depend on the address', () => {
  // It used to be keyed on IP+login, so an attacker who could present
  // different addresses got a fresh budget for each. Behind this CDN nobody
  // can, but the rule should not depend on that being true.
  const { _limiters } = require('../src/middleware/loginRateLimit');
  _limiters.perAccount.reset();
  _limiters.overall.reset();

  const req = (login) => ({ body: { login }, ip: Math.random().toString() });
  const { recordFailedAttempt } = require('../src/middleware/loginRateLimit');
  for (let i = 0; i < 10; i++) recordFailedAttempt(req('victim.account'));
  assert.ok(_limiters.perAccount.exceeded('victim.account'),
    'ten failures is ten failures, whatever address they claim to come from');
  _limiters.perAccount.reset();
  _limiters.overall.reset();
});

test('limits are honestly labelled as global on this deployment', () => {
  const { limitsAreGlobal, clientId } = require('../src/utils/clientId');
  // TRUST_CLIENT_IP is off by default because the CDN does not forward the
  // client address. Claiming to distinguish clients when you cannot is worse
  // than admitting you cannot.
  assert.strictEqual(limitsAreGlobal, true);
  assert.strictEqual(clientId({ ip: '203.0.113.9' }), 'all',
    'every visitor counts against the same bucket, and the code says so');
});

test('no response from this app may be stored in a shared cache', () => {
  // Found on the live site, not here: the host runs a CDN in front of the app,
  // the app said nothing about caching, and the CDN decided for itself. It
  // treated /ministry/export.csv as a static file because of the extension,
  // kept the signed-in Ministry's download, and served that copy — every
  // school's name, district and domain averages — to anyone who asked for the
  // URL with no session at all. The give-away was a 200 with an `age` header
  // on an unauthenticated request.
  //
  // Every other route escaped only because that CDN happens not to cache HTML,
  // which is luck rather than a policy. The origin now says so itself.
  const { securityHeaders } = require('../src/middleware/securityHeaders');

  const headersFor = (path) => {
    const res = { locals: {}, headers: {}, setHeader(k, v) { this.headers[k] = v; } };
    securityHeaders({ path }, res, () => {});
    return res.headers;
  };

  ['/', '/ministry', '/ministry/export', '/school/cycles/1/plan/document', '/admin/audit-log']
    .forEach((path) => {
      const value = headersFor(path)['Cache-Control'] || '';
      assert.match(value, /no-store/, `${path} may not be stored`);
      assert.match(value, /private/, `${path} may not be stored by a shared cache`);
    });

  // The one exemption, and the reason /static exists as its own path.
  assert.strictEqual(headersFor('/static/css/style.css')['Cache-Control'], undefined);
});

test('the download is not shaped like a static file', () => {
  // The header above is the rule; this is the belt to its braces. A CDN that
  // caches by file extension never gets the chance to make that judgement
  // about a URL that has no extension.
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'ministry.js'), 'utf8');
  assert.ok(!/router\.get\('\/export\.csv'/.test(source),
    'the export must not sit on a path ending in .csv');
  assert.match(source, /router\.get\('\/export'/);
  // The saved file is still named, so nothing changes for the person clicking.
  assert.match(source, /filename="digipuls-schools\.csv"/);

  const view = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'views', 'ministry', 'dashboard.ejs'), 'utf8');
  assert.ok(!view.includes('/ministry/export.csv'), 'and no link may point at the old one');
});

test('a room full of people fumbling their passwords cannot lock out the cohort', () => {
  // Measured, not guessed: the platform is sized for seventy people at once,
  // and on a training morning they are typing twelve-character one-time
  // passwords by hand. Three fumbles each is 210 failures. The ceiling was
  // 200, chosen when the pilot meant twelve people — so the whole cohort would
  // have been locked out for fifteen minutes at the moment everyone was
  // watching.
  const {
    MAX_OVERALL, MAX_PER_ACCOUNT, COHORT,
  } = require('../src/middleware/loginRateLimit');

  const FUMBLES = 3;
  assert.ok(MAX_OVERALL > COHORT * FUMBLES,
    `${COHORT} people fumbling ${FUMBLES} times is ${COHORT * FUMBLES} failures, `
    + `which must not reach the ceiling of ${MAX_OVERALL}`);

  // And still bounded: the per-account rule is the real protection, and the
  // ceiling has to stay far below anything useful for guessing.
  assert.ok(MAX_PER_ACCOUNT <= 10, 'one account still gets ten tries, not more');
  assert.ok(MAX_OVERALL <= 5000, 'the ceiling must still bound a brute-force run');
});

test('no route sits on a path a cache will mistake for a static file', () => {
  // The generalised version of the export bug, and the reason it is worth a
  // test rather than a memo. The host's CDN decides what to cache by looking
  // at the URL, not at what the origin says: /ministry/export.csv was treated
  // as a file, cached while a Ministry account was signed in, and served to
  // anonymous visitors. The origin now sends no-store on everything, but a
  // second line of defence costs nothing — a path with no extension is never
  // offered to that heuristic in the first place.
  const dir = path.join(__dirname, '..', 'src', 'routes');
  const offenders = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((file) => {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const routes = source.match(/router\.(?:get|post)\('([^']+)'/g) || [];
    routes.forEach((decl) => {
      const route = decl.replace(/router\.(?:get|post)\('/, '').replace(/'$/, '');
      // A trailing .something on the last segment is what a cache reads as a
      // file extension. Route parameters (:id) are not that.
      const last = route.split('/').pop();
      if (/\.[a-z0-9]{2,5}$/i.test(last)) offenders.push(`${file}: ${route}`);
    });
  });
  assert.deepStrictEqual(offenders, [],
    'these routes look like static files to a CDN — drop the extension and name '
    + 'the download with Content-Disposition instead');
});
