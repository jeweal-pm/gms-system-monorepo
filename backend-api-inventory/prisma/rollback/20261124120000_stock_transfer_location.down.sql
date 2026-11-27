-- Rollback of 20261124120000_stock_transfer_location (ADR-0060 "Consequences": drop the new tables and column and restore the
-- old kind list while no TRANSFER_* rows exist). Run manually as gms_inventory_migrator after the transfer code is removed. It
-- REFUSES once a transfer was applied (stock rows born by a transfer or TRANSFER_* ledger rows exist): forward-fix only.
-- Afterwards remove the migration row: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261124120000_stock_transfer_location';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."stock" WHERE "transferred_from_uuid" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "inventory"."stock_movement" WHERE "kind" LIKE 'TRANSFER\_%') THEN
    RAISE EXCEPTION 'stock_transfer_location rollback refused: applied transfers exist (forward-fix only)';
  END IF;
END $$;
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL'));
-- stock_movement.kind stays VARCHAR(32) (narrowing would need a rewrite and is not needed for the old kinds).
DROP TABLE "inventory"."stock_transfer_line";
DROP TABLE "inventory"."stock_transfer";
DROP INDEX "inventory"."stock_transferred_from_idx";
ALTER TABLE "inventory"."stock" DROP CONSTRAINT "stock_transferred_from_fkey";
ALTER TABLE "inventory"."stock" DROP COLUMN "transferred_from_uuid";
