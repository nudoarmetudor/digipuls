-- CreateTable
CREATE TABLE `Territory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Territory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `schoolId` INTEGER NULL,
    `territoryId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `School` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `simeId` VARCHAR(191) NULL,
    `territoryId` INTEGER NULL,
    `address` VARCHAR(191) NULL,
    `enrolmentTotal` INTEGER NOT NULL DEFAULT 0,
    `studentsGrades7to12` INTEGER NOT NULL DEFAULT 0,
    `classroomsTotal` INTEGER NOT NULL DEFAULT 0,
    `enrolmentBand` VARCHAR(191) NOT NULL DEFAULT '0-250',
    `publicDisclosureOptIn` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `School_simeId_key`(`simeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Indicator` (
    `code` VARCHAR(191) NOT NULL,
    `domain` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL,

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorLevel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `indicatorCode` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `levelName` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `engagementBenchmark` TEXT NULL,
    `frequencyBenchmark` TEXT NULL,
    `evidenceBenchmark` TEXT NULL,

    UNIQUE INDEX `IndicatorLevel_indicatorCode_level_key`(`indicatorCode`, `level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssessmentCycle` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `schoolId` INTEGER NOT NULL,
    `cycleNumber` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `previousCycleId` INTEGER NULL,

    UNIQUE INDEX `AssessmentCycle_previousCycleId_key`(`previousCycleId`),
    UNIQUE INDEX `AssessmentCycle_schoolId_cycleNumber_key`(`schoolId`, `cycleNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DeviceInventory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleId` INTEGER NOT NULL,
    `classroomPCs` INTEGER NOT NULL DEFAULT 0,
    `interactivePanels` INTEGER NOT NULL DEFAULT 0,
    `itRoomPCs` INTEGER NOT NULL DEFAULT 0,
    `managementPCs` INTEGER NOT NULL DEFAULT 0,
    `methodicalCentrePCs` INTEGER NOT NULL DEFAULT 0,
    `libraryPCs` INTEGER NOT NULL DEFAULT 0,
    `printers` INTEGER NOT NULL DEFAULT 0,
    `multifunctionPrinters` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `DeviceInventory_cycleId_key`(`cycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NetworkChecklist` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleId` INTEGER NOT NULL,
    `wifiWholeSchool` BOOLEAN NOT NULL DEFAULT false,
    `subnetsSeparated` BOOLEAN NOT NULL DEFAULT false,
    `wifi80211n` BOOLEAN NOT NULL DEFAULT false,
    `wifi80211ac` BOOLEAN NOT NULL DEFAULT false,
    `firewallActive` BOOLEAN NOT NULL DEFAULT false,
    `contentFiltering` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `NetworkChecklist_cycleId_key`(`cycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IndicatorRating` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleId` INTEGER NOT NULL,
    `indicatorCode` VARCHAR(191) NOT NULL,
    `level` INTEGER NULL,
    `changeState` VARCHAR(191) NULL,
    `comment` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `IndicatorRating_cycleId_indicatorCode_key`(`cycleId`, `indicatorCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Evidence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ratingId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `source` VARCHAR(191) NULL,
    `filePath` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ValidationRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleId` INTEGER NOT NULL,
    `reviewerName` VARCHAR(191) NOT NULL,
    `reviewerType` VARCHAR(191) NOT NULL,
    `indicatorCode` VARCHAR(191) NULL,
    `verdict` VARCHAR(191) NOT NULL,
    `reliabilityNote` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DevelopmentPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleId` INTEGER NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `fundingSource` VARCHAR(191) NULL,
    `approvingAuthority` VARCHAR(191) NULL,
    `stakeholderConsultationNotes` TEXT NULL,

    UNIQUE INDEX `DevelopmentPlan_cycleId_key`(`cycleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanPriority` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `planId` INTEGER NOT NULL,
    `indicatorCode` VARCHAR(191) NOT NULL,
    `currentLevel` INTEGER NOT NULL,
    `targetLevel` INTEGER NOT NULL,
    `rationale` TEXT NOT NULL,
    `actions` TEXT NOT NULL,
    `responsible` VARCHAR(191) NULL,
    `timeline` VARCHAR(191) NULL,
    `outcomeStatus` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLogEntry` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `details` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_territoryId_fkey` FOREIGN KEY (`territoryId`) REFERENCES `Territory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `School` ADD CONSTRAINT `School_territoryId_fkey` FOREIGN KEY (`territoryId`) REFERENCES `Territory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicatorLevel` ADD CONSTRAINT `IndicatorLevel_indicatorCode_fkey` FOREIGN KEY (`indicatorCode`) REFERENCES `Indicator`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentCycle` ADD CONSTRAINT `AssessmentCycle_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentCycle` ADD CONSTRAINT `AssessmentCycle_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AssessmentCycle` ADD CONSTRAINT `AssessmentCycle_previousCycleId_fkey` FOREIGN KEY (`previousCycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeviceInventory` ADD CONSTRAINT `DeviceInventory_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NetworkChecklist` ADD CONSTRAINT `NetworkChecklist_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicatorRating` ADD CONSTRAINT `IndicatorRating_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IndicatorRating` ADD CONSTRAINT `IndicatorRating_indicatorCode_fkey` FOREIGN KEY (`indicatorCode`) REFERENCES `Indicator`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_ratingId_fkey` FOREIGN KEY (`ratingId`) REFERENCES `IndicatorRating`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DevelopmentPlan` ADD CONSTRAINT `DevelopmentPlan_cycleId_fkey` FOREIGN KEY (`cycleId`) REFERENCES `AssessmentCycle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanPriority` ADD CONSTRAINT `PlanPriority_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `DevelopmentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlanPriority` ADD CONSTRAINT `PlanPriority_indicatorCode_fkey` FOREIGN KEY (`indicatorCode`) REFERENCES `Indicator`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLogEntry` ADD CONSTRAINT `AuditLogEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

