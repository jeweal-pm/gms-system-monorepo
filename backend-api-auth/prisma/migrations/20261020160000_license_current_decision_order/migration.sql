-- ADR-0028 / INV-20261020-001: v2 decisions are ordered independently of the v1 license cache.
CREATE SEQUENCE "auth"."LicenseCurrentCheckOrder" AS bigint;

CREATE TABLE "auth"."LicenseCurrentDecision" (
  "user_id" TEXT NOT NULL PRIMARY KEY,
  "last_check_order" BIGINT NOT NULL,
  "state" VARCHAR(8) NOT NULL,
  "signed_token" TEXT,
  "successful_at" TIMESTAMPTZ(6),
  "decided_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "LicenseCurrentDecision_state_check" CHECK (
    ("state" = 'ACTIVE' AND "signed_token" IS NOT NULL AND "successful_at" IS NOT NULL)
    OR ("state" = 'DENIED' AND "signed_token" IS NULL AND "successful_at" IS NULL)
  ),
  CONSTRAINT "LicenseCurrentDecision_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
