// Viewer display preferences — colour scheme, contrast, text size, motion,
// link underlining. Deliberately cookie-based rather than stored on the user
// record: they belong to the browser/device someone is sitting at, they must
// work before login (the public school pages and the login screen need them
// too), and they should never become another field of personal data attached
// to a named school employee.
//
// The cookie is a tiny, human-readable "key:value|key:value" string. It is
// read on the server so the correct attributes are already on <html> in the
// first response — no flash, and it still works with JavaScript disabled.

const COOKIE_NAME = 'dp_prefs';

// Allow-list, not free text: the values land in HTML attributes, and anything
// outside this table is dropped rather than escaped-and-trusted.
const ALLOWED = {
  theme: ['system', 'light', 'dark'],
  contrast: ['normal', 'high'],
  text: ['md', 'lg', 'xl', 'xxl'],
  motion: ['full', 'reduced'],
  underline: ['off', 'on'],
};

const DEFAULTS = { theme: 'system', contrast: 'normal', text: 'md', motion: 'full', underline: 'off' };

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const key = pair.slice(0, idx).trim();
    if (!key) return;
    try {
      out[key] = decodeURIComponent(pair.slice(idx + 1).trim());
    } catch (e) {
      // A malformed percent-escape is a broken cookie, not a reason to 500.
    }
  });
  return out;
}

/** One raw cookie value off a request, or undefined. Shared with the language
 *  middleware in app.js so the app needs no cookie-parser dependency for the
 *  two small cookies it actually sets. */
function readRawCookie(req, name) {
  return parseCookieHeader(req.headers && req.headers.cookie)[name];
}

/** Reads and validates the preference cookie off a request. Always returns a
 *  complete object — unknown or missing values fall back to the default. */
function readPrefs(req) {
  const raw = parseCookieHeader(req.headers && req.headers.cookie)[COOKIE_NAME];
  const prefs = { ...DEFAULTS };
  if (!raw) return prefs;
  raw.split('|').forEach((entry) => {
    const [key, value] = entry.split(':');
    if (ALLOWED[key] && ALLOWED[key].includes(value)) prefs[key] = value;
  });
  return prefs;
}

/** Same allow-list applied to a submitted form body. */
function prefsFromBody(body = {}) {
  const prefs = { ...DEFAULTS };
  Object.keys(ALLOWED).forEach((key) => {
    if (ALLOWED[key].includes(body[key])) prefs[key] = body[key];
  });
  return prefs;
}

function serialize(prefs) {
  return Object.keys(ALLOWED)
    .filter((k) => prefs[k] && prefs[k] !== DEFAULTS[k])
    .map((k) => `${k}:${prefs[k]}`)
    .join('|');
}

/** The subset that belongs on <html> — a preference at its default is left
 *  off entirely so the CSS falls through to the plain :root/prefers-* rules
 *  instead of pinning the viewer to an override they never chose. */
function htmlAttrs(prefs) {
  return Object.keys(ALLOWED)
    .filter((k) => prefs[k] !== DEFAULTS[k])
    .map((k) => `data-${k}="${prefs[k]}"`)
    .join(' ');
}

module.exports = { COOKIE_NAME, ALLOWED, DEFAULTS, readPrefs, readRawCookie, prefsFromBody, serialize, htmlAttrs };
