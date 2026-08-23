const en = require('./indicators');
const ro = require('./indicators.ro');

function getIndicatorData(lang) {
  return lang === 'ro' ? ro : en;
}

module.exports = { getIndicatorData };
