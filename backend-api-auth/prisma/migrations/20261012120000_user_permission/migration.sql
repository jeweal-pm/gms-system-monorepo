-- user-permission SA revision 1 (ADR-0016, ADR-0017): additive only, no backfill.
-- Existing users become active=true with no phone, locations, photo or grants.

-- CreateEnum
CREATE TYPE "auth"."PermissionAction" AS ENUM ('VIEW', 'ADD', 'EDIT', 'DELETE', 'CANCEL', 'PRICE');

-- AlterTable
ALTER TABLE "auth"."User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone_country" CHAR(2),
ADD COLUMN     "phone_e164" VARCHAR(16);

-- CreateTable
CREATE TABLE "auth"."UserPermission" (
    "user_id" TEXT NOT NULL,
    "menu_key" VARCHAR(64) NOT NULL,
    "action" "auth"."PermissionAction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("user_id","menu_key","action")
);

-- CreateTable
CREATE TABLE "auth"."UserLocation" (
    "user_id" TEXT NOT NULL,
    "location_key" VARCHAR(64) NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("user_id","location_key")
);

-- CreateTable
CREATE TABLE "auth"."UserPhoto" (
    "user_id" TEXT NOT NULL,
    "content_type" VARCHAR(16) NOT NULL,
    "data" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPhoto_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "auth"."User"("role", "createdAt");

-- AddForeignKey
ALTER TABLE "auth"."UserPermission" ADD CONSTRAINT "UserPermission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."UserLocation" ADD CONSTRAINT "UserLocation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."UserPhoto" ADD CONSTRAINT "UserPhoto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw CHECK constraints that Prisma cannot express (database-diagram.md).
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_phone_e164_check" CHECK ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_phone_country_check" CHECK ("phone_country" IS NULL OR "phone_country" ~ '^[A-Z]{2}$');
ALTER TABLE "auth"."UserPermission" ADD CONSTRAINT "UserPermission_menu_key_check" CHECK ("menu_key" ~ '^[a-z0-9-]{1,64}$');
ALTER TABLE "auth"."UserLocation" ADD CONSTRAINT "UserLocation_location_key_check" CHECK ("location_key" ~ '^[a-z0-9-]{1,64}$');
ALTER TABLE "auth"."UserPhoto" ADD CONSTRAINT "UserPhoto_size_check" CHECK ("size_bytes" BETWEEN 1 AND 524288 AND octet_length("data") = "size_bytes");
ALTER TABLE "auth"."UserPhoto" ADD CONSTRAINT "UserPhoto_content_type_check" CHECK ("content_type" IN ('image/jpeg', 'image/png'));
