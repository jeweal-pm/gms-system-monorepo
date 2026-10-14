-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "partner";

-- CreateEnum
CREATE TYPE "partner"."address_type" AS ENUM ('INVOICE', 'SHIPPING');

-- CreateTable
CREATE TABLE "partner"."customer" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_key" VARCHAR(200) NOT NULL,
    "code" VARCHAR(120),
    "code_key" VARCHAR(120),
    "currency_code" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "first_name" VARCHAR(100) NOT NULL,
    "middle_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "phone_e164" VARCHAR(16),
    "phone_country" CHAR(2),
    "email" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."customer_address" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "partner"."address_type" NOT NULL,
    "position" SMALLINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(32),
    "address" VARCHAR(500) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "postcode" VARCHAR(20) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key_key" ON "partner"."customer"("code_key");

-- CreateIndex
CREATE INDEX "customer_name_key_id_idx" ON "partner"."customer"("name_key", "id");

-- CreateIndex
CREATE INDEX "customer_active_name_key_id_idx" ON "partner"."customer"("active", "name_key", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_address_position_key" ON "partner"."customer_address"("customer_id", "type", "position");

-- CreateIndex
CREATE UNIQUE INDEX "customer_address_one_default_key" ON "partner"."customer_address"("customer_id", "type") WHERE ("is_default" = true);

-- AddForeignKey
ALTER TABLE "partner"."customer_address" ADD CONSTRAINT "customer_address_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partner"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw CHECK constraints (database-diagram.md; Prisma does not model or diff CHECKs).
ALTER TABLE "partner"."customer"
  ADD CONSTRAINT "customer_name_key_chk" CHECK ("name_key" = lower("name")),
  ADD CONSTRAINT "customer_code_key_chk" CHECK (("code" IS NULL AND "code_key" IS NULL) OR "code_key" = lower("code")),
  ADD CONSTRAINT "customer_code_nonblank_chk" CHECK ("code" IS NULL OR length(btrim("code")) > 0),
  ADD CONSTRAINT "customer_currency_chk" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "customer_email_lower_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "customer_phone_chk" CHECK (("phone_e164" IS NULL) = ("phone_country" IS NULL)
    AND ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
    AND ("phone_country" IS NULL OR "phone_country" ~ '^[A-Z]{2}$'));

ALTER TABLE "partner"."customer_address"
  ADD CONSTRAINT "customer_address_position_chk" CHECK ("position" BETWEEN 1 AND 10),
  ADD CONSTRAINT "customer_address_country_chk" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "customer_address_taxid_chk" CHECK ("type" = 'INVOICE' OR "tax_id" IS NULL);
