// Cross-site request forgery protection.
//
// Every state-changing route in this app is a plain session-authenticated
// POST, and the session cookie is sent on cross-site POSTs unless SameSite
// says otherwise. SameSite is now set (see app.js), which stops most of this
// on its own — but SameSite is a browser-side control with a history of
// differing defaults, and "the browser will protect us" is not the same as
// protecting ourselves. So: a per-session token that must come back with the
// request.
//
// The token is per session rather than per form. A per-form token would also
// break the app's own design goal of working without JavaScript across
// multiple tabs — two tabs open on two workspaces would invalidate each
// other's forms.

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// /preferences is deliberately exempt. It writes display settings — theme,
// text size, motion — into a cookie, from a strict allow-list, for anyone
// including anonymous readers of the public school pages. There is no attack
// in forging it (the worst an attacker achieves is a larger font), and
// requiring a token would mean minting a session, and therefore a cookie, for
// every anonymous visitor to the public tier. Not protecting it is the more
// privacy-preserving choice, not a gap.
const EXEMPT = /^\/preferences(\/|$)/;

function issueToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('base64url');
  }
  return req.session.csrfToken;
}

/** Constant-time compare that tolerates length differences without throwing. */
function matches(expected, given) {
  if (typeof expected !== 'string' || typeof given !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function submittedToken(req) {
  return (req.body && req.body._csrf)
    || req.get('x-csrf-token')
    || null;
}

/**
 * Issues a token for every request that renders something, and verifies it on
 * every request that changes something.
 */
function csrf(req, res, next) {
  const token = issueToken(req);
  // Views read this; head.ejs also publishes it as a <meta> so the feedback
  // overlay's fetch() can send it as a header.
  res.locals.csrfToken = token || '';

  if (SAFE_METHODS.has(req.method) || EXEMPT.test(req.path)) return next();

  if (!matches(token, submittedToken(req))) {
    const t = res.locals.t || ((k) => k);
    // A stale token is the ordinary case — a form left open past a logout, or
    // a session that expired — so the message says what to do about it rather
    // than accusing the person of an attack.
    if (req.get('accept') && req.get('accept').includes('application/json')) {
      return res.status(403).json({ ok: false, error: 'csrf' });
    }
    return res.status(403).render('error', {
      title: t('err_access_denied'),
      message: t('err_csrf'),
    });
  }
  return next();
}

/**
 * Called after session.regenerate() on login: regeneration throws the old
 * session away, token included, so the next page would otherwise render with
 * an empty token and every form on it would fail.
 */
function rotateToken(req) {
  if (req.session) delete req.session.csrfToken;
  return issueToken(req);
}

module.exports = { csrf, rotateToken, issueToken };
