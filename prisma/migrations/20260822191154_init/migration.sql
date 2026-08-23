-- CreateTable
CREATE TABLE "Territory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "schoolId" INTEGER,
    "territoryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "simeId" TEXT,
    "territoryId" INTEGER,
    "address" TEXT,
    "enrolmentTotal" INTEGER NOT NULL DEFAULT 0,
    "studentsGrades7to12" INTEGER NOT NULL DEFAULT 0,
    "classroomsTotal" INTEGER NOT NULL DEFAULT 0,
    "enrolmentBand" TEXT NOT NULL DEFAULT '0-250',
    "publicDisclosureOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "School_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Indicator" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "IndicatorLevel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "indicatorCode" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "levelName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "engagementBenchmark" TEXT,
    "frequencyBenchmark" TEXT,
    "evidenceBenchmark" TEXT,
    CONSTRAINT "IndicatorLevel_indicatorCode_fkey" FOREIGN KEY ("indicatorCode") REFERENCES "Indicator" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentCycle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "previousCycleId" INTEGER,
    CONSTRAINT "AssessmentCycle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentCycle_previousCycleId_fkey" FOREIGN KEY ("previousCycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceInventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "classroomPCs" INTEGER NOT NULL DEFAULT 0,
    "interactivePanels" INTEGER NOT NULL DEFAULT 0,
    "itRoomPCs" INTEGER NOT NULL DEFAULT 0,
    "managementPCs" INTEGER NOT NULL DEFAULT 0,
    "methodicalCentrePCs" INTEGER NOT NULL DEFAULT 0,
    "libraryPCs" INTEGER NOT NULL DEFAULT 0,
    "printers" INTEGER NOT NULL DEFAULT 0,
    "multifunctionPrinters" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeviceInventory_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NetworkChecklist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "wifiWholeSchool" BOOLEAN NOT NULL DEFAULT false,
    "subnetsSeparated" BOOLEAN NOT NULL DEFAULT false,
    "wifi80211n" BOOLEAN NOT NULL DEFAULT false,
    "wifi80211ac" BOOLEAN NOT NULL DEFAULT false,
    "firewallActive" BOOLEAN NOT NULL DEFAULT false,
    "contentFiltering" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NetworkChecklist_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndicatorRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "indicatorCode" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "changeState" TEXT,
    "comment" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndicatorRating_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IndicatorRating_indicatorCode_fkey" FOREIGN KEY ("indicatorCode") REFERENCES "Indicator" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ratingId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_ratingId_fkey" FOREIGN KEY ("ratingId") REFERENCES "IndicatorRating" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "reviewerType" TEXT NOT NULL,
    "indicatorCode" TEXT,
    "verdict" TEXT NOT NULL,
    "reliabilityNote" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DevelopmentPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "publishedAt" DATETIME,
    "fundingSource" TEXT,
    "approvingAuthority" TEXT,
    "stakeholderConsultationNotes" TEXT,
    CONSTRAINT "DevelopmentPlan_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanPriority" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "indicatorCode" TEXT NOT NULL,
    "currentLevel" INTEGER NOT NULL,
    "targetLevel" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "responsible" TEXT,
    "timeline" TEXT,
    "outcomeStatus" TEXT,
    CONSTRAINT "PlanPriority_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanPriority_indicatorCode_fkey" FOREIGN KEY ("indicatorCode") REFERENCES "Indicator" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationQuery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdByUserId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "targetCount" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "includeUnvalidated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ranAt" DATETIME,
    CONSTRAINT "DonationQuery_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationQueryResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "queryId" INTEGER NOT NULL,
    "schoolId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" REAL NOT NULL,
    "reasoning" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL,
    "shortlisted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DonationQueryResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "DonationQuery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DonationQueryResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Territory_name_key" ON "Territory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "School_simeId_key" ON "School"("simeId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorLevel_indicatorCode_level_key" ON "IndicatorLevel"("indicatorCode", "level");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCycle_previousCycleId_key" ON "AssessmentCycle"("previousCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCycle_schoolId_cycleNumber_key" ON "AssessmentCycle"("schoolId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceInventory_cycleId_key" ON "DeviceInventory"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkChecklist_cycleId_key" ON "NetworkChecklist"("cycleId");

-- CreateIndex
CREATE UNIQUE INDEX "IndicatorRating_cycleId_indicatorCode_key" ON "IndicatorRating"("cycleId", "indicatorCode");

-- CreateIndex
CREATE UNIQUE INDEX "DevelopmentPlan_cycleId_key" ON "DevelopmentPlan"("cycleId");
