require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');
const path = require('path');
const prefs = require('./utils/prefs');

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

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'digipuls-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// Make the logged-in user available to every view without passing it
// explicitly from every route.
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.currentPath = req.path;
  // Gates the login page's demo-accounts panel — off by default once real
  // schools are being onboarded (see DEPLOYMENT.md). Defaults to on so
  // local `npm run dev` + `npm run seed` still shows it out of the box.
  res.locals.demoMode = process.env.DEMO_MODE !== 'false';
  next();
});

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

// Guard against open-redirect: the return path must be a same-site path, not
// a protocol-relative URL (//evil.com would still start with "/").
function safeBack(value) {
  return value && /^\/(?!\/)/.test(value) ? value : '/';
}

app.get('/lang/:code', (req, res) => {
  if (i18n.SUPPORTED_LANGS.includes(req.params.code)) {
    req.session.lang = req.params.code;
    res.cookie(LANG_COOKIE, req.params.code, {
      maxAge: 1000 * 60 * 60 * 24 * 365, sameSite: 'lax',
    });
  }
  res.redirect(safeBack(req.query.back));
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
  res.redirect(safeBack(req.body.back));
});

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

app.use('/', require('./routes/auth'));
app.use('/school', require('./routes/school'));
app.use('/ministry', require('./routes/ministry'));
app.use('/territorial', require('./routes/territorial'));
app.use('/partner', require('./routes/partner'));
app.use('/strategic', require('./routes/strategic'));
app.use('/public-view', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

app.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) return res.redirect('/login');
  const home = {
    SCHOOL_TEAM: '/school',
    MINISTRY: '/ministry',
    TERRITORIAL: '/territorial',
    PARTNER: '/partner',
    STRATEGIC_PARTNER: '/strategic',
    ADMIN: '/admin',
  };
  res.redirect(home[user.role] || '/login');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: res.locals.t ? res.locals.t('err_something_wrong') : 'Something went wrong',
    message: err.message,
  });
});

app.use((req, res) => {
  const t = res.locals.t || ((k) => k);
  res.status(404).render('error', { title: t('err_not_found'), message: t('err_no_route', { path: req.originalUrl }) });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DigiPuls running at http://localhost:${PORT}`);
});

module.exports = app;
