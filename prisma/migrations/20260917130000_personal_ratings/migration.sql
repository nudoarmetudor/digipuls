-- Each person's reading of a parameter, kept separately.
--
-- A side (administration or team) held one value per parameter, overwritten by
-- whoever saved last. Readings are now stored per person and the side's value
-- is derived from them. Existing side values are left as they are.
CREATE TABLE `PersonalRating` (
  `id`            INTEGER NOT NULL AUTO_INCREMENT,
  `cycleId`       INTEGER NOT NULL,
  `indicatorCode` VARCHAR(191) NOT NULL,
  `track`         VARCHAR(191) NOT NULL,
  `userId`        INTEGER NOT NULL,
  `level`         INTEGER NULL,
  `comment`       TEXT NULL,
  `createdAt`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`     DATETIME(3) NOT NULL,

  UNIQUE INDEX `PersonalRating_cycleId_indicatorCode_track_userId_key` (`cycleId`, `indicatorCode`, `track`, `userId`),
  INDEX `PersonalRating_cycleId_idx` (`cycleId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PersonalRating` ADD CONSTRAINT `PersonalRating_cycleId_fkey`
  FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PersonalRating` ADD CONSTRAINT `PersonalRating_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
