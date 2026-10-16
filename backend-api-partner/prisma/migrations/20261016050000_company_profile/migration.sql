-- company-profile SA revision 2 (ADR-0021): one company profile row; the logo is a file,
-- only its metadata is stored here.

-- CreateTable
CREATE TABLE "partner"."company_profile" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "name" VARCHAR(200) NOT NULL,
    "tax_id" VARCHAR(50) NOT NULL DEFAULT '',
    "contact_name" VARCHAR(200) NOT NULL,
    "phone_country" CHAR(2) NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "website" VARCHAR(300) NOT NULL DEFAULT '',
    "address" VARCHAR(300) NOT NULL,
    "address2" VARCHAR(300) NOT NULL DEFAULT '',
    "country_code" CHAR(2) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "postcode" VARCHAR(20) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "bank_details" JSONB,
    "show_bank_details_on_invoice" BOOLEAN NOT NULL DEFAULT false,
    "terms" JSONB,
    "show_terms_on_invoice" BOOLEAN NOT NULL DEFAULT false,
    "logo_content_type" VARCHAR(16),
    "logo_size_bytes" INTEGER,
    "logo_sha256" CHAR(64),
    "logo_updated_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_profile_pkey" PRIMARY KEY ("id")
);

-- Raw CHECKs (database-diagram.md; Prisma does not diff CHECKs)
ALTER TABLE "partner"."company_profile" ADD CONSTRAINT "company_profile_singleton" CHECK ("id" = 1);
ALTER TABLE "partner"."company_profile" ADD CONSTRAINT "company_profile_version_positive" CHECK ("version" >= 1);
ALTER TABLE "partner"."company_profile" ADD CONSTRAINT "company_profile_logo_complete" CHECK (
  ("logo_content_type" IS NULL) = ("logo_size_bytes" IS NULL)
  AND ("logo_size_bytes" IS NULL) = ("logo_sha256" IS NULL)
  AND ("logo_sha256" IS NULL) = ("logo_updated_at" IS NULL)
);
ALTER TABLE "partner"."company_profile" ADD CONSTRAINT "company_profile_logo_type" CHECK ("logo_content_type" IS NULL OR "logo_content_type" IN ('image/jpeg', 'image/png'));
ALTER TABLE "partner"."company_profile" ADD CONSTRAINT "company_profile_logo_size" CHECK ("logo_size_bytes" IS NULL OR "logo_size_bytes" BETWEEN 1 AND 10485760);
