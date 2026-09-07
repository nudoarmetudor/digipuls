// Turns what a meta-mentor clicked into something a developer can locate in
// the source, and keeps the captured context inside sane bounds.
//
// The valuable half of a pilot report is *where*, not *what*. "This label is
// wrong" costs an hour of hunting; "this label is wrong, it's `step_infra` in
// views/school/step-infra.ejs" costs a minute. So the overlay captures the
// template name and a CSS path, and this module adds the piece the browser
// can't know: which translation keys produce the text that was clicked.

const { STRINGS, SUPPORTED_LANGS } = require('../i18n');

const STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'WONT_FIX', 'DUPLICATE'];
const SEVERITIES = ['BLOCKER', 'MAJOR', 'NORMAL', 'MINOR', 'IDEA'];
// A status from which the ticket counts as closed, for the "resolvedAt" stamp
// and for the mentor's own list.
const CLOSED_STATUSES = ['FIXED', 'WONT_FIX', 'DUPLICATE'];

const LIMITS = {
  comment: 4000,
  route: 500,
  viewName: 200,
  selector: 1000,
  elementSummary: 1000,
  elementText: 1000,
  i18nKeys: 500,
  lang: 8,
  displayPrefs: 120,
  viewport: 40,
  userAgent: 500,
  developerNote: 4000,
};

function clamp(value, max) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/**
 * Finds the translation keys whose text matches the clicked element.
 *
 * Searches every language, not just the one the page was rendered in: a
 * mentor reading the Russian interface reports Russian text, and the key is
 * what the developer greps for. Exact matches come first; if none, falls back
 * to keys whose (reasonably long) value appears inside the clicked text,
 * which is what happens when someone clicks a container rather than a label.
 *
 * @param {string} text  visible text of the clicked element
 * @returns {string[]}   matching keys, most specific first, capped
 */
function matchI18nKeys(text, max = 6) {
  const needle = normalizeWhitespace(text);
  if (!needle || needle.length > 600) return [];

  const exact = new Set();
  const contained = new Set();

  SUPPORTED_LANGS.forEach((lang) => {
    const dict = STRINGS[lang];
    if (!dict) return;
    Object.keys(dict).forEach((key) => {
      const value = normalizeWhitespace(dict[key]);
      if (!value) return;
      if (value === needle) {
        exact.add(key);
      } else if (value.length >= 12 && needle.includes(value)) {
        // Long enough to be a real match rather than an incidental word.
        contained.add(key);
      }
    });
  });

  const ordered = [...exact];
  contained.forEach((k) => { if (!exact.has(k)) ordered.push(k); });
  return ordered.slice(0, max);
}

/**
 * Validates and trims a ticket submission from the overlay. Returns
 * { ok: true, data } or { ok: false, error } — never throws on bad input,
 * because this endpoint is reachable by anyone who can submit feedback.
 */
function buildTicketData(body = {}, { authorId, lang }) {
  const comment = clamp(body.comment, LIMITS.comment);
  if (!comment) return { ok: false, error: 'comment_required' };

  const severity = SEVERITIES.includes(body.severity) ? body.severity : 'NORMAL';

  // The route is the one field the ticket is useless without, so it falls
  // back to something rather than being rejected.
  const route = clamp(body.route, LIMITS.route) || '(unknown)';
  const elementText = clamp(body.elementText, LIMITS.elementText);

  // Keys the client guessed are ignored: the dictionary lives here, and
  // trusting a client-supplied list would just let it write arbitrary text
  // into a field developers read as authoritative.
  const keys = matchI18nKeys(elementText || '');

  return {
    ok: true,
    data: {
      authorId,
      status: 'OPEN',
      severity,
      comment,
      route,
      viewName: clamp(body.viewName, LIMITS.viewName),
      selector: clamp(body.selector, LIMITS.selector),
      elementSummary: clamp(body.elementSummary, LIMITS.elementSummary),
      elementText,
      i18nKeys: keys.length ? keys.join(', ') : null,
      lang: clamp(body.lang, LIMITS.lang) || lang || null,
      displayPrefs: clamp(body.displayPrefs, LIMITS.displayPrefs),
      viewport: clamp(body.viewport, LIMITS.viewport),
      userAgent: clamp(body.userAgent, LIMITS.userAgent),
    },
  };
}

/**
 * The block a developer copies into an issue tracker. Plain text on purpose —
 * it has to survive being pasted anywhere.
 */
function developerBlock(ticket) {
  const lines = [
    `DigiPuls feedback #${ticket.id}`,
    `Status:    ${ticket.status}`,
    `Severity:  ${ticket.severity}`,
    `Reported:  ${new Date(ticket.createdAt).toISOString()}`,
    `Route:     ${ticket.route}`,
  ];
  if (ticket.viewName) lines.push(`Template:  src/views/${ticket.viewName}.ejs`);
  if (ticket.i18nKeys) lines.push(`i18n keys: ${ticket.i18nKeys}`);
  if (ticket.selector) lines.push(`Selector:  ${ticket.selector}`);
  if (ticket.elementSummary) lines.push(`Element:   ${ticket.elementSummary}`);
  if (ticket.elementText) lines.push(`Text:      ${ticket.elementText}`);
  const env = [ticket.lang && `lang=${ticket.lang}`, ticket.viewport && `viewport=${ticket.viewport}`, ticket.displayPrefs && `prefs=${ticket.displayPrefs}`]
    .filter(Boolean).join('  ');
  if (env) lines.push(`Env:       ${env}`);
  lines.push('', 'Comment:', ticket.comment);
  if (ticket.developerNote) lines.push('', 'Developer note:', ticket.developerNote);
  return lines.join('\n');
}

module.exports = {
  STATUSES,
  SEVERITIES,
  CLOSED_STATUSES,
  LIMITS,
  matchI18nKeys,
  buildTicketData,
  developerBlock,
};
