-- ADR-0026: additive refresh state. Existing Better Auth sessions and v1 license cache remain intact.
CREATE TABLE "auth"."RefreshFamily" (
  "id" UUID NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  CONSTRAINT "RefreshFamily_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RefreshFamily_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RefreshFamily_user_id_revoked_at_idx" ON "auth"."RefreshFamily"("user_id", "revoked_at");
CREATE INDEX "RefreshFamily_session_id_idx" ON "auth"."RefreshFamily"("session_id");
CREATE UNIQUE INDEX "RefreshFamily_one_active_user_idx" ON "auth"."RefreshFamily"("user_id") WHERE "revoked_at" IS NULL;

CREATE TABLE "auth"."RefreshCredential" (
  "id" UUID NOT NULL PRIMARY KEY,
  "family_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "RefreshCredential_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "auth"."RefreshFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RefreshCredential_token_hash_key" ON "auth"."RefreshCredential"("token_hash");
CREATE INDEX "RefreshCredential_family_id_consumed_at_idx" ON "auth"."RefreshCredential"("family_id", "consumed_at");

-- The view has one bounded row per live session. It contains no opaque session token,
-- signed license material, refresh hash, username, email or personal profile fields.
-- Domain roles receive SELECT on the view only, through a separate provisioning step.
CREATE VIEW "auth"."current_authorization" WITH (security_barrier = true) AS
SELECT
  s."id" AS session_id,
  s."userId" AS user_id,
  s."expiresAt" AS session_expires_at,
  u."active" AS account_active,
  u."role" AS account_role,
  d."state" AS last_license_state,
  ARRAY(
    SELECT p."menu_key" || ':' || p."action"::text
    FROM "auth"."UserPermission" p
    WHERE p."user_id" = u."id"
    ORDER BY p."menu_key", p."action"::text
  ) AS permissions,
  ARRAY(
    SELECT l."location_key"
    FROM "auth"."UserLocation" l
    WHERE l."user_id" = u."id"
    ORDER BY l."location_key"
  ) AS location_keys
FROM "auth"."Session" s
JOIN "auth"."User" u ON u."id" = s."userId"
LEFT JOIN "auth"."LicenseCurrentDecision" d ON d."user_id" = u."id";
