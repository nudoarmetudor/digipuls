/*
  Warnings:

  - You are about to drop the `DonationQuery` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DonationQueryResult` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DonationQuery";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DonationQueryResult";
PRAGMA foreign_keys=on;
