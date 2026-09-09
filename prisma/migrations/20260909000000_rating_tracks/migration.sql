-- Two-track assessment.
--
-- A school's administration and its team rate all nineteen parameters
-- independently, then reconcile; the agreed level is a third value, not a copy
-- of either. So one indicator now has up to three rows in a cycle, told apart
-- by `track`.
--
-- Existing rows become AGREED, which is what they already were: the official
-- record every dashboard, export and public page reads. That is why the column
-- defaults to AGREED rather than to a working track — anything created by code
-- that predates this change is, by definition, the agreed value.
--
-- ORDER MATTERS, and the first version of this file got it wrong. MySQL uses
-- the (cycleId, indicatorCode) unique index to satisfy the foreign key on
-- cycleId, so dropping it first fails with
--
--   1553  Cannot drop index 'IndicatorRating_cycleId_indicatorCode_key':
--         needed in a foreign key constraint
--
-- Creating the replacement first gives the constraint another index with
-- cycleId leading, after which the old one can go. The same trap waits for any
-- future uniqueness change on a table whose foreign key column leads the index.

ALTER TABLE `IndicatorRating`
  ADD COLUMN `track` VARCHAR(191) NOT NULL DEFAULT 'AGREED';

-- New first, so the foreign key on cycleId always has an index to use.
CREATE UNIQUE INDEX `IndicatorRating_cycleId_indicatorCode_track_key`
  ON `IndicatorRating`(`cycleId`, `indicatorCode`, `track`);

-- Then the old constraint, which said "one rating per indicator per cycle" —
-- exactly the thing that must now be false.
DROP INDEX `IndicatorRating_cycleId_indicatorCode_key` ON `IndicatorRating`;
