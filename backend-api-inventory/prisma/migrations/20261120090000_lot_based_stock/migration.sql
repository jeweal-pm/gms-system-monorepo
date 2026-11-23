-- lot-based-stock SA revision 1 / ADR-0055 (accepted 2026-11-20, owner "อนุมัติ lot-based-stock rev 1 (ค่า default)"),
-- BE-LOT-007. Additive, schema inventory only (database-diagram.md "Inventory"):
--   1. stock.lot_key: stored generated group key of our stock (D2: every item detail incl. stone code, cost unit price,
--      Stock Price and Sale Price; OS+id for a group of one) + stock_lot_open_idx.
--   2. sale_line: lot_key / stock_count, memo_stock_id nullable; one lot per Sale; the From Stock unique key widened to lots.
--   3. sale_line_alloc: copy of master's consumption allocation per Sale line (audit / reports; never returned publicly).
--   4. Backfill: one allocation row per line of an applied Sale (status APPROVED, not deleted), from its one memo stock.
-- Rollback: down.sql in this folder, only while no lot line exists (forward-fix only afterwards).

-- 1. Own stock group key.
ALTER TABLE "inventory"."stock" ADD COLUMN "lot_key" VARCHAR(40) GENERATED ALWAYS AS (
  CASE WHEN btrim("lot") = '' OR btrim("cer_no") <> '' THEN 'OS' || "id"::text
  ELSE 'OL' || md5(upper(btrim("lot")) || chr(31) || "vendor_id"::text || chr(31) || "currency_code" || chr(31) || "stone_code" || chr(31) || "stone"
    || chr(31) || "shape" || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality"
    || chr(31) || "cer_type" || chr(31) || "location" || chr(31) || "price_unit" || chr(31) || "unit_cost_base"::text || chr(31) || "stock_price"::text
    || chr(31) || "sale_price"::text || chr(31) || "item_note") END) STORED;
CREATE INDEX "stock_lot_open_idx" ON "inventory"."stock" ("lot_key", "ref_doc_date", "stock_id")
  WHERE "status" = 'ACTIVE' AND ("on_hand_pcs" > 0 OR "on_hand_weight_ct" > 0);

-- 2. Sale lot lines.
ALTER TABLE "inventory"."sale_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "inventory"."sale_line" ALTER COLUMN "memo_stock_id" DROP NOT NULL;
ALTER TABLE "inventory"."sale_line" ADD CONSTRAINT "sale_line_stock_ref_check" CHECK (
  ("memo_stock_id" IS NOT NULL AND "lot_key" IS NULL AND "stock_count" IS NULL)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NOT NULL AND "lot_key" LIKE 'M%' AND "source" = 'STOCK' AND "stock_count" IS NOT NULL AND "stock_count" >= 1)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'RESERVE'));
CREATE UNIQUE INDEX "sale_line_lot_key" ON "inventory"."sale_line" ("sale_id", "lot_key") WHERE "source" = 'STOCK' AND "lot_key" IS NOT NULL;

-- 3. Allocation copy (master is the ledger; this is what master returned for the applied revision).
CREATE TABLE "inventory"."sale_line_alloc" (
  "id" UUID NOT NULL,
  "sale_line_id" UUID NOT NULL,
  "seq" SMALLINT NOT NULL,
  "memo_stock_id" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "sale_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_line_alloc_line_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "inventory"."sale_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "sale_line_alloc_qty_check" CHECK ("seq" >= 1 AND "pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0))
);
CREATE UNIQUE INDEX "sale_line_alloc_seq_key" ON "inventory"."sale_line_alloc" ("sale_line_id", "seq");
CREATE UNIQUE INDEX "sale_line_alloc_memo_stock_key" ON "inventory"."sale_line_alloc" ("sale_line_id", "memo_stock_id");
CREATE INDEX "sale_line_alloc_memo_stock_idx" ON "inventory"."sale_line_alloc" ("memo_stock_id");

-- 4. Backfill: applied legacy Sale lines consumed exactly their one memo stock.
INSERT INTO "inventory"."sale_line_alloc" ("id", "sale_line_id", "seq", "memo_stock_id", "stock_id", "pcs", "weight_ct")
SELECT uuidv7(), l."id", 1, l."memo_stock_id", l."stock_id", l."pcs", l."weight_ct"
FROM "inventory"."sale_line" l JOIN "inventory"."sale" s ON s."id" = l."sale_id"
WHERE s."status" = 'APPROVED' AND s."deleted_at" IS NULL AND l."memo_stock_id" IS NOT NULL AND l."stock_id" <> '' AND (l."pcs" > 0 OR l."weight_ct" > 0);
