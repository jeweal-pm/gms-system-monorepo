-- Rollback of 20261124090000_sale_consumption_own: refuses while an own-stock Reserve line is settled by a Sale.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."sale_consumption_own_line") THEN RAISE EXCEPTION 'sale_consumption_own rollback refused: own-stock Sale settlements exist'; END IF;
END $$;
DROP TABLE "partner"."sale_consumption_own_line";
-- Then: DELETE FROM "partner"."_prisma_migrations" WHERE migration_name = '20261124090000_sale_consumption_own';
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_sold_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_sold_check" CHECK (
  "sold_pcs" >= 0 AND "sold_pcs" <= "pcs" AND "sold_weight_ct" >= 0 AND "sold_weight_ct" <= "weight_ct"
  AND ("memo_stock_id" IS NOT NULL OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'M%') OR ("sold_pcs" = 0 AND "sold_weight_ct" = 0)));
