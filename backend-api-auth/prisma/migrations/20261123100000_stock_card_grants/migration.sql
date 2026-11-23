-- stock-card SA rev 1 / ADR-0056 D9 (BE-SC-007): one-time grant copy for the two new report leaves that replace the Stock
-- Movement leaves in the permission catalog (src/permission/catalog.ts).
--   stock-movement-primary     VIEW / PRINT / EXCEL -> stock-card   (same action)
--   stock-movement-consignment (every action)        -> stock-value  (same action; a placeholder leaf, no page or API yet)
-- Idempotent (ON CONFLICT DO NOTHING); users without either old grant gain nothing. The old rows stay in the table and are
-- ignored on read (stored grants for cells outside the catalog are filtered). Super Admin keeps implicit ALL and needs no rows.
-- Rollback (only before anyone edits these grants by hand):
--   DELETE FROM "auth"."UserPermission" WHERE "menu_key" IN ('stock-card', 'stock-value');
INSERT INTO "auth"."UserPermission" ("user_id", "menu_key", "action")
SELECT p."user_id", 'stock-card', p."action"
FROM "auth"."UserPermission" p
WHERE p."menu_key" = 'stock-movement-primary' AND p."action" IN ('VIEW', 'PRINT', 'EXCEL')
ON CONFLICT ("user_id", "menu_key", "action") DO NOTHING;

INSERT INTO "auth"."UserPermission" ("user_id", "menu_key", "action")
SELECT p."user_id", 'stock-value', p."action"
FROM "auth"."UserPermission" p
WHERE p."menu_key" = 'stock-movement-consignment'
ON CONFLICT ("user_id", "menu_key", "action") DO NOTHING;
