-- Rollback of 20261123120000_sale_own_stock (ADR-0058 D10). Run manually as gms_inventory_migrator after the Sale own-stock code is
-- removed. It REFUSES once an own-stock line, allocation or SALE_OUT* ledger row exists (the ledger is append-only: forward-fix only).
-- Afterwards remove the migration row: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261123120000_sale_own_stock';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."sale_line" WHERE "source" = 'OWN_STOCK')
     OR EXISTS (SELECT 1 FROM "inventory"."sale_line_alloc" WHERE "own_stock_uuid" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "inventory"."stock_movement" WHERE "kind" IN ('SALE_OUT', 'SALE_OUT_REVERSAL')) THEN
    RAISE EXCEPTION 'sale_own_stock rollback refused: own-stock Sale data exists (forward-fix only)';
  END IF;
END $$;
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL'));
DROP INDEX "inventory"."sale_line_alloc_own_stock_idx";
DROP INDEX "inventory"."sale_line_alloc_own_stock_key";
ALTER TABLE "inventory"."sale_line_alloc" DROP CONSTRAINT "sale_line_alloc_ref_check";
ALTER TABLE "inventory"."sale_line_alloc" DROP CONSTRAINT "sale_line_alloc_own_stock_fkey";
ALTER TABLE "inventory"."sale_line_alloc" DROP COLUMN "own_stock_uuid";
ALTER TABLE "inventory"."sale_line_alloc" ALTER COLUMN "memo_stock_id" SET NOT NULL;
DROP INDEX "inventory"."sale_line_own_lot_key";
ALTER TABLE "inventory"."sale_line" DROP CONSTRAINT "sale_line_stock_ref_check";
ALTER TABLE "inventory"."sale_line" ADD CONSTRAINT "sale_line_stock_ref_check" CHECK (
  ("memo_stock_id" IS NOT NULL AND "lot_key" IS NULL AND "stock_count" IS NULL)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NOT NULL AND "lot_key" LIKE 'M%' AND "source" = 'STOCK' AND "stock_count" IS NOT NULL AND "stock_count" >= 1)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'RESERVE'));
ALTER TABLE "inventory"."sale_line" DROP CONSTRAINT "sale_line_source_check";
ALTER TABLE "inventory"."sale_line" ADD CONSTRAINT "sale_line_source_check" CHECK (
  ("source" = 'RESERVE' AND "reserve_line_id" IS NOT NULL AND "reserve_id" IS NOT NULL)
  OR ("source" = 'STOCK' AND "reserve_line_id" IS NULL AND "reserve_id" IS NULL));
ALTER TABLE "inventory"."sale_line" DROP COLUMN "load_doc_no", DROP COLUMN "load_id";
