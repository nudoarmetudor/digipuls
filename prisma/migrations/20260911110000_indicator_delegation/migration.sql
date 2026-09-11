-- Who in the school has taken on which parameters, for one cycle.
--
-- Nineteen parameters is more than one person can evidence properly, and a
-- school fields a team so the work can be split. This records the split.
--
-- It is not a permission: anyone on the school team may still rate any
-- parameter on their own side. A lock here would break the two tracks, which
-- depend on each side rating all nineteen independently.
CREATE TABLE `IndicatorAssignment` (
  `id`            INTEGER NOT NULL AUTO_INCREMENT,
  `cycleId`       INTEGER NOT NULL,
  `indicatorCode` VARCHAR(191) NOT NULL,
  `userId`        INTEGER NOT NULL,
  `assignedById`  INTEGER NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `IndicatorAssignment_cycleId_indicatorCode_userId_key` (`cycleId`, `indicatorCode`, `userId`),
  INDEX `IndicatorAssignment_cycleId_idx` (`cycleId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `IndicatorAssignment` ADD CONSTRAINT `IndicatorAssignment_cycleId_fkey`
  FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `IndicatorAssignment` ADD CONSTRAINT `IndicatorAssignment_indicatorCode_fkey`
  FOREIGN KEY (`indicatorCode`) REFERENCES `Indicator`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `IndicatorAssignment` ADD CONSTRAINT `IndicatorAssignment_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `IndicatorAssignment` ADD CONSTRAINT `IndicatorAssignment_assignedById_fkey`
  FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
