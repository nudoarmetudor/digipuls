// Pragmatic server-side input validation for the highest-risk write paths.
// Not a full schema-validation layer (see ROADMAP.md P1) — just guards
// against bad input silently coercing into a wrong-but-valid-looking value
// (e.g. Number('abc') || 0 saving a real "0" for garbage input).

class ValidationError extends Error {}

// Number('') is 0 and Number('  ') is 0 in JS — an empty/missing field must
// not silently become a valid "0", so blank input is rejected before the
// numeric conversion rather than after it.
function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function toLevel(value) {
  const n = Number(value);
  if (isBlank(value) || !Number.isInteger(n) || n < 0 || n > 5) {
    throw new ValidationError(`Level must be a whole number from 0 to 5 (got "${value}").`);
  }
  return n;
}

function toNonNegativeInt(value, label) {
  const n = Number(value);
  if (isBlank(value) || !Number.isInteger(n) || n < 0) {
    throw new ValidationError(`${label || 'Value'} must be a whole number ≥ 0 (got "${value}").`);
  }
  return n;
}

module.exports = { ValidationError, toLevel, toNonNegativeInt };
