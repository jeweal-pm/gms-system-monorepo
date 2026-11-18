-- Rollback of 20261118090000_sale_consumption (sale SA rev 1 database-diagram.md "Migration, backfill, rollback"). Run
-- manually as the schema owner, only before the first applied Sale or after every auto-approved Sale was deleted through
-- the API (which releases its quantities). Approval-ON sales are final (Q-SL-16): the script refuses while any
-- consumption line or sold quantity exists, so it never drops sale history.
-- Afterwards remove the migration row: DELETE FROM "partner"."_prisma_migrations" WHERE migration_name = '20261118090000_sale_consumption';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."sale_consumption_line")
     OR EXISTS (SELECT 1 FROM "partner"."reserve_line" WHERE "sold_pcs" > 0 OR "sold_weight_ct" > 0) THEN
    RAISE EXCEPTION 'sale consumption exists: release the applied sales through the API first';
  END IF;
END $$;

DROP TABLE "partner"."sale_consumption_line";
DROP TABLE "partner"."sale_consumption";
DROP INDEX "partner"."reserve_open_customer_idx";
DROP INDEX "partner"."reserve_line_open_idx";
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_sold_check";
ALTER TABLE "partner"."reserve_line" DROP COLUMN "sold_weight_ct", DROP COLUMN "sold_pcs";
