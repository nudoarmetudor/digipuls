const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const {
  CHAPTERS, LANGS, AUDIENCE, buildTour, allTargets,
} = require('../src/services/tour');

// The guided tutorial points at real controls on real pages. Two things can go
// quietly wrong with that, and neither shows up by clicking around in English:
// a step can name an anchor nobody ever put in a view, and a translation can be
// left as the English string. Both produce a tutorial that looks fine and
// teaches nothing, so both are checked here.

const VIEWS = path.join(__dirname, '..', 'src', 'views');

function everyViewSource() {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ejs')) out.push(fs.readFileSync(full, 'utf8'));
    });
  }(VIEWS));
  return out.join('\n');
}

test('every step points at an anchor that exists in a view', () => {
  const views = everyViewSource();
  const missing = allTargets().filter((selector) => {
    const name = selector.replace(/^\[data-tour="/, '').replace(/"\]$/, '');
    return !views.includes(`data-tour="${name}"`);
  });
  assert.deepStrictEqual(missing, [],
    'these steps point at nothing — add the data-tour attribute, or drop the step');
});

test('the anchors are the only contract, and they are unique enough to find', () => {
  // A selector this does not understand would be silently ignored by
  // querySelector at runtime, so the shape is checked rather than assumed.
  allTargets().forEach((selector) => {
    assert.match(selector, /^\[data-tour="[a-z0-9-]+"\]$/, selector);
  });
});

test('every step exists in all three languages', () => {
  CHAPTERS.forEach((chapter) => {
    LANGS.forEach((lang) => {
      assert.ok(chapter.title[lang], `${chapter.key}: title missing ${lang}`);
      assert.ok(chapter.intro[lang], `${chapter.key}: intro missing ${lang}`);
    });
    chapter.steps.forEach((step) => {
      LANGS.forEach((lang) => {
        assert.ok(step.title[lang], `${chapter.key}.${step.key}: title missing ${lang}`);
        assert.ok(step.body[lang], `${chapter.key}.${step.key}: body missing ${lang}`);
      });
    });
  });
});

test('nothing was left in English by mistake', () => {
  // A translation identical to the English one is almost always a placeholder
  // that never got filled in. Titles like "DigiPlan" are the honest exception,
  // so this only complains about sentences.
  const untranslated = [];
  CHAPTERS.forEach((chapter) => {
    chapter.steps.forEach((step) => {
      ['ro', 'ru'].forEach((lang) => {
        if (step.body[lang] === step.body.en && step.body.en.length > 30) {
          untranslated.push(`${chapter.key}.${step.key} (${lang})`);
        }
      });
    });
  });
  assert.deepStrictEqual(untranslated, []);
});

test('keys are unique, because they are how a step is addressed', () => {
  const seen = new Set();
  CHAPTERS.forEach((chapter) => {
    assert.ok(!seen.has(chapter.key), `duplicate chapter ${chapter.key}`);
    seen.add(chapter.key);
    const inChapter = new Set();
    chapter.steps.forEach((step) => {
      assert.ok(!inChapter.has(step.key), `duplicate step ${chapter.key}.${step.key}`);
      inChapter.add(step.key);
    });
  });
});

// --- who it is for ----------------------------------------------------------

const CAPS = {
  principal: ['view.school', 'school.manage', 'school.publish', 'school.accounts', 'feedback.submit'],
  mentor: ['view.school', 'feedback.submit'],
  metamentor: ['view.national', 'view.compliance', 'view.regional', 'feedback.submit'],
  ministry: ['view.national', 'view.compliance'],
};

function has(list) {
  const set = new Set(list);
  return (capability) => set.has(capability);
}

test('the tutorial is offered to the school and to nobody else', () => {
  assert.strictEqual(AUDIENCE, 'view.school');
  assert.strictEqual(buildTour('ro', has(CAPS.metamentor)).length, 0,
    'a metamentor reads finished results; the school workflow is not theirs');
  assert.strictEqual(buildTour('ro', has(CAPS.ministry)).length, 0);
  assert.ok(buildTour('ro', has(CAPS.mentor)).length > 0);
  assert.ok(buildTour('ro', has(CAPS.principal)).length > 0);
});

test('a mentor is not taught buttons they do not have', () => {
  const mentor = buildTour('en', has(CAPS.mentor));
  const keys = mentor.flatMap((c) => c.steps.map((s) => s.key));

  // Managing accounts, confirming and publishing are the principal's.
  assert.ok(!keys.some((k) => k.startsWith('accounts.')));
  assert.ok(!keys.includes('confirm.confirm'));
  assert.ok(!keys.includes('plan.publish'));
  assert.ok(!keys.includes('report.publish'));

  // What a mentor actually does is still there in full.
  assert.ok(keys.includes('assess.rate'));
  assert.ok(keys.includes('assess.evidence'));
  assert.ok(keys.includes('plan.initiatives'));
  assert.ok(keys.includes('report.actual'));
});

test('a chapter whose every step was filtered out does not appear', () => {
  const principal = buildTour('en', has(CAPS.principal));
  const mentor = buildTour('en', has(CAPS.mentor));
  assert.ok(principal.some((c) => c.key === 'accounts'));
  assert.ok(!mentor.some((c) => c.key === 'accounts'),
    'an empty chapter heading is worse than no heading');
  mentor.concat(principal).forEach((c) => assert.ok(c.steps.length > 0, c.key));
});

test('the workspace step only appears for someone who holds two posts', () => {
  const single = buildTour('en', (c) => CAPS.principal.includes(c));
  const multi = buildTour('en', (c) => CAPS.principal.includes(c) || c === 'ctx.multiWorkspace');
  const keyed = (tour) => tour.flatMap((c) => c.steps.map((s) => s.key));
  assert.ok(!keyed(single).includes('basics.workspace'));
  assert.ok(keyed(multi).includes('basics.workspace'));
});

// --- the client script ------------------------------------------------------

test('the script carries no words of its own', () => {
  // Every label comes from the server, already translated. An English string
  // literal in here would show up untranslated for two thirds of the pilot.
  const js = fs.readFileSync(
    path.join(__dirname, '..', 'public', 'js', 'tour.js'), 'utf8');
  const withoutComments = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['Next', 'Back', 'Close', 'Step ', 'Chapters'].forEach((word) => {
    assert.ok(!withoutComments.includes(`'${word}`) && !withoutComments.includes(`"${word}`),
      `"${word}" is hardcoded in tour.js — it belongs in services/tour.js`);
  });
  // The dimming must never intercept a click: the whole point is that the
  // reader can use the control being pointed at.
  assert.match(js, /pointer-events:none|pointer-events: none|tour-spot/);
});

test('the toggle and the panel are only rendered for the school', () => {
  const topbar = fs.readFileSync(path.join(VIEWS, 'partials', 'topbar.ejs'), 'utf8');
  const layout = fs.readFileSync(path.join(VIEWS, 'layout.ejs'), 'utf8');
  assert.match(topbar, /can\('view\.school'\)[\s\S]{0,120}tour-toggle/);
  assert.match(layout, /can\('view\.school'\)[\s\S]{0,120}partials\/tour/);
});

test('the payload is served in a way a strict policy allows', () => {
  const partial = fs.readFileSync(path.join(VIEWS, 'partials', 'tour.ejs'), 'utf8');
  assert.match(partial, /nonce="<%= cspNonce %>"/,
    'the inline JSON block needs the nonce or the policy drops it');
  assert.match(partial, /replace\(\/</,
    'the JSON must not be able to close its own script element');
});
