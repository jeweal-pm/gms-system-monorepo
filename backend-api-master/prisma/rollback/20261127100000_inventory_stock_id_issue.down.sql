-- Rollback of 20261127100000_inventory_stock_id_issue (merge-split SA-MS-07). Refuses once a Merge/Split Stock ID was issued: issued
-- ids are consumed from the shared counter and recorded for replay (forward-fix only). Run manually as the master migrator after
-- the merge-split code is removed, then:
-- DELETE FROM "partner"."_prisma_migrations" WHERE migration_name = '20261127100000_inventory_stock_id_issue';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."stock_id_issue" WHERE "document_type" = 'merge-split') THEN
    RAISE EXCEPTION 'inventory_stock_id_issue rollback refused: Merge/Split Stock IDs were issued';
  END IF;
END $$;
ALTER TABLE "partner"."stock_id_issue" DROP CONSTRAINT "stock_id_issue_type_check";
ALTER TABLE "partner"."stock_id_issue" ADD CONSTRAINT "stock_id_issue_type_check" CHECK ("document_type" IN ('stock-transfer-location'));
