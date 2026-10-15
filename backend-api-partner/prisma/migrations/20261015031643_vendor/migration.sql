-- CreateTable
CREATE TABLE "partner"."vendor" (
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

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."vendor_address" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(32),
    "address" VARCHAR(500) NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "postcode" VARCHAR(20) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vendor_address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_code_key_key" ON "partner"."vendor"("code_key");

-- CreateIndex
CREATE INDEX "vendor_name_key_id_idx" ON "partner"."vendor"("name_key", "id");

-- CreateIndex
CREATE INDEX "vendor_active_name_key_id_idx" ON "partner"."vendor"("active", "name_key", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_address_position_key" ON "partner"."vendor_address"("vendor_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_address_one_default_key" ON "partner"."vendor_address"("vendor_id") WHERE ("is_default" = true);

-- AddForeignKey
ALTER TABLE "partner"."vendor_address" ADD CONSTRAINT "vendor_address_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw CHECK constraints (vendor database-diagram.md; Prisma does not model or diff CHECKs).
ALTER TABLE "partner"."vendor"
  ADD CONSTRAINT "vendor_name_key_chk" CHECK ("name_key" = lower("name")),
  ADD CONSTRAINT "vendor_code_key_chk" CHECK (("code" IS NULL AND "code_key" IS NULL) OR "code_key" = lower("code")),
  ADD CONSTRAINT "vendor_code_nonblank_chk" CHECK ("code" IS NULL OR length(btrim("code")) > 0),
  ADD CONSTRAINT "vendor_currency_chk" CHECK ("currency_code" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "vendor_email_lower_chk" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "vendor_phone_chk" CHECK (("phone_e164" IS NULL) = ("phone_country" IS NULL)
    AND ("phone_e164" IS NULL OR "phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
    AND ("phone_country" IS NULL OR "phone_country" ~ '^[A-Z]{2}$'));

ALTER TABLE "partner"."vendor_address"
  ADD CONSTRAINT "vendor_address_position_chk" CHECK ("position" BETWEEN 1 AND 10),
  ADD CONSTRAINT "vendor_address_country_chk" CHECK ("country_code" ~ '^[A-Z]{2}$');
