-- Every published version of an interim or final report.
--
-- Republishing a report replaced its snapshot, so the version a school had
-- already sent out was lost. Each publication is now kept.
CREATE TABLE `PlanReportVersion` (
  `id`            INTEGER NOT NULL AUTO_INCREMENT,
  `reportId`      INTEGER NOT NULL,
  `snapshot`      JSON NOT NULL,
  `publishedAt`   DATETIME(3) NOT NULL,
  `publishedById` INTEGER NULL,

  INDEX `PlanReportVersion_reportId_idx` (`reportId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PlanReportVersion` ADD CONSTRAINT `PlanReportVersion_reportId_fkey`
  FOREIGN KEY (`reportId`) REFERENCES `PlanReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `PlanReportVersion` ADD CONSTRAINT `PlanReportVersion_publishedById_fkey`
  FOREIGN KEY (`publishedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- The versions already out there: each published report's current snapshot is
-- its first recorded version. Earlier ones were overwritten and cannot be
-- recovered.
INSERT INTO `PlanReportVersion` (`reportId`, `snapshot`, `publishedAt`, `publishedById`)
  SELECT `id`, `snapshot`, `publishedAt`, `publishedById`
  FROM `PlanReport`
  WHERE `publishedAt` IS NOT NULL AND `snapshot` IS NOT NULL;
