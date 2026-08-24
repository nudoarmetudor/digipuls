const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toLevel, toNonNegativeInt, ValidationError } = require('../src/utils/validate');

test('toLevel: accepts 0 and 5 (inclusive bounds), rejects 6 and -1', () => {
  assert.equal(toLevel('0'), 0);
  assert.equal(toLevel('5'), 5);
  assert.throws(() => toLevel('6'), ValidationError);
  assert.throws(() => toLevel('-1'), ValidationError);
});

test('toLevel: rejects non-numeric and fractional input instead of silently coercing', () => {
  assert.throws(() => toLevel('abc'), ValidationError);
  assert.throws(() => toLevel('2.5'), ValidationError);
  assert.throws(() => toLevel(''), ValidationError);
});

test('toNonNegativeInt: rejects negative numbers instead of silently clamping to 0', () => {
  assert.equal(toNonNegativeInt('0'), 0);
  assert.equal(toNonNegativeInt('42'), 42);
  assert.throws(() => toNonNegativeInt('-5'), ValidationError);
  assert.throws(() => toNonNegativeInt('abc'), ValidationError);
});
