-- Rollback of 20261120090000_lot_based_stock (ADR-0055), run manually as gms_inventory_migrator ONLY while no Sale lot
-- line exists; afterwards forward-fix only. Prisma does not run this file. Delete the migration's row from
-- inventory._prisma_migrations afterwards.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."sale_line" WHERE "memo_stock_id" IS NULL) THEN
    RAISE EXCEPTION 'lot lines exist: forward-fix only';
  END IF;
END $$;
DROP TABLE "inventory"."sale_line_alloc";
DROP INDEX "inventory"."sale_line_lot_key";
ALTER TABLE "inventory"."sale_line" DROP CONSTRAINT "sale_line_stock_ref_check";
ALTER TABLE "inventory"."sale_line" ALTER COLUMN "memo_stock_id" SET NOT NULL;
ALTER TABLE "inventory"."sale_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
DROP INDEX "inventory"."stock_lot_open_idx";
ALTER TABLE "inventory"."stock" DROP COLUMN "lot_key";
