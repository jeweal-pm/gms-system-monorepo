-- stone-master SA revision 1 (ADR-0024, SA-SM-03/05/11): new schema "stone" (owner 2026-10-19) with new tables only; nothing existing changes.
-- Generated with `prisma migrate diff`, then schema-qualified and given the CHECK constraints Prisma does not diff.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "stone";

-- CreateEnum
CREATE TYPE "stone"."stone_code_mode" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "stone"."stone_group" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_size" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_size_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_color" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_color_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_cutting" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_cutting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_clarity" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_clarity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_quality" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_quality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_name" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "group_id" UUID NOT NULL,
    "hsn" VARCHAR(8),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_shape" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_shape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stone"."stone_shape_size" (
    "shape_id" UUID NOT NULL,
    "size_id" UUID NOT NULL,

    CONSTRAINT "stone_shape_size_pkey" PRIMARY KEY ("shape_id","size_id")
);

-- CreateTable
CREATE TABLE "stone"."stone_code" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "mode" "stone"."stone_code_mode" NOT NULL,
    "stone_name_id" UUID NOT NULL,
    "size_id" UUID,
    "shape_id" UUID NOT NULL,
    "color_id" UUID NOT NULL,
    "cutting_id" UUID,
    "clarity_id" UUID,
    "quality_id" UUID,
    "part_order" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "stone_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stone_group_code_key" ON "stone"."stone_group"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_size_code_key" ON "stone"."stone_size"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_color_code_key" ON "stone"."stone_color"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_cutting_code_key" ON "stone"."stone_cutting"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_clarity_code_key" ON "stone"."stone_clarity"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_quality_code_key" ON "stone"."stone_quality"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stone_name_code_key" ON "stone"."stone_name"("code");

-- CreateIndex
CREATE INDEX "stone_name_group_id_idx" ON "stone"."stone_name"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "stone_shape_code_key" ON "stone"."stone_shape"("code");

-- CreateIndex
CREATE INDEX "stone_shape_size_size_id_idx" ON "stone"."stone_shape_size"("size_id");

-- CreateIndex
CREATE UNIQUE INDEX "stone_code_code_key" ON "stone"."stone_code"("code");

-- CreateIndex
CREATE INDEX "stone_code_stone_name_id_idx" ON "stone"."stone_code"("stone_name_id");

-- CreateIndex
CREATE INDEX "stone_code_size_id_idx" ON "stone"."stone_code"("size_id");

-- CreateIndex
CREATE INDEX "stone_code_shape_id_idx" ON "stone"."stone_code"("shape_id");

-- CreateIndex
CREATE INDEX "stone_code_color_id_idx" ON "stone"."stone_code"("color_id");

-- CreateIndex
CREATE INDEX "stone_code_cutting_id_idx" ON "stone"."stone_code"("cutting_id");

-- CreateIndex
CREATE INDEX "stone_code_clarity_id_idx" ON "stone"."stone_code"("clarity_id");

-- CreateIndex
CREATE INDEX "stone_code_quality_id_idx" ON "stone"."stone_code"("quality_id");

-- AddForeignKey
ALTER TABLE "stone"."stone_name" ADD CONSTRAINT "stone_name_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "stone"."stone_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_shape_size" ADD CONSTRAINT "stone_shape_size_shape_id_fkey" FOREIGN KEY ("shape_id") REFERENCES "stone"."stone_shape"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_shape_size" ADD CONSTRAINT "stone_shape_size_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "stone"."stone_size"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_stone_name_id_fkey" FOREIGN KEY ("stone_name_id") REFERENCES "stone"."stone_name"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_size_id_fkey" FOREIGN KEY ("size_id") REFERENCES "stone"."stone_size"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_shape_id_fkey" FOREIGN KEY ("shape_id") REFERENCES "stone"."stone_shape"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_color_id_fkey" FOREIGN KEY ("color_id") REFERENCES "stone"."stone_color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_cutting_id_fkey" FOREIGN KEY ("cutting_id") REFERENCES "stone"."stone_cutting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_clarity_id_fkey" FOREIGN KEY ("clarity_id") REFERENCES "stone"."stone_clarity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_quality_id_fkey" FOREIGN KEY ("quality_id") REFERENCES "stone"."stone_quality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SA-SM-04: codes are stored trimmed and UPPERCASE; the unique indexes above are therefore case-insensitive.
ALTER TABLE "stone"."stone_group" ADD CONSTRAINT "stone_group_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_size" ADD CONSTRAINT "stone_size_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_color" ADD CONSTRAINT "stone_color_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_cutting" ADD CONSTRAINT "stone_cutting_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_clarity" ADD CONSTRAINT "stone_clarity_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_quality" ADD CONSTRAINT "stone_quality_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_name" ADD CONSTRAINT "stone_name_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_shape" ADD CONSTRAINT "stone_shape_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,20}$');
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_code_format" CHECK ("code" ~ '^[A-Z0-9./-]{1,60}$');
-- SA-SM-04: HSN optional, 4-8 digits.
ALTER TABLE "stone"."stone_name" ADD CONSTRAINT "stone_name_hsn_format" CHECK ("hsn" IS NULL OR "hsn" ~ '^[0-9]{4,8}$');
-- SA-SM-05: part_order is a permutation of the seven part keys.
ALTER TABLE "stone"."stone_code" ADD CONSTRAINT "stone_code_part_order_permutation" CHECK (
  cardinality("part_order") = 7
  AND "part_order" @> ARRAY['name','size','shape','color','cutting','clarity','quality']::text[]
);
