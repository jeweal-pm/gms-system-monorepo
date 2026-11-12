-- ADR-0049 D4 (owner 2026-11-11): notification recipients. `current_authorization` has one row per live session, so it
-- can't find users who hold a grant while signed out (e.g. an approver who should still get "waits for your approval").
-- One row per user: active flag, role and menu:action keys only — no name, e-mail, session, token or license material.
-- SELECT for the master reader role is granted manually (prisma/roles in backend-api-master), never by this migration.
CREATE VIEW "auth"."permission_holders" WITH (security_barrier = true) AS
SELECT
  u."id" AS user_id,
  u."active" AS account_active,
  u."role" AS account_role,
  ARRAY(
    SELECT p."menu_key" || ':' || p."action"::text
    FROM "auth"."UserPermission" p
    WHERE p."user_id" = u."id"
    ORDER BY p."menu_key", p."action"::text
  ) AS permissions
FROM "auth"."User" u;
