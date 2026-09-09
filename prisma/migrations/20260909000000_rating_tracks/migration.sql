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
-- Written by hand rather than generated. `prisma migrate diff` renders a
-- uniqueness change as DROP + CREATE around a table it has also just altered,
-- and the order it picks is not guaranteed to keep the old index valid while
-- the column is being added.

ALTER TABLE `IndicatorRating`
  ADD COLUMN `track` VARCHAR(191) NOT NULL DEFAULT 'AGREED';

-- The old constraint said "one rating per indicator per cycle", which is now
-- exactly the thing that must not be true.
DROP INDEX `IndicatorRating_cycleId_indicatorCode_key` ON `IndicatorRating`;

CREATE UNIQUE INDEX `IndicatorRating_cycleId_indicatorCode_track_key`
  ON `IndicatorRating`(`cycleId`, `indicatorCode`, `track`);
