-- Rollback of 20261127100000_merge_split (merge-split ADR "Consequences": drop the 4 tables and restore the previous kind list while
-- no SPLIT_* / MERGE_* rows exist). Run manually as gms_inventory_migrator after the merge-split code is removed. It REFUSES once a
-- Merge/Split was applied (forward-fix only). Afterwards remove the migration row:
-- DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261127100000_merge_split';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."stock_movement" WHERE "kind" LIKE 'SPLIT\_%' OR "kind" LIKE 'MERGE\_%') THEN
    RAISE EXCEPTION 'merge_split rollback refused: applied Merge/Split documents exist (forward-fix only)';
  END IF;
END $$;
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL', 'ADJUST', 'ADJUST_REVERSAL',
  'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_OUT_REVERSAL', 'TRANSFER_IN_REVERSAL'));
DROP TABLE "inventory"."merge_split_result_photo";
DROP TABLE "inventory"."merge_split_result";
DROP TABLE "inventory"."merge_split_source";
DROP TABLE "inventory"."merge_split";
