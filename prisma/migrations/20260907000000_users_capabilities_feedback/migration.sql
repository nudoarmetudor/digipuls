-- AlterTable
ALTER TABLE `User` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `UserCapability` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `capability` VARCHAR(191) NOT NULL,
    `granted` BOOLEAN NOT NULL,

    UNIQUE INDEX `UserCapability_userId_capability_key`(`userId`, `capability`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedbackTicket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `authorId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `severity` VARCHAR(191) NOT NULL DEFAULT 'NORMAL',
    `comment` TEXT NOT NULL,
    `route` VARCHAR(191) NOT NULL,
    `viewName` VARCHAR(191) NULL,
    `selector` TEXT NULL,
    `elementSummary` TEXT NULL,
    `elementText` TEXT NULL,
    `i18nKeys` TEXT NULL,
    `lang` VARCHAR(191) NULL,
    `displayPrefs` VARCHAR(191) NULL,
    `viewport` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `triagedById` INTEGER NULL,
    `developerNote` TEXT NULL,

    INDEX `FeedbackTicket_status_idx`(`status`),
    INDEX `FeedbackTicket_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserCapability` ADD CONSTRAINT `UserCapability_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedbackTicket` ADD CONSTRAINT `FeedbackTicket_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedbackTicket` ADD CONSTRAINT `FeedbackTicket_triagedById_fkey` FOREIGN KEY (`triagedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
