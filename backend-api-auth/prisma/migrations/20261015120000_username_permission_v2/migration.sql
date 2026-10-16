-- ADR-0020 revision 1 (user-permission SA revision 2): username login + permission catalog v2.
-- 1. New enum values (additive). They are not used in this migration, so ADD VALUE is safe here.
ALTER TYPE "auth"."PermissionAction" ADD VALUE IF NOT EXISTS 'APPROVE' BEFORE 'PRICE';
ALTER TYPE "auth"."PermissionAction" ADD VALUE IF NOT EXISTS 'PRINT';
ALTER TYPE "auth"."PermissionAction" ADD VALUE IF NOT EXISTS 'EXCEL';

-- 2. Username = lower(trim(existing email)), so existing accounts keep logging in with the same text.
ALTER TABLE "auth"."User" ADD COLUMN "username" VARCHAR(64);
UPDATE "auth"."User" SET "username" = lower(btrim("email"));
ALTER TABLE "auth"."User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "auth"."User"("username");
-- Fails loudly if an existing email cannot be a valid username (longer than 64 or other characters).
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_username_check" CHECK ("username" ~ '^[a-z0-9._@+-]{3,64}$');

-- 3. Email becomes an internal, never-shown value (Better Auth still requires the column).
--    Rollback note: the old email is recoverable from "username".
UPDATE "auth"."User" SET "email" = "id" || '@users.invalid';

-- 4. Owner decision (ADR-0020 §3): wipe every v1 grant. Super Admin keeps implicit ALL.
DELETE FROM "auth"."UserPermission";
