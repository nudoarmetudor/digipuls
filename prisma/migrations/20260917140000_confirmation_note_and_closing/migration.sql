-- Confirming without both sides' readings is recorded with a reason, and a
-- cycle can be marked closed. Both additive and nullable; closing locks nothing.
ALTER TABLE `AssessmentCycle` ADD COLUMN `confirmedWithoutReadings` VARCHAR(191) NULL;
ALTER TABLE `AssessmentCycle` ADD COLUMN `confirmationNote` TEXT NULL;
ALTER TABLE `AssessmentCycle` ADD COLUMN `closedAt` DATETIME(3) NULL;
ALTER TABLE `AssessmentCycle` ADD COLUMN `closedById` INTEGER NULL;
ALTER TABLE `AssessmentCycle` ADD COLUMN `closingNote` TEXT NULL;
ALTER TABLE `AssessmentCycle` ADD CONSTRAINT `AssessmentCycle_closedById_fkey`
  FOREIGN KEY (`closedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
