-- The login identifier is a handle, not an address.
--
-- Written by hand rather than generated: `prisma migrate diff` renders a
-- rename as DROP COLUMN + ADD COLUMN, which would delete every existing
-- login on the way past. CHANGE COLUMN preserves the data.
ALTER TABLE `User` CHANGE COLUMN `email` `login` VARCHAR(191) NOT NULL;
ALTER TABLE `User` RENAME INDEX `User_email_key` TO `User_login_key`;
