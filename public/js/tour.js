/* The guided tutorial.
 *
 * A side panel listing the chapters and steps, and — for any step whose
 * control is on the page you are actually looking at — a spotlight around that
 * control with the explanation beside it.
 *
 * Three decisions worth knowing about:
 *
 *   The dimming never blocks the page. The overlay is pointer-events:none and
 *   the "hole" is drawn with a very large box-shadow rather than by covering
 *   the screen, so the reader can click the thing being pointed at while it is
 *   still highlighted. A tutorial you have to close in order to follow is not
 *   a tutorial.
 *
 *   A step whose control is not on this page still shows. It says where it
 *   happens and, where there is a sensible destination, offers to go there.
 *   Silently skipping such steps would make the chapter list change shape as
 *   you walk around, which is exactly what someone who is lost does not need.
 *
 *   Position and progress live in localStorage, so the guide survives every
 *   page load and picks up where it was. It carries no text of its own: every
 *   word comes from the server (see src/services/tour.js), already translated
 *   and already filtered by what this person may do.
 */
(function () {
  'use strict';

  var node = document.getElementById('tour-data');
  if (!node) return;

  var data;
  try {
    data = JSON.parse(node.textContent);
  } catch (e) {
    return; // Nothing sensible to do; the rest of the page is unaffected.
  }
  if (!data.chapters || !data.chapters.length) return;

  var UI = data.ui;
  var PREFIX = data.prefix || '';
  var STORE = 'dp_tour';

  // Flat list, because "next" and "back" cross chapter boundaries.
  var steps = [];
  data.chapters.forEach(function (chapter, ci) {
    chapter.steps.forEach(function (step, si) {
      steps.push({
        key: step.key,
        title: step.title,
        body: step.body,
        target: step.target,
        goto: step.goto,
        chapter: chapter,
        chapterIndex: ci,
        indexInChapter: si,
        index: steps.length,
      });
    });
  });

  // --- what the reader has chosen -------------------------------------------

  function readState() {
    try {
      var raw = window.localStorage.getItem(STORE);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* private window, or storage disabled */ }
    return {};
  }

  function writeState() {
    try {
      window.localStorage.setItem(STORE, JSON.stringify({
        open: state.open, step: steps[state.index].key, spot: state.spot,
      }));
    } catch (e) { /* nothing to do; the guide still works for this page */ }
  }

  var stored = readState();
  var state = {
    open: stored.open === true,
    spot: stored.spot !== false,
    index: 0,
  };
  if (stored.step) {
    steps.some(function (s, i) {
      if (s.key === stored.step) { state.index = i; return true; }
      return false;
    });
  }

  var reduced = document.documentElement.getAttribute('data-motion') === 'reduced'
    || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // --- the furniture --------------------------------------------------------

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  var panel = el('aside', 'tour-panel');
  panel.id = 'tour-panel';
  panel.setAttribute('aria-label', UI.title);
  panel.hidden = true;

  var head = el('div', 'tour-head');
  var headText = el('div');
  headText.appendChild(el('h2', null, UI.title));
  headText.appendChild(el('p', 'tour-sub', UI.subtitle));
  var closeBtn = el('button', 'tour-close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', UI.close);
  closeBtn.innerHTML = '<span aria-hidden="true">&times;</span>';
  head.appendChild(headText);
  head.appendChild(closeBtn);

  var current = el('div', 'tour-current');
  var currentChapter = el('p', 'tour-current-chapter');
  var currentTitle = el('h3');
  var currentBody = el('p', 'tour-current-body');
  var currentWhere = el('p', 'tour-where');
  var currentGo = el('a', 'btn btn-sm btn-secondary tour-go', UI.go);
  var currentCount = el('p', 'tour-count');
  // Step changes are announced, because a reader using a screen reader has no
  // spotlight to look at.
  current.setAttribute('role', 'status');
  current.setAttribute('aria-live', 'polite');
  current.appendChild(currentChapter);
  current.appendChild(currentTitle);
  current.appendChild(currentBody);
  current.appendChild(currentWhere);
  current.appendChild(currentGo);
  current.appendChild(currentCount);

  var nav = el('div', 'tour-nav');
  var backBtn = el('button', 'btn btn-sm btn-secondary', UI.back);
  backBtn.type = 'button';
  var nextBtn = el('button', 'btn btn-sm', UI.next);
  nextBtn.type = 'button';
  nav.appendChild(backBtn);
  nav.appendChild(nextBtn);

  var spotWrap = el('label', 'tour-spot-toggle');
  var spotBox = document.createElement('input');
  spotBox.type = 'checkbox';
  spotBox.checked = state.spot;
  spotWrap.appendChild(spotBox);
  spotWrap.appendChild(el('span', null, UI.highlight));

  var listWrap = el('nav', 'tour-list');
  listWrap.setAttribute('aria-label', UI.chapters);

  var restart = el('button', 'tour-restart', UI.restart);
  restart.type = 'button';

  panel.appendChild(head);
  panel.appendChild(current);
  panel.appendChild(nav);
  panel.appendChild(spotWrap);
  panel.appendChild(listWrap);
  panel.appendChild(restart);
  document.body.appendChild(panel);

  // The spotlight: a ring whose enormous shadow dims everything else. Never
  // interactive — the reader must be able to click what it is pointing at.
  var spot = el('div', 'tour-spot');
  spot.hidden = true;
  spot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(spot);

  // The bubble beside the highlighted control. Same words as the panel, put
  // where the reader is already looking.
  var bubble = el('div', 'tour-bubble');
  bubble.hidden = true;
  bubble.setAttribute('aria-hidden', 'true');
  var bubbleTitle = el('h3');
  var bubbleBody = el('p');
  var bubbleNav = el('div', 'tour-bubble-nav');
  var bubbleCount = el('span', 'tour-count');
  var bubbleBack = el('button', 'btn btn-sm btn-secondary', UI.back);
  bubbleBack.type = 'button';
  var bubbleNext = el('button', 'btn btn-sm', UI.next);
  bubbleNext.type = 'button';
  bubbleNav.appendChild(bubbleCount);
  bubbleNav.appendChild(bubbleBack);
  bubbleNav.appendChild(bubbleNext);
  bubble.appendChild(bubbleTitle);
  bubble.appendChild(bubbleBody);
  bubble.appendChild(bubbleNav);
  document.body.appendChild(bubble);

  // --- the chapter list -----------------------------------------------------

  var stepButtons = [];

  data.chapters.forEach(function (chapter) {
    var group = el('details', 'tour-chapter');
    var summary = el('summary', null, chapter.title);
    group.appendChild(summary);
    if (chapter.intro) group.appendChild(el('p', 'tour-chapter-intro', chapter.intro));
    var ol = el('ol');
    chapter.steps.forEach(function (step) {
      var li = el('li');
      var btn = el('button', 'tour-step-btn', step.title);
      btn.type = 'button';
      btn.dataset.stepKey = step.key;
      btn.addEventListener('click', function () {
        steps.some(function (s, i) {
          if (s.key === step.key) { go(i); return true; }
          return false;
        });
      });
      li.appendChild(btn);
      ol.appendChild(li);
      stepButtons.push({ key: step.key, btn: btn, group: group });
    });
    group.appendChild(ol);
    listWrap.appendChild(group);
  });

  // --- rendering ------------------------------------------------------------

  function targetOf(step) {
    if (!step.target) return null;
    try {
      return document.querySelector(step.target);
    } catch (e) {
      return null;
    }
  }

  function visible(node2) {
    if (!node2) return false;
    var r = node2.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  function count(i) {
    return UI.stepOf.replace('{n}', String(i + 1)).replace('{total}', String(steps.length));
  }

  var activeTarget = null;

  function render() {
    var step = steps[state.index];
    var found = targetOf(step);
    activeTarget = visible(found) ? found : null;

    currentChapter.textContent = step.chapter.title;
    currentTitle.textContent = step.title;
    currentBody.textContent = step.body;
    currentCount.textContent = count(state.index);
    bubbleTitle.textContent = step.title;
    bubbleBody.textContent = step.body;
    bubbleCount.textContent = count(state.index);

    if (activeTarget) {
      currentWhere.textContent = UI.here;
      currentWhere.className = 'tour-where tour-where-here';
    } else {
      currentWhere.textContent = step.goto ? UI.notHere : UI.notHereYet;
      currentWhere.className = 'tour-where';
    }
    if (step.goto) {
      currentGo.href = PREFIX + step.goto;
      currentGo.hidden = !!activeTarget;
    } else {
      currentGo.hidden = true;
    }

    backBtn.disabled = state.index === 0;
    bubbleBack.disabled = state.index === 0;
    var last = state.index === steps.length - 1;
    nextBtn.textContent = last ? UI.finish : UI.next;
    bubbleNext.textContent = last ? UI.finish : UI.next;

    stepButtons.forEach(function (entry) {
      var isCurrent = entry.key === step.key;
      entry.btn.classList.toggle('is-current', isCurrent);
      if (isCurrent) {
        entry.btn.setAttribute('aria-current', 'step');
        entry.group.open = true;
      } else {
        entry.btn.removeAttribute('aria-current');
      }
    });

    placeSpot();
  }

  function placeSpot() {
    var show = state.open && state.spot && activeTarget;
    spot.hidden = !show;
    bubble.hidden = !show;
    if (!show) return;

    var r = activeTarget.getBoundingClientRect();
    var pad = 6;
    spot.style.top = (r.top - pad) + 'px';
    spot.style.left = (r.left - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';

    // Below the control when there is room, otherwise above it; then clamped
    // so it never hangs off the side or slides under the panel.
    var bw = Math.min(340, window.innerWidth - 24);
    bubble.style.width = bw + 'px';
    var bh = bubble.offsetHeight || 160;
    var top = r.bottom + 12;
    if (top + bh > window.innerHeight - 8) {
      top = Math.max(8, r.top - bh - 12);
    }
    var panelWidth = panel.getBoundingClientRect().width;
    var rightLimit = window.innerWidth - bw - 12
      - (window.innerWidth > 900 && state.open ? panelWidth : 0);
    var left = Math.max(12, Math.min(r.left, Math.max(12, rightLimit)));
    bubble.style.top = top + 'px';
    bubble.style.left = left + 'px';
  }

  function go(i) {
    state.index = Math.max(0, Math.min(steps.length - 1, i));
    writeState();
    render();
    if (activeTarget) {
      activeTarget.scrollIntoView({
        block: 'center', behavior: reduced ? 'auto' : 'smooth',
      });
      // The rectangle moves while the page scrolls, so follow it for a moment
      // rather than pinning the spotlight to where the control used to be.
      var until = Date.now() + (reduced ? 60 : 700);
      (function follow() {
        placeSpot();
        if (Date.now() < until) window.requestAnimationFrame(follow);
      })();
    }
  }

  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    document.documentElement.classList.toggle('tour-open', open);
    toggles.forEach(function (b) {
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      b.classList.toggle('is-on', open);
    });
    writeState();
    render();
    if (open) closeBtn.focus();
  }

  // --- wiring ---------------------------------------------------------------

  var toggles = [].slice.call(document.querySelectorAll('[data-tour-toggle]'));
  toggles.forEach(function (b) {
    b.hidden = false;
    b.addEventListener('click', function () { setOpen(!state.open); });
  });

  closeBtn.addEventListener('click', function () {
    setOpen(false);
    if (toggles[0]) toggles[0].focus();
  });
  backBtn.addEventListener('click', function () { go(state.index - 1); });
  bubbleBack.addEventListener('click', function () { go(state.index - 1); });

  function forward() {
    if (state.index === steps.length - 1) {
      setOpen(false);
      return;
    }
    go(state.index + 1);
  }
  nextBtn.addEventListener('click', forward);
  bubbleNext.addEventListener('click', forward);

  restart.addEventListener('click', function () { go(0); });

  spotBox.addEventListener('change', function () {
    state.spot = spotBox.checked;
    writeState();
    placeSpot();
  });

  var ticking = false;
  function onMove() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      placeSpot();
    });
  }
  window.addEventListener('scroll', onMove, { passive: true });
  window.addEventListener('resize', onMove);

  document.addEventListener('keydown', function (e) {
    if (!state.open) return;
    if (e.key === 'Escape') {
      setOpen(false);
      if (toggles[0]) toggles[0].focus();
      return;
    }
    // Arrows only while the guide itself has focus, so they still scroll the
    // page and move between radio buttons everywhere else.
    if (!panel.contains(document.activeElement)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { forward(); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { go(state.index - 1); e.preventDefault(); }
  });

  setOpen(state.open);
}());
