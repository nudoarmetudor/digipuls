-- CreateTable
CREATE TABLE `Assignment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `schoolId` INTEGER NULL,
    `territoryId` INTEGER NULL,
    `label` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Assignment_userId_idx`(`userId`),
    UNIQUE INDEX `Assignment_userId_role_schoolId_territoryId_key`(`userId`, `role`, `schoolId`, `territoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssignmentCapability` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignmentId` INTEGER NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `granted` BOOLEAN NOT NULL,

    UNIQUE INDEX `AssignmentCapability_assignmentId_capability_key`(`assignmentId`, `capability`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Assignment` ADD CONSTRAINT `Assignment_territoryId_fkey` FOREIGN KEY (`territoryId`) REFERENCES `Territory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssignmentCapability` ADD CONSTRAINT `AssignmentCapability_assignmentId_fkey` FOREIGN KEY (`assignmentId`) REFERENCES `Assignment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: every existing account becomes one assignment holding exactly the
-- role and institution it already had, so nobody's access changes on deploy.
--
-- This is the "expand" half of expand/contract: User.role/schoolId/
-- territoryId stay in place and stop being read. They are dropped in a later
-- migration, once this model has run in production — dropping them in the
-- same step as the copy would leave no way back if the copy were wrong.
-- ---------------------------------------------------------------------------
INSERT INTO `Assignment` (`userId`, `role`, `schoolId`, `territoryId`, `isActive`, `createdAt`)
SELECT `id`, `role`, `schoolId`, `territoryId`, `isActive`, `createdAt` FROM `User`;

-- Per-user capability overrides become per-assignment overrides on that same
-- first assignment. UserCapability is left in place for the same reason.
INSERT INTO `AssignmentCapability` (`assignmentId`, `capability`, `granted`)
SELECT `a`.`id`, `uc`.`capability`, `uc`.`granted`
FROM `UserCapability` `uc`
JOIN `Assignment` `a` ON `a`.`userId` = `uc`.`userId`;
