-- decimal-setup SA revision 1 / ADR-0038, owner decision Q-DEC-14 (2026-11-03): one-time grant copy.
-- Every user with Document Setup VIEW or EDIT gets the same Decimal Setup action. Idempotent (ON CONFLICT DO NOTHING);
-- no other grant is inserted, changed or removed. The catalog leaf `decimal-setup` (VIEW, EDIT) is added in
-- src/permission/catalog.ts. Super Admin keeps implicit ALL (ADR-0017) and needs no rows.
-- Rollback (only before anyone edits Decimal Setup grants by hand):
--   DELETE FROM "auth"."UserPermission" WHERE "menu_key" = 'decimal-setup';
INSERT INTO "auth"."UserPermission" ("user_id", "menu_key", "action")
SELECT p."user_id", 'decimal-setup', p."action"
FROM "auth"."UserPermission" p
WHERE p."menu_key" = 'document-setup' AND p."action" IN ('VIEW', 'EDIT')
ON CONFLICT ("user_id", "menu_key", "action") DO NOTHING;
