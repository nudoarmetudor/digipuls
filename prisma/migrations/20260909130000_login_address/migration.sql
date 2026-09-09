-- Where a sign-in came from.
--
-- Nullable and unpopulated for everything already in the log: the addresses
-- of past sign-ins were never captured and cannot be invented. Rows written
-- before this migration simply have none, which is the truthful state.
ALTER TABLE `AuditLogEntry` ADD COLUMN `ipAddress` VARCHAR(45) NULL;
