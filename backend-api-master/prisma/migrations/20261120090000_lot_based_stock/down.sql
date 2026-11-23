-- Rollback of 20261120090000_lot_based_stock (ADR-0055). Run manually by an approved DB owner, ONLY while no lot line
-- exists (every lot_key on the document lines is NULL) and no sale consumption names one Sale line twice; afterwards the
-- change is forward-fix only (a lot line has no single item). Prisma does not run this file. After it, delete the row
-- of this migration from partner._prisma_migrations.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."quotation_line" WHERE "lot_key" IS NOT NULL) OR EXISTS (SELECT 1 FROM "partner"."reserve_line" WHERE "lot_key" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "partner"."memo_out_line" WHERE "lot_key" IS NOT NULL) OR EXISTS (SELECT 1 FROM "partner"."memo_return_line" WHERE "lot_key" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "partner"."purchase_line" WHERE "lot_key" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "partner"."sale_consumption_line" GROUP BY "sale_id", "line_id" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'lot lines exist: forward-fix only';
  END IF;
END $$;

ALTER TABLE "partner"."sale_consumption" DROP CONSTRAINT "sale_consumption_result_size_check";
ALTER TABLE "partner"."sale_consumption" ADD CONSTRAINT "sale_consumption_result_size_check" CHECK (octet_length("result"::text) <= 32768);
ALTER TABLE "partner"."sale_consumption_line" DROP CONSTRAINT "sale_consumption_line_pkey";
ALTER TABLE "partner"."sale_consumption_line" ADD CONSTRAINT "sale_consumption_line_pkey" PRIMARY KEY ("sale_id", "line_id");
CREATE UNIQUE INDEX "sale_consumption_line_reserve_line_key" ON "partner"."sale_consumption_line" ("sale_id", "reserve_line_id") WHERE "reserve_line_id" IS NOT NULL;

DROP TABLE "partner"."memo_out_return_line_alloc";
DROP TABLE "partner"."purchase_line_alloc";
DROP TABLE "partner"."memo_return_line_alloc";
DROP TABLE "partner"."memo_out_line_alloc";
DROP TABLE "partner"."reserve_line_alloc";

DROP INDEX "partner"."reserve_line_open_idx";
CREATE INDEX "reserve_line_open_idx" ON "partner"."reserve_line" ("reserve_id", "position")
  WHERE "memo_stock_id" IS NOT NULL AND ("sold_pcs" < "pcs" OR "sold_weight_ct" < "weight_ct");
DROP INDEX "partner"."memo_out_line_open_idx";
CREATE INDEX "memo_out_line_open_idx" ON "partner"."memo_out_line" ("memo_out_id")
  WHERE ("memo_stock_id" IS NOT NULL OR "own_stock_id" IS NOT NULL) AND ("returned_pcs" < "pcs" OR "returned_weight_ct" < "weight_ct");
DROP INDEX "partner"."quotation_line_lot_key";
DROP INDEX "partner"."reserve_line_lot_key";
DROP INDEX "partner"."memo_out_line_lot_key";
DROP INDEX "partner"."memo_return_line_lot_key";
DROP INDEX "partner"."purchase_line_lot_key";

ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_stock_count_check";
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_stock_id_source_check";
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_stock_id_source_check" CHECK (("source" = 'STOCK') = ("stock_id" IS NOT NULL));
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_source_check";
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_source_check" CHECK (
  "source" IN ('STOCK', 'PURCHASE_ORDER', 'MANUAL') AND (("source" = 'STOCK') = ("memo_stock_id" IS NOT NULL AND "memo_group" IS NOT NULL))
  AND (("source" = 'PURCHASE_ORDER') = ("purchase_order_line_id" IS NOT NULL)) AND ("source" = 'STOCK' OR ("memo_group" IS NULL AND "memo_stock_id" IS NULL)));
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_sold_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_sold_check" CHECK (
  "sold_pcs" BETWEEN 0 AND "pcs" AND "sold_weight_ct" >= 0 AND "sold_weight_ct" <= "weight_ct" AND ("memo_stock_id" IS NOT NULL OR ("sold_pcs" = 0 AND "sold_weight_ct" = 0)));
ALTER TABLE "partner"."memo_return_line" DROP CONSTRAINT "memo_return_line_stock_check";
ALTER TABLE "partner"."memo_return_line" ALTER COLUMN "memo_stock_id" SET NOT NULL, ALTER COLUMN "stock_id" SET NOT NULL;
ALTER TABLE "partner"."quotation_line" DROP CONSTRAINT "quotation_line_stock_check";
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_stock_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."memo_out_line" DROP CONSTRAINT "memo_out_line_stock_check";
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));

ALTER TABLE "partner"."quotation_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
ALTER TABLE "partner"."reserve_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
ALTER TABLE "partner"."memo_out_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
ALTER TABLE "partner"."memo_return_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
ALTER TABLE "partner"."purchase_line" DROP COLUMN "lot_key", DROP COLUMN "stock_count";
DROP INDEX "partner"."memo_stock_lot_sold_open_idx";
DROP INDEX "partner"."memo_stock_lot_open_idx";
ALTER TABLE "partner"."memo_stock" DROP COLUMN "lot_key";
