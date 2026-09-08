// Login throttling, in two dimensions.
//
// Per account (IP + login) stops someone grinding one person's password.
// Per IP stops the attack that actually works against a directory of
// predictable logins: one common password tried against every account in
// turn, which the per-account counter never sees because each key is touched
// only once.
//
// The IP budget is deliberately larger than the per-account one — a whole
// school sharing one NAT address is a normal thing here, and locking out a
// lyceum because one teacher mistyped their password six times would be a
// self-inflicted outage.

const { createLimiter } = require('./rateLimit');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_ACCOUNT = 8;
const MAX_PER_IP = 40;

const perAccount = createLimiter({ windowMs: WINDOW_MS, max: MAX_PER_ACCOUNT });
const perIp = createLimiter({ windowMs: WINDOW_MS, max: MAX_PER_IP });

function accountKey(req) {
  const login = ((req.body && req.body.login) || '').toLowerCase().trim();
  return `${req.ip}:${login}`;
}

function loginRateLimit(req, res, next) {
  if (perAccount.exceeded(accountKey(req)) || perIp.exceeded(req.ip)) {
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
  perIp.record(req.ip);
}

function clearAttempts(req) {
  // Only the per-account counter is cleared on success. The per-IP counter
  // deliberately survives: an attacker who guesses one account correctly
  // should not thereby reset the budget they were spending on all the others.
  perAccount.clear(accountKey(req));
}

module.exports = {
  loginRateLimit, recordFailedAttempt, clearAttempts,
  WINDOW_MS, MAX_PER_ACCOUNT, MAX_PER_IP,
  _limiters: { perAccount, perIp },
};
