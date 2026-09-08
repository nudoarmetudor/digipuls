// Response security headers, written out by hand rather than pulling in
// helmet: this app has one HTML surface and no third-party assets, so the
// policy is short enough to read in full, and a dependency whose defaults
// change between majors is a worse fit than a dozen explicit lines.
//
// The Content-Security-Policy is unusually strict because it can be. DigiPuls
// loads no CDN scripts, no web fonts and no analytics — everything comes from
// /static — so 'self' is genuinely sufficient, and there is no need for the
// 'unsafe-inline' escape hatch that makes most CSPs decorative.
//
// Two inline scripts exist for good reasons and cannot become external files:
// head.ejs applies the display preferences before first paint (an external
// file would load too late and the page would visibly flash the wrong theme),
// and school-new.ejs hands three translated strings to its SIME autocomplete.
// A per-response nonce lets exactly those two run while anything else injected
// into the page stays blocked, which is the point of having the policy.
//
// The one acknowledged gap is 'unsafe-inline' for style-src: several views
// carry small inline style attributes and the wheel SVG paints through CSS
// custom properties. Removing those is worth doing, but silently breaking the
// layout is not an acceptable price for a header, so it is named here rather
// than quietly worked around.

const crypto = require('crypto');

const CSP_PARTS = [
  "default-src 'self'",
  "script-src 'self' 'nonce-{NONCE}'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
];

function securityHeaders(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Content-Security-Policy', CSP_PARTS.join('; ').replace('{NONCE}', nonce));

  // frame-ancestors above is the modern control; this is the fallback for
  // browsers that predate it. Both say the same thing: never framed. Without
  // it the admin screens can be loaded invisibly over a decoy page and their
  // buttons clicked by someone who thinks they are clicking something else.
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // URLs here name a workspace and a school. Sending those to another origin
  // in a Referer header would disclose which institution someone is working
  // on, so cross-origin navigations get the bare origin only.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Nothing here uses any of these. Saying so explicitly means a future
  // dependency cannot quietly start.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  // HSTS only in production, and only there: sending it from a local
  // http://localhost dev server would pin the developer's browser to HTTPS
  // for localhost and break every other project they run on that port.
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

module.exports = { securityHeaders, CSP_PARTS };
