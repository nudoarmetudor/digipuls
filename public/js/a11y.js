/* DigiPuls — viewer accessibility preferences.
 *
 * Progressive enhancement, in three layers:
 *   1. No JavaScript at all: the panel is a plain <details> + <form> that
 *      POSTs to /preferences, which sets the dp_prefs cookie and redirects
 *      back. Everything works, it just costs a page load.
 *   2. This script: applies each change instantly (no reload) and writes the
 *      same cookie itself, so the server keeps rendering the right thing.
 *   3. Nothing is stored server-side or tied to an account — preferences
 *      belong to the browser, and the cookie carries no personal data.
 *
 * The <head> inline snippet (see views/partials/head.ejs) has already applied
 * the stored preferences before first paint; this file only handles changes.
 */
(function () {
  'use strict';

  // Each preference's default value. A preference sitting at its default is
  // stripped from <html> entirely, so the CSS falls through to the plain
  // :root / prefers-* rules rather than pinning the viewer to an override.
  var DEFAULTS = { theme: 'system', contrast: 'normal', text: 'md', motion: 'full', underline: 'off' };
  var KEYS = Object.keys(DEFAULTS);
  var COOKIE = 'dp_prefs';
  var root = document.documentElement;

  function read() {
    var out = {};
    try {
      var raw = localStorage.getItem(COOKIE);
      if (raw) out = JSON.parse(raw) || {};
    } catch (e) {
      /* private mode, or storage disabled — fall back to what's on <html> */
    }
    KEYS.forEach(function (k) {
      if (!out[k]) {
        var attr = root.getAttribute('data-' + k);
        if (attr) out[k] = attr;
      }
    });
    return out;
  }

  function persist(prefs) {
    try {
      localStorage.setItem(COOKIE, JSON.stringify(prefs));
    } catch (e) {
      /* ignore — the cookie below is the one the server actually reads */
    }
    var parts = KEYS.filter(function (k) { return prefs[k]; })
      .map(function (k) { return k + ':' + prefs[k]; });
    // Lax + one year: this is a display preference, not a session credential.
    document.cookie = COOKIE + '=' + encodeURIComponent(parts.join('|')) +
      ';path=/;max-age=31536000;samesite=lax';
  }

  function apply(prefs) {
    KEYS.forEach(function (k) {
      if (prefs[k] && prefs[k] !== DEFAULTS[k]) root.setAttribute('data-' + k, prefs[k]);
      else root.removeAttribute('data-' + k);
    });
  }

  var prefs = read();

  document.addEventListener('DOMContentLoaded', function () {
    var panel = document.querySelector('[data-a11y-panel]');
    if (!panel) return;

    // The submit button is only needed when scripting is off.
    var applyRow = panel.querySelector('.a11y-apply');
    if (applyRow) applyRow.hidden = true;

    panel.addEventListener('change', function (ev) {
      var input = ev.target;
      if (!input.name || KEYS.indexOf(input.name) === -1) return;
      prefs[input.name] = input.type === 'checkbox'
        ? (input.checked ? input.value : input.getAttribute('data-off') || '')
        : input.value;
      apply(prefs);
      persist(prefs);
      announce(panel);
    });

    // Escape closes the panel and returns focus to its own summary, so
    // keyboard users are never stranded inside it.
    var details = panel.closest('details');
    if (details) {
      details.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && details.open) {
          details.open = false;
          var summary = details.querySelector('summary');
          if (summary) summary.focus();
        }
      });
      document.addEventListener('click', function (ev) {
        if (details.open && !details.contains(ev.target)) details.open = false;
      });
    }
  });

  var announceTimer = null;
  function announce(panel) {
    var live = panel.querySelector('[data-a11y-status]');
    if (!live) return;
    // Debounced: rapid changes shouldn't queue a stack of announcements. The
    // text is cleared first because assistive tech ignores a live region
    // "updated" to the string it already holds.
    clearTimeout(announceTimer);
    live.textContent = '';
    announceTimer = setTimeout(function () {
      live.textContent = live.getAttribute('data-saved-message') || 'Saved';
    }, 400);
  }

  /* Tables can overflow horizontally on narrow screens. A scroll container is
     only reachable by keyboard if it's focusable — but making every wrapper
     focusable adds pointless tab stops when nothing actually overflows, so
     decide per table, and re-check when the viewport or text size changes. */
  function syncScrollRegions() {
    document.querySelectorAll('.table-scroll').forEach(function (el) {
      var overflows = el.scrollWidth > el.clientWidth + 1;
      if (overflows) {
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'region');
      } else {
        el.removeAttribute('tabindex');
        el.removeAttribute('role');
      }
    });
  }
  document.addEventListener('DOMContentLoaded', syncScrollRegions);
  window.addEventListener('resize', syncScrollRegions);
})();
