// The kinds of evidence a school can attach to a level.
//
// One list, read by the form and by the route that stores what the form sends,
// so the server can refuse a type the form never offered.
const EVIDENCE_TYPES = [
  'document',
  'observation_log',
  'survey',
  'usage_data',
  'it_audit',
  'photo',
  'minutes',
  'certification',
  'external_validation',
];

module.exports = { EVIDENCE_TYPES };
