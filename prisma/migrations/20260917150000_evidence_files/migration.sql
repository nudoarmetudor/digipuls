-- The file attached to a piece of evidence: its original name, type and size.
-- The stored name goes in the existing, until now unused, filePath column.
ALTER TABLE `Evidence` ADD COLUMN `fileName` VARCHAR(191) NULL;
ALTER TABLE `Evidence` ADD COLUMN `fileMime` VARCHAR(191) NULL;
ALTER TABLE `Evidence` ADD COLUMN `fileSize` INTEGER NULL;
