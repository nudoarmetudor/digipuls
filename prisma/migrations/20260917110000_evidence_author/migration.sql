-- Who added each piece of evidence.
--
-- Needed so evidence can be corrected or withdrawn while a cycle is a draft:
-- a mentor may change what they added, the principal and deputy anything.
-- Nullable, and null for every existing row; nothing recorded who added those.
ALTER TABLE `Evidence` ADD COLUMN `addedById` INTEGER NULL;
ALTER TABLE `Evidence` ADD CONSTRAINT `Evidence_addedById_fkey`
  FOREIGN KEY (`addedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
