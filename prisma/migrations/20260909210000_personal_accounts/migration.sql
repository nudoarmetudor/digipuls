-- Every school-level account belongs to one named person.
--
-- Three statements, in this order and no other:
--   1. add the column, nullable, so nothing breaks mid-deploy;
--   2. treat every account that already exists as claimed — these are real
--      people who have been signing in for weeks, and forcing them all
--      through a claim screen on the morning of a deploy would be a
--      self-inflicted outage;
--   3. un-claim the shared logins. They are the twelve "Echipa digitală"
--      accounts: one credential per school, handed round the staffroom. The
--      next person to sign in with one has to say who they are before the
--      platform will do anything else.
--
-- Matched on the name rather than on a hard-coded list of ids, so this does
-- the same thing on production, on a restored backup and on a fresh seed.
ALTER TABLE `User` ADD COLUMN `identityConfirmedAt` DATETIME(3) NULL;

UPDATE `User` SET `identityConfirmedAt` = COALESCE(`createdAt`, NOW(3));

UPDATE `User`
   SET `identityConfirmedAt` = NULL
 WHERE `role` IN ('SCHOOL_PRINCIPAL', 'SCHOOL_DEPUTY', 'SCHOOL_MENTOR')
   AND (`name` LIKE 'Echipa digital%' OR `name` LIKE '%Echipa digital%');
