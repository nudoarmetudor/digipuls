/* DigiPuls — click-to-report feedback overlay.
 *
 * For the pilot: a meta-mentor turns the overlay on, clicks the thing that is
 * wrong, writes what is wrong with it, and submits. The point is that the
 * *location* is captured automatically — which template rendered the page, a
 * CSS path to the element, and (resolved server-side) the translation keys
 * whose text matches it. Those three lines are what turn "the button on the
 * infrastructure page is confusing" into something findable in the source.
 *
 * Progressive enhancement: the control in the top bar is a plain link to the
 * manual form at /feedback/new. This script upgrades it into a toggle. With
 * JavaScript off, the link still works and reports can still be filed — they
 * just carry less context.
 *
 * Nothing here reads page data beyond what is already on screen: the element's
 * own tag, classes, and visible text. No form values, and no keystrokes.
 */
(function () {
  'use strict';

  var toggle = document.querySelector('[data-feedback-toggle]');
  if (!toggle) return;

  var T;
  try {
    T = JSON.parse(toggle.getAttribute('data-i18n') || '{}');
  } catch (e) {
    return; // Without labels the overlay would be a mystery box — stay a link.
  }

  var endpoint = toggle.getAttribute('data-endpoint');
  var label = toggle.querySelector('[data-feedback-label]');
  var active = false;
  var target = null;
  var box = null;
  var hint = null;
  var panel = null;
  var lastFocus = null;

  // --- element description ------------------------------------------------

  // A CSS path that is specific enough to find the element again and short
  // enough to read. Stops early at an id, since that is already unique.
  function selectorFor(el) {
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
      if (node.id) {
        parts.unshift('#' + node.id);
        break;
      }
      var seg = node.tagName.toLowerCase();
      var cls = (typeof node.className === 'string' ? node.className : '')
        .split(/\s+/)
        .filter(function (c) { return c && c.indexOf('dp-fb') !== 0; })
        .slice(0, 2);
      if (cls.length) seg += '.' + cls.join('.');
      var parent = node.parentElement;
      if (parent) {
        var sameTag = Array.prototype.filter.call(parent.children, function (c) {
          return c.tagName === node.tagName;
        });
        if (sameTag.length > 1) seg += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
      }
      parts.unshift(seg);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function summarize(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var cls = (typeof el.className === 'string' ? el.className : '').trim();
    if (cls) s += '.' + cls.split(/\s+/).slice(0, 4).join('.');
    // Attributes that say what the element is *for* are worth more to a
    // developer than another class name.
    ['name', 'href', 'type', 'aria-label', 'data-dp'].forEach(function (attr) {
      var v = el.getAttribute && el.getAttribute(attr);
      if (v) s += ' [' + attr + '="' + String(v).slice(0, 60) + '"]';
    });
    return s;
  }

  function textOf(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }

  function isOurs(el) {
    return !!(el && el.closest && el.closest('[data-feedback-toggle], .dp-fb-panel, .dp-fb-box, .dp-fb-hint'));
  }

  // --- highlight ----------------------------------------------------------

  function ensureChrome() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'dp-fb-box';
      box.setAttribute('aria-hidden', 'true');
      document.body.appendChild(box);
    }
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'dp-fb-hint';
      hint.setAttribute('role', 'status');
      hint.textContent = T.hint || '';
      document.body.appendChild(hint);
    }
  }

  function moveBoxTo(el) {
    if (!el || !box) return;
    var r = el.getBoundingClientRect();
    box.style.transform = 'translate(' + Math.round(r.left + window.scrollX) + 'px,' +
      Math.round(r.top + window.scrollY) + 'px)';
    box.style.width = Math.round(r.width) + 'px';
    box.style.height = Math.round(r.height) + 'px';
    box.hidden = false;
  }

  function onPointerMove(ev) {
    if (!active || panel) return;
    var el = ev.target;
    if (isOurs(el)) { box.hidden = true; target = null; return; }
    target = el;
    moveBoxTo(el);
  }

  // Keyboard route: whatever has focus is the target, so the overlay is
  // usable without a mouse.
  function onFocusIn(ev) {
    if (!active || panel) return;
    if (isOurs(ev.target)) return;
    target = ev.target;
    moveBoxTo(ev.target);
  }

  function onCapture(ev) {
    if (!active || panel) return;
    if (isOurs(ev.target)) return;
    // The whole point is to stop the click doing what it normally does.
    ev.preventDefault();
    ev.stopPropagation();
    openPanel(ev.target);
  }

  function onKeydown(ev) {
    if (!active) return;
    if (ev.key === 'Escape') {
      if (panel) closePanel();
      else setActive(false);
      return;
    }
    if (!panel && (ev.key === 'Enter' || ev.key === ' ') && target && !isOurs(ev.target)) {
      ev.preventDefault();
      ev.stopPropagation();
      openPanel(target);
    }
  }

  // --- the report panel ---------------------------------------------------

  function field(labelText, valueText) {
    if (!valueText) return null;
    var row = document.createElement('div');
    row.className = 'dp-fb-row';
    var dt = document.createElement('span');
    dt.className = 'dp-fb-key';
    dt.textContent = labelText;
    var dd = document.createElement('code');
    dd.className = 'dp-fb-val';
    dd.textContent = valueText;
    row.append(dt, dd);
    return row;
  }

  function openPanel(el) {
    lastFocus = document.activeElement;
    var captured = {
      route: toggle.getAttribute('data-route') || location.pathname,
      viewName: toggle.getAttribute('data-view') || null,
      selector: selectorFor(el),
      elementSummary: summarize(el),
      elementText: textOf(el),
      lang: toggle.getAttribute('data-lang') || document.documentElement.lang,
      displayPrefs: toggle.getAttribute('data-prefs') || '',
      viewport: window.innerWidth + 'x' + window.innerHeight,
      userAgent: navigator.userAgent
    };

    panel = document.createElement('div');
    panel.className = 'dp-fb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'dp-fb-title');

    var h = document.createElement('h2');
    h.id = 'dp-fb-title';
    h.textContent = T.title;
    panel.appendChild(h);

    var detected = document.createElement('div');
    detected.className = 'dp-fb-detected';
    var dh = document.createElement('p');
    dh.className = 'dp-fb-detected-head';
    dh.textContent = T.detected;
    detected.appendChild(dh);
    [
      field(T.template, captured.viewName ? 'src/views/' + captured.viewName + '.ejs' : null),
      field(T.element, captured.elementSummary),
      field('', captured.selector)
    ].forEach(function (row) { if (row) detected.appendChild(row); });
    panel.appendChild(detected);

    var form = document.createElement('form');
    form.noValidate = true;

    var sevLabel = document.createElement('label');
    sevLabel.setAttribute('for', 'dp-fb-sev');
    sevLabel.textContent = T.severity;
    var sev = document.createElement('select');
    sev.id = 'dp-fb-sev';
    sev.name = 'severity';
    ['BLOCKER', 'MAJOR', 'NORMAL', 'MINOR', 'IDEA'].forEach(function (key) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = (T.severities && T.severities[key]) || key;
      if (key === 'NORMAL') o.selected = true;
      sev.appendChild(o);
    });

    var cLabel = document.createElement('label');
    cLabel.setAttribute('for', 'dp-fb-comment');
    cLabel.textContent = T.comment;
    var comment = document.createElement('textarea');
    comment.id = 'dp-fb-comment';
    comment.name = 'comment';
    comment.rows = 5;
    comment.required = true;
    comment.placeholder = T.commentHint || '';

    var status = document.createElement('p');
    status.className = 'dp-fb-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var actions = document.createElement('div');
    actions.className = 'dp-fb-actions';
    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-sm';
    submit.textContent = T.submit;
    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-sm btn-secondary';
    cancel.textContent = T.cancel;
    cancel.addEventListener('click', closePanel);
    actions.append(submit, cancel);

    form.append(sevLabel, sev, cLabel, comment, actions, status);
    panel.appendChild(form);
    document.body.appendChild(panel);
    comment.focus();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!comment.value.trim()) {
        status.className = 'dp-fb-status is-error';
        status.textContent = T.required;
        comment.focus();
        return;
      }
      submit.disabled = true;
      status.className = 'dp-fb-status';
      status.textContent = T.sending;

      var payload = {};
      Object.keys(captured).forEach(function (k) { payload[k] = captured[k]; });
      payload.comment = comment.value.trim();
      payload.severity = sev.value;

      // Posted as JSON, so there is no hidden form field to carry the CSRF
      // token; it goes in a header instead, read from the meta tag head.ejs
      // writes.
      var meta = document.querySelector('meta[name="csrf-token"]');
      var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (meta) headers['X-CSRF-Token'] = meta.getAttribute('content');

      fetch(endpoint, {
        method: 'POST',
        headers: headers,
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
        .then(function (r) {
          if (!r.ok || !r.body.ok) throw new Error(r.body && r.body.error);
          form.innerHTML = '';
          var done = document.createElement('p');
          done.className = 'dp-fb-status is-ok';
          done.textContent = (T.sent || 'Sent') + ' #' + r.body.id;
          var link = document.createElement('a');
          link.href = toggle.getAttribute('data-mine-url') || '/feedback';
          link.className = 'btn btn-sm btn-secondary';
          link.textContent = T.mine;
          var close = document.createElement('button');
          close.type = 'button';
          close.className = 'btn btn-sm';
          close.textContent = T.cancel;
          close.addEventListener('click', closePanel);
          var row = document.createElement('div');
          row.className = 'dp-fb-actions';
          row.append(link, close);
          form.append(done, row);
          close.focus();
        })
        .catch(function () {
          submit.disabled = false;
          status.className = 'dp-fb-status is-error';
          status.textContent = T.failed;
        });
    });

    panel.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); closePanel(); }
    });
  }

  function closePanel() {
    if (!panel) return;
    panel.remove();
    panel = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // --- activation ---------------------------------------------------------

  function setActive(next) {
    active = next;
    ensureChrome();
    document.documentElement.classList.toggle('dp-fb-active', active);
    toggle.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (label) label.textContent = active ? T.stop : T.start;
    hint.hidden = !active;
    box.hidden = true;
    target = null;
    if (!active) closePanel();
  }

  toggle.addEventListener('click', function (ev) {
    ev.preventDefault();
    setActive(!active);
  });

  document.addEventListener('mousemove', onPointerMove, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('click', onCapture, true);
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('scroll', function () { if (active && target && !panel) moveBoxTo(target); }, true);
  window.addEventListener('resize', function () { if (active && target && !panel) moveBoxTo(target); });
})();
