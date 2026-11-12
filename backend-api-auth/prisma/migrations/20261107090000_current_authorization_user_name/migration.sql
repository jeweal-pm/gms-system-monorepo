-- approve-center SA revision 1 / ADR-0046 D5 (accepted 2026-11-07; backend started by the owner 2026-11-10
-- "เริ่ม backend approval"): the master service snapshots the caller's OWN display name on the documents it writes
-- (submitted_by_name / reviewed_by_name). The view gains one column, `user_name` (the session owner's User.name),
-- appended LAST so the existing column list, order and types are unchanged (PostgreSQL allows appending columns with
-- CREATE OR REPLACE VIEW). The view keeps security_barrier, still exposes one row per live session and still has no
-- token, refresh hash, username, email, phone or photo. Existing grants on the view (SELECT to the provisioned
-- gms_master_authz_reader role) are preserved by CREATE OR REPLACE; no table and no grant changes.
--
-- Rollback (only after master code no longer selects user_name; CREATE OR REPLACE cannot drop a column), in one
-- transaction:
--   DROP VIEW "auth"."current_authorization";
--   -- recreate the definition of 20261021090000_gms_refresh_and_current_authorization (without user_name), then
--   GRANT SELECT ON TABLE auth.current_authorization TO gms_master_authz_reader;   -- if that role is provisioned
CREATE OR REPLACE VIEW "auth"."current_authorization" WITH (security_barrier = true) AS
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
  ) AS location_keys,
  u."name" AS user_name
FROM "auth"."Session" s
JOIN "auth"."User" u ON u."id" = s."userId"
LEFT JOIN "auth"."LicenseCurrentDecision" d ON d."user_id" = u."id";
