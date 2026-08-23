-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IndicatorRating" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycleId" INTEGER NOT NULL,
    "indicatorCode" TEXT NOT NULL,
    "level" INTEGER,
    "changeState" TEXT,
    "comment" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IndicatorRating_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AssessmentCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IndicatorRating_indicatorCode_fkey" FOREIGN KEY ("indicatorCode") REFERENCES "Indicator" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_IndicatorRating" ("changeState", "comment", "cycleId", "id", "indicatorCode", "level", "updatedAt") SELECT "changeState", "comment", "cycleId", "id", "indicatorCode", "level", "updatedAt" FROM "IndicatorRating";
DROP TABLE "IndicatorRating";
ALTER TABLE "new_IndicatorRating" RENAME TO "IndicatorRating";
CREATE UNIQUE INDEX "IndicatorRating_cycleId_indicatorCode_key" ON "IndicatorRating"("cycleId", "indicatorCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
