-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AssessmentCycle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "schoolId" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "confirmedById" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "previousCycleId" INTEGER,
    CONSTRAINT "AssessmentCycle_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssessmentCycle_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AssessmentCycle_previousCycleId_fkey" FOREIGN KEY ("previousCycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentCycle" ("confirmedAt", "cycleNumber", "id", "previousCycleId", "schoolId", "startedAt", "status") SELECT "confirmedAt", "cycleNumber", "id", "previousCycleId", "schoolId", "startedAt", "status" FROM "AssessmentCycle";
DROP TABLE "AssessmentCycle";
ALTER TABLE "new_AssessmentCycle" RENAME TO "AssessmentCycle";
CREATE UNIQUE INDEX "AssessmentCycle_previousCycleId_key" ON "AssessmentCycle"("previousCycleId");
CREATE UNIQUE INDEX "AssessmentCycle_schoolId_cycleNumber_key" ON "AssessmentCycle"("schoolId", "cycleNumber");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "schoolId" INTEGER,
    "territoryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "User_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "role", "schoolId", "territoryId") SELECT "createdAt", "email", "id", "name", "passwordHash", "role", "schoolId", "territoryId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
