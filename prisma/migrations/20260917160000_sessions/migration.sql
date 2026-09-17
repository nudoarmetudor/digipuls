-- Browser sessions, stored in the database so that a restart of the app's
-- processes — every deploy, and whenever the host recycles them — no longer
-- signs everyone out.
CREATE TABLE `Session` (
  `sid`       VARCHAR(128) NOT NULL,
  `data`      TEXT NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,

  INDEX `Session_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
