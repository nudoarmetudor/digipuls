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

test('a GET is never blocked, and is what issues the token', () => {
  const req = fakeReq('GET');
  const res = fakeRes();
  assert.ok(run(req, res), 'reads must not be blocked');
  assert.ok(req.session.csrfToken, 'a token is minted');
  assert.strictEqual(res.locals.csrfToken, req.session.csrfToken, 'and published to the view');
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
  const { CAPABILITY_GROUPS, ROLES, ROLE_DEFAULTS, defaultsFor } = require('../src/services/capabilities');
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
