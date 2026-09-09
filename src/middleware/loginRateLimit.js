// Login throttling on a deployment that cannot tell one visitor from another.
//
// The CDN in front of this app does not forward the client address — every
// request claims the same edge IP (see utils/clientId.js). So the earlier
// design, "8 failures per IP+login and 40 per IP", was really "40 failed
// logins for the entire internet per 15 minutes". Twelve meta-mentors in one
// room mistyping twelve-character one-time passwords would have spent that
// budget between them and locked out the pilot, and any bot poking at /login
// would have done it for them.
//
// What replaces it:
//
//   per account   Keyed on the login alone, not on the address. That is both
//                 safer and fairer here: an attacker who could rotate
//                 addresses used to get a fresh budget for each, and a
//                 legitimate person no longer shares a budget with strangers.
//                 Ten attempts in fifteen minutes, then a quarter of an hour's
//                 wait.
//
//   overall       A ceiling on failed logins across the whole app, sized so
//                 that no plausible room full of people can reach it, but a
//                 brute-force run is bounded. With bcrypt at cost 10 and
//                 randomly generated passwords, throughput is the only thing
//                 worth limiting; the per-account rule is what actually
//                 protects an account.
//
// The trade is deliberate and worth naming: because the per-account counter
// ignores the address, someone who knows a login can keep that one account
// locked out for fifteen minutes at a time. For a pilot of twenty-nine
// accounts that is a far better failure than the whole cohort being locked
// out together, and it heals itself. A real fix needs the client address —
// see utils/clientId.js.

const { createLimiter } = require('./rateLimit');
const { limitsAreGlobal } = require('../utils/clientId');

const WINDOW_MS = 15 * 60 * 1000;

// Per account. Ten is enough for a fumbled one-time password and far short of
// useful for guessing.
const MAX_PER_ACCOUNT = 10;

// Across everybody, and sized against the cohort rather than a round number.
//
// It was 200, chosen when the pilot meant twelve meta-mentors: "twelve people
// failing ten times each is 120". The platform is now sized for seventy people
// at once — twelve schools of five or six, plus the mentoring line — and
// seventy people hand-typing twelve-character one-time passwords on a training
// morning reach 210 on three fumbles each. That would have locked out the
// entire cohort for fifteen minutes, at the exact moment everyone was watching.
//
// The per-account rule is what actually protects an account; this is a
// throughput ceiling on guessing. At bcrypt cost 10 — measured at roughly 90ms
// on this host — a thousand failures in fifteen minutes is about one a second,
// which is a tenth of one core and nowhere near useful against a randomly
// generated password.
//
// Successful logins never touch this counter: only recordFailedAttempt does.
// Seventy people signing in correctly cost nothing at all.
const COHORT = 70;
const MAX_OVERALL = 1000;

const perAccount = createLimiter({ windowMs: WINDOW_MS, max: MAX_PER_ACCOUNT });
const overall = createLimiter({ windowMs: WINDOW_MS, max: MAX_OVERALL });

function accountKey(req) {
  return ((req.body && req.body.login) || '').toLowerCase().trim();
}

function loginRateLimit(req, res, next) {
  const login = accountKey(req);
  if (perAccount.exceeded(login) || overall.exceeded('all')) {
    const t = res.locals.t || ((k) => k);
    res.setHeader('Retry-After', Math.ceil(WINDOW_MS / 1000));
    return res.status(429).render('auth/login', {
      title: t('login_title'),
      error: t('login_rate_limited'),
      layout: false,
    });
  }
  return next();
}

function recordFailedAttempt(req) {
  perAccount.record(accountKey(req));
  overall.record('all');
}

function clearAttempts(req) {
  // Only this account's counter is cleared. The overall counter deliberately
  // survives a success: an attacker who guesses one password should not
  // thereby reset the budget they were spending on everything else.
  perAccount.clear(accountKey(req));
}

module.exports = {
  loginRateLimit, recordFailedAttempt, clearAttempts,
  WINDOW_MS, MAX_PER_ACCOUNT, MAX_OVERALL, COHORT, limitsAreGlobal,
  _limiters: { perAccount, overall },
};
