-- Equipment waiting to be written off.
--
-- Reported from the pilot: the quota check counted every device a school
-- listed, so a school owning twenty classroom PCs of which eight were scrap
-- was marked compliant on twenty. The check now measures what can actually be
-- put in front of a class.
--
-- Every column defaults to zero, which is what makes this safe to apply to a
-- live instance: for every cycle already confirmed, the amount subtracted is
-- nothing and the recorded verdict is unchanged. No recomputation, no cycle
-- that was compliant on Tuesday becoming non-compliant on Thursday without a
-- school touching it.
ALTER TABLE `DeviceInventory` ADD COLUMN `classroomPCsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `interactivePanelsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `itRoomPCsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `managementPCsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `methodicalCentrePCsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `libraryPCsObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `printersObsolete` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `DeviceInventory` ADD COLUMN `multifunctionPrintersObsolete` INTEGER NOT NULL DEFAULT 0;
