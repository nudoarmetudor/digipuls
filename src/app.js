require('dotenv').config();
const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const morgan = require('morgan');
const path = require('path');

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
  next();
});

// Language selection — session-persisted, defaults to English so existing
// flows/screenshots aren't disrupted; switch via the nav toggle (/lang/ro).
const i18n = require('./i18n');
app.use((req, res, next) => {
  const lang = i18n.SUPPORTED_LANGS.includes(req.session.lang) ? req.session.lang : 'en';
  req.lang = lang;
  res.locals.lang = lang;
  res.locals.t = i18n.t(lang);
  res.locals.STATUS_LABELS = i18n.STATUS_LABELS[lang];
  res.locals.CHANGE_STATE_LABELS = i18n.CHANGE_STATE_LABELS[lang];
  next();
});
app.get('/lang/:code', (req, res) => {
  if (i18n.SUPPORTED_LANGS.includes(req.params.code)) req.session.lang = req.params.code;
  // Guard against open-redirect: must be a same-site path, not a
  // protocol-relative URL (//evil.com would still start with "/").
  const back = req.query.back && /^\/(?!\/)/.test(req.query.back) ? req.query.back : '/';
  res.redirect(back);
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
    title: 'Something went wrong',
    message: err.message,
  });
});

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: `No route for ${req.originalUrl}` });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DigiPuls running at http://localhost:${PORT}`);
});

module.exports = app;
