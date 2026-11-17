-- Rollback of 20261117090000_load_to_stock_allocation (load-to-stock SA rev 1 database-diagram.md "Migration, backfill
-- and rollback"). Run manually as the schema owner, only after every applied Load to Stock was deleted through the API
-- (which returns the Purchase remaining); it refuses while any allocation line exists, so it never drops stock history.
-- Afterwards remove the migration row: DELETE FROM "partner"."_prisma_migrations" WHERE migration_name = '20261117090000_load_to_stock_allocation';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."load_allocation_line") THEN
    RAISE EXCEPTION 'load_allocation_line is not empty: release the applied loads through the API first';
  END IF;
END $$;

ALTER TABLE "partner"."approval_setting" DROP CONSTRAINT "approval_setting_type_check";
ALTER TABLE "partner"."approval_setting" ADD CONSTRAINT "approval_setting_type_check" CHECK ("type" IN ('quotation', 'reserve', 'memo-receive', 'memo-return', 'memo-out', 'memo-out-return', 'purchase-order', 'purchase', 'load-to-stock', 'merge-split', 'stock-transfer-location'));
INSERT INTO "partner"."approval_setting" ("type", "require_approval", "updated_at") VALUES
  ('load-to-stock', true, now()), ('merge-split', true, now()), ('stock-transfer-location', true, now())
ON CONFLICT ("type") DO NOTHING;

ALTER TABLE "partner"."document_numbering" DROP COLUMN "external_used_at";
DROP TABLE "partner"."load_stock_id";
DROP TABLE "partner"."load_allocation_line";
DROP TABLE "partner"."load_allocation";
DROP INDEX "partner"."purchase_line_loadable_idx";
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_loaded_check";
ALTER TABLE "partner"."purchase_line" DROP COLUMN "loaded_weight_ct", DROP COLUMN "loaded_pcs";
