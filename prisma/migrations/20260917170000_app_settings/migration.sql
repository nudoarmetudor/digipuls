-- Platform-wide switches set by an operator, starting with read_only: the
-- platform stays readable and refuses changes, used while moving servers.
CREATE TABLE `AppSetting` (
  `key`       VARCHAR(64) NOT NULL,
  `value`     TEXT NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
