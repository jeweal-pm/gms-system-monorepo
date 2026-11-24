-- sale-own-stock ADR-0058 D5 (phase B): what a Sale settled on the OWN-stock allocation rows of a Reserve line (inventory stock.id, no FK across
-- services). Same set semantics as sale_consumption_line; kept in its own table so the Memo Stock rows (memo_stock FK, PK) stay untouched.
-- Additive only. Rollback: prisma/rollback/20261124090000_sale_consumption_own.down.sql.
CREATE TABLE "partner"."sale_consumption_own_line" (
  "sale_id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "reserve_line_id" UUID NOT NULL,
  "own_stock_id" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "sale_consumption_own_line_pkey" PRIMARY KEY ("sale_id", "line_id", "own_stock_id"),
  CONSTRAINT "sale_consumption_own_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)),
  CONSTRAINT "sale_consumption_own_line_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "partner"."sale_consumption" ("sale_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_consumption_own_line_reserve_line_fkey" FOREIGN KEY ("reserve_line_id") REFERENCES "partner"."reserve_line" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sale_consumption_own_line_reserve_line_idx" ON "partner"."sale_consumption_own_line" ("reserve_line_id");

-- A Reserve line over own stock may be sold too (it was only allowed for Memo Stock lines).
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_sold_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_sold_check" CHECK (
  "sold_pcs" >= 0 AND "sold_pcs" <= "pcs" AND "sold_weight_ct" >= 0 AND "sold_weight_ct" <= "weight_ct"
  AND ("memo_stock_id" IS NOT NULL OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'M%') OR "own_stock_id" IS NOT NULL OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'O%')
       OR ("sold_pcs" = 0 AND "sold_weight_ct" = 0)));
