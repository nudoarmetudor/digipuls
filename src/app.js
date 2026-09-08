require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');
const path = require('path');
const prefs = require('./utils/prefs');
const { loadAccount } = require('./middleware/auth');
const { extractWorkspace, loadWorkspace } = require('./middleware/workspace');
const { homeFor } = require('./services/capabilities');
const { csrf } = require('./middleware/csrf');
const { securityHeaders } = require('./middleware/securityHeaders');
const { throttle } = require('./middleware/rateLimit');
const { safeRedirect } = require('./utils/safeRedirect');

// No silent fallback in production — sessions signed with the checked-in
// dev secret are not secure once real accounts/data exist on this instance.
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET must be set in production. Refusing to start with the default dev secret.');
  process.exit(1);
}

const app = express();

// Hostinger (and most PaaS-style Node hosts) terminate TLS at a reverse
// proxy in front of the app — without this, express-session can't tell
// the connection is actually HTTPS and secure cookies would never be sent.
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// First, so that every response carries the policy — including the error
// pages, which are exactly the responses an attacker wants to reach.
app.use(securityHeaders);

// Strips a /w/<id> workspace prefix off the URL before any route sees it,
// so every route path in the app stays prefix-unaware. See
// middleware/workspace.js for why the active role lives in the URL.
app.use(extractWorkspace);

// 'dev' is a developer's format, and in production it writes every request
// path - workspace and school ids included - into the host's shared log.
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
// No /uploads mount: nothing in the app writes there. Serving an empty
// directory only creates somewhere for a future bug to drop a file and have
// it served straight back.

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'digipuls-dev-secret',
    resave: false,
    saveUninitialized: false,
    name: 'digipuls.sid',
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      // 'lax' rather than 'strict', deliberately. Both stop the attack that
      // matters — the cookie is not sent on a cross-site POST either way —
      // but 'strict' also withholds it when someone follows an ordinary link
      // into the app from elsewhere, so a mentor clicking a link in an email
      // arrives apparently logged out and has to reload. That is a real cost
      // during a pilot, paid for protection the CSRF token in
      // middleware/csrf.js already provides.
      sameSite: 'lax',
    },
  })
);

// Version fingerprinting for free is a courtesy to an attacker, not to us.
app.disable('x-powered-by');

// Records which template is being rendered, so a feedback ticket can name
// the file a developer needs to open. Wrapping res.render here means no route
// has to remember to pass it, and it cannot drift out of date.
app.use((req, res, next) => {
  const render = res.render.bind(res);
  res.render = (view, options, callback) => {
    res.locals.viewName = view;
    return render(view, options, callback);
  };
  next();
});

// Make the logged-in user available to every view without passing it
// explicitly from every route.
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  // Unprefixed: used for aria-current comparisons against route paths.
  res.locals.currentPath = req.path;
  // Gates the login page's demo-accounts panel — off by default once real
  // schools are being onboarded (see DEPLOYMENT.md). Defaults to on so
  // local `npm run dev` + `npm run seed` still shows it out of the box.
  res.locals.demoMode = process.env.DEMO_MODE !== 'false';
  next();
});

// Re-reads the signed-in account on every request: whether it is still
// active, and what it may currently do. See middleware/auth.js for why this
// is a query rather than a value cached in the session.
app.use(loadAccount);

// Which of the person's assignments this request is acting under, and
// therefore what it may do.
app.use(loadWorkspace);

// --- Language ---------------------------------------------------------------
// English, Romanian and Russian. The choice is remembered in the session for
// signed-in users and in a cookie for everyone else, so someone reading the
// public school pages in Russian isn't reset to English on every page, and
// doesn't have to create a session just to be served their own language.
const i18n = require('./i18n');
const LANG_COOKIE = 'dp_lang';

function pickLang(req) {
  if (i18n.SUPPORTED_LANGS.includes(req.session.lang)) return req.session.lang;
  const cookie = prefs.readRawCookie(req, LANG_COOKIE);
  if (i18n.SUPPORTED_LANGS.includes(cookie)) return cookie;
  // Last resort: the browser's own preference, so a first-time visitor on a
  // Romanian- or Russian-language browser isn't shown English by default.
  return i18n.pickFromAcceptLanguage(req.headers['accept-language']);
}

app.use((req, res, next) => {
  const lang = pickLang(req);
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.t = i18n.t(lang);
  res.locals.STATUS_LABELS = i18n.STATUS_LABELS[lang];
  res.locals.CHANGE_STATE_LABELS = i18n.CHANGE_STATE_LABELS[lang];
  res.locals.SUPPORTED_LANGS = i18n.SUPPORTED_LANGS;
  res.locals.LANG_NAMES = i18n.LANG_NAMES;
  res.locals.LANG_SHORT = i18n.LANG_SHORT;
  next();
});

app.get('/lang/:code', (req, res) => {
  if (i18n.SUPPORTED_LANGS.includes(req.params.code)) {
    req.session.lang = req.params.code;
    res.cookie(LANG_COOKIE, req.params.code, {
      maxAge: 1000 * 60 * 60 * 24 * 365, sameSite: 'lax',
    });
  }
  res.redirect(safeRedirect(req.query.back));
});

// --- Display & accessibility preferences ------------------------------------
// Colour scheme, contrast, text size, motion and link underlining. Read from
// a cookie on every request so the right attributes are already on <html> in
// the first response: no flash of the wrong theme, and the whole thing works
// with JavaScript switched off (public/js/a11y.js only upgrades it to apply
// instantly rather than via this round-trip).
app.use((req, res, next) => {
  const viewerPrefs = prefs.readPrefs(req);
  res.locals.prefs = viewerPrefs;
  res.locals.prefsAttrs = prefs.htmlAttrs(viewerPrefs);
  next();
});

app.post('/preferences', (req, res) => {
  const chosen = prefs.prefsFromBody(req.body);
  res.cookie(prefs.COOKIE_NAME, prefs.serialize(chosen), {
    maxAge: 1000 * 60 * 60 * 24 * 365, sameSite: 'lax',
  });
  res.redirect(safeRedirect(req.body.back));
});

// Issues the CSRF token for every render, and verifies it on every write.
//
// Placed after the language and display middleware on purpose: when it
// refuses a request it renders a full error page, and that page needs a
// translator and the viewer's theme. Mounted earlier, the refusal itself
// threw — which turned a clean 403 into a 500 and told the visitor nothing.
app.use(csrf);

// Forced first-login password change: nothing else is reachable for an
// account still carrying a system-generated one-time password.
app.use((req, res, next) => {
  const user = req.session.user;
  // The display and language controls stay reachable: someone forced to
  // set a password should still be able to read the form in their own
  // language, or turn up the text size to read it at all.
  const allowed = req.path === '/change-password' || req.path === '/logout'
    || req.path === '/preferences' || req.path.startsWith('/lang/');
  if (user && user.mustChangePassword && !allowed) return res.redirect('/change-password');
  next();
});

// loadWorkspace runs before the language middleware, so it records the
// refusal rather than rendering it — this is the first point where there is a
// translator to render it with.
app.use((req, res, next) => {
  if (!req.workspaceNotFound) return next();
  return res.status(404).render('error', {
    title: res.locals.t('err_not_found'),
    message: res.locals.t('err_workspace_not_found'),
  });
});

app.use('/', require('./routes/auth'));
app.use('/school', require('./routes/school'));
app.use('/ministry', require('./routes/ministry'));
app.use('/territorial', require('./routes/territorial'));
app.use('/partner', require('./routes/partner'));
app.use('/strategic', require('./routes/strategic'));
// The only routes reachable without a login, and the only ones an anonymous
// client can use to make the app do database work. This host bills the
// database user a cumulative max_connections_per_hour, so an unthrottled
// public tier is not just a slow-site risk: exhausting that quota also stops
// `prisma migrate deploy`, which is how deployments previously stopped
// landing. See src/config/db.js.
app.use('/public-view', throttle({ windowMs: 60 * 1000, max: 60, message: 'err_rate_limited' }), require('./routes/public'));
app.use('/workspace', require('./routes/workspace'));
app.use('/admin/users', require('./routes/adminUsers'));
app.use('/admin', require('./routes/admin'));
app.use('/feedback', require('./routes/feedback'));

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  // Several posts and none chosen yet: ask, rather than guess and show the
  // wrong institution's data.
  if (req.needsWorkspaceChoice) return res.redirect('/workspace');
  if (!req.workspace) return res.redirect('/workspace');
  const home = homeFor(req.capabilities || new Set(), { schoolId: req.workspace.schoolId });
  res.redirect(res.locals.href(home));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // The detail goes to the log, not to the page. Prisma's messages name
  // columns and constraints, which is exactly the map an attacker would
  // otherwise have to guess at.
  console.error('[error]', req.method, req.originalUrl, err);
  const t = res.locals.t || ((k) => k);
  // res.locals.href is set by loadWorkspace; an error thrown before that
  // would make the error page itself throw.
  if (!res.locals.href) res.locals.href = (p) => p;
  res.status(500).render('error', {
    title: t('err_something_wrong'),
    message: t('err_generic_detail'),
  });
});

app.use((req, res) => {
  const t = res.locals.t || ((k) => k);
  if (!res.locals.href) res.locals.href = (p) => p;
  res.status(404).render('error', { title: t('err_not_found'), message: t('err_no_route', { path: req.originalUrl }) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DigiPuls running at http://localhost:${PORT}`);
});

module.exports = app;
