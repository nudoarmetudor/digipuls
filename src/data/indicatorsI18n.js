// Picks the language variant of the assessment instrument. All three files
// are structurally identical — same codes, same order, same six levels — so
// callers can swap between them freely; tests/i18n.test.js enforces that.
const en = require('./indicators');
const ro = require('./indicators.ro');
const ru = require('./indicators.ru');

const BY_LANG = { en, ro, ru };

function getIndicatorData(lang) {
  return BY_LANG[lang] || en;
}

module.exports = { getIndicatorData, BY_LANG };
