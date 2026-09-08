// Small interactions that used to live in inline onclick/onsubmit attributes.
//
// They moved here because the Content-Security-Policy blocks inline event
// handlers, and a nonce does not help: a nonce authorises a <script> element,
// not an onclick attribute. Left in the markup they would have failed
// silently, which for the two confirm() dialogs would have meant a delete
// button that deletes with no confirmation at all — a security header quietly
// removing a safety prompt.
//
// Everything here is progressive enhancement: with JavaScript off, the radio
// buttons still record a rating, the forms still submit, and the print button
// is simply hidden by print-button.js's absence being irrelevant — the page
// prints from the browser's own menu.

(function () {
  'use strict';

  // --- Confirmations before destructive submits ----------------------------
  // <form data-confirm="Are you sure?"> — the message is put there by the
  // server, so it is already in the viewer's language.
  document.addEventListener('submit', function (event) {
    var form = event.target.closest ? event.target.closest('form[data-confirm]') : null;
    if (!form) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(form.getAttribute('data-confirm'))) {
      event.preventDefault();
    }
  });

  // --- Print ---------------------------------------------------------------
  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('[data-print]') : null;
    if (button) window.print();
  });

  // --- Maturity level picker ----------------------------------------------
  // Highlights the chosen option and shows that level's description. The
  // radio itself is what actually carries the answer; this only makes the
  // choice visible.
  document.addEventListener('change', function (event) {
    var radio = event.target;
    if (!radio.matches || !radio.matches('.level-picker input[type="radio"]')) return;

    var form = radio.closest('form');
    if (!form) return;

    form.querySelectorAll('.level-option').forEach(function (el) {
      el.classList.remove('selected');
    });
    var label = radio.closest('label');
    if (label) label.classList.add('selected');

    var target = form.querySelector('.level-desc-target');
    // textContent, not innerText or innerHTML: the description is plain text
    // and must stay that way.
    if (target) target.textContent = radio.getAttribute('data-desc') || '';
  });
})();
