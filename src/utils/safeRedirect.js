// Where the app is willing to send a browser after an action.
//
// Two callers hand a redirect target to the browser from something the
// *request* supplied: the language and preference forms carry a `back` field
// so a visitor returns to the page they were reading, and login redirects to
// the page that bounced them (`session.returnTo`). Both are places an
// attacker would like to put their own URL, so both go through here.
//
// Lives in its own module rather than in app.js because requiring app.js
// starts a listening server, and a rule this small should be testable without
// one.

/**
 * @param {unknown} value  a candidate path, from a form field or the session
 * @returns {string} the value if it is a safe same-site path, otherwise '/'
 *
 * Rejects, in order:
 *   https://evil.com   absolute — not ours
 *   //evil.com         protocol-relative, and still starts with "/"
 *   /\evil.com         browsers normalise the backslash, giving the above
 *   /a<CR><LF>…        control characters, i.e. response splitting
 */
function safeRedirect(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  // The second character may not be another slash or a backslash.
  if (/^\/[/\\]/.test(value)) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
}

module.exports = { safeRedirect };
