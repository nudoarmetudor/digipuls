-- A KPI's year-two result, kept apart from its year-one result.
--
-- Found by the end-to-end check-up: interim and final reports shared one
-- result field, so recording what a measure reached by the end of year two
-- overwrote what it had reached by the end of year one. A school that had not
-- published its interim report lost year one entirely.
--
-- Additive and nullable. Every existing value in `actual` was entered for the
-- interim report and stays where it is.
ALTER TABLE `PlanKpi` ADD COLUMN `finalActual` VARCHAR(191) NULL;
