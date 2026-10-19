-- user-photo.md PH-03: photo bytes move to files (storage/user-photos/<userId>); the table keeps metadata only.
-- The table had 0 rows when this was written (2026-10-17), so no data step is needed.
ALTER TABLE "auth"."UserPhoto" DROP COLUMN "data";
