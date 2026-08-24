// Minimal in-memory login throttle — no new dependency, deliberately not a
// distributed/production-grade rate limiter (see ROADMAP.md). Good enough
// to stop trivial credential-stuffing against a single-process deployment;
// keyed by IP+email so one slow attacker can't lock out a shared IP's other
// users, and vice versa.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map(); // key -> { count, windowStart }

function key(req) {
  const email = (req.body && req.body.email || '').toLowerCase().trim();
  return `${req.ip}:${email}`;
}

function loginRateLimit(req, res, next) {
  const k = key(req);
  const now = Date.now();
  const entry = attempts.get(k);
  if (entry && now - entry.windowStart < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    return res.status(429).render('auth/login', {
      title: 'Log in',
      error: res.locals.t('login_rate_limited') || 'Too many attempts. Please wait a few minutes and try again.',
      layout: false,
    });
  }
  next();
}

function recordFailedAttempt(req) {
  const k = key(req);
  const now = Date.now();
  const entry = attempts.get(k);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    attempts.set(k, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(req) {
  attempts.delete(key(req));
}

module.exports = { loginRateLimit, recordFailedAttempt, clearAttempts };
