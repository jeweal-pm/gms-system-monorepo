-- Rollback of 20261119090000_sale (sale SA rev 1 database-diagram.md "Migration, backfill, rollback"). Run manually as
-- gms_inventory_migrator, only before the first Sale exists (applied sales must first be released through the API in
-- master; approval-ON sales are final, Q-SL-16, so a rollback after them is forward-fix only). The script refuses while
-- any Sale row exists. stored_file rows and bytes under files/sale/ are never removed (ADR-0030).
-- Afterwards remove the migration row: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261119090000_sale';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."sale") THEN
    RAISE EXCEPTION 'sale documents exist: rollback is forward-fix only';
  END IF;
END $$;

DROP TABLE "inventory"."sale_sync_op";
DROP TABLE "inventory"."sale_line_photo";
DROP TABLE "inventory"."sale_charge";
DROP TABLE "inventory"."sale_line";
DROP TABLE "inventory"."sale";
DELETE FROM "inventory"."approval_setting" WHERE "type" = 'sale';
ALTER TABLE "inventory"."approval_setting" DROP CONSTRAINT "approval_setting_type_check";
ALTER TABLE "inventory"."approval_setting" ADD CONSTRAINT "approval_setting_type_check"
  CHECK ("type" IN ('load-to-stock', 'merge-split', 'stock-transfer-location'));
