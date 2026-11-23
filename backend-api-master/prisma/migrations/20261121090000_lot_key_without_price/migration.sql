-- lot-based-stock, owner change 2026-11-21 (Q1, verbatim: "lot สามารถซ้ำกันได้ ต้อง detail ต้องตรงกันทุกอย่างถึงจะสามารถรวมกันได้
-- ยกเว้น ราคา ถ้าราคา ต่างกันจะเอาสองค่ามาเฉลี่ยกัน"): Memo Stock items of one lot merge when every detail matches EXCEPT the
-- price. `memo_stock.lot_key` is redefined without unit_price / net_unit_price (vendor, currency, item note, the empty-lot
-- and certificate rules stay). Lot rows show the quantity-weighted average price; each Stock ID keeps its own price.
-- 20261120090000_lot_based_stock is applied on dev and stays unchanged; this migration rebuilds the generated column.
-- Guard: no document line may name a lot yet (its stored key would no longer exist); dev and production have none.
-- Rollback: re-create the column with the 20261120090000 expression (same guard).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."quotation_line" WHERE "lot_key" IS NOT NULL) OR EXISTS (SELECT 1 FROM "partner"."reserve_line" WHERE "lot_key" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "partner"."memo_out_line" WHERE "lot_key" IS NOT NULL) OR EXISTS (SELECT 1 FROM "partner"."memo_return_line" WHERE "lot_key" IS NOT NULL)
     OR EXISTS (SELECT 1 FROM "partner"."purchase_line" WHERE "lot_key" IS NOT NULL) THEN
    RAISE EXCEPTION 'lot_key_without_price: document lines already name lots; re-key them before redefining memo_stock.lot_key';
  END IF;
END $$;

DROP INDEX "partner"."memo_stock_lot_open_idx";
DROP INDEX "partner"."memo_stock_lot_sold_open_idx";
ALTER TABLE "partner"."memo_stock" DROP COLUMN "lot_key";
ALTER TABLE "partner"."memo_stock" ADD COLUMN "lot_key" VARCHAR(40) GENERATED ALWAYS AS (
  CASE WHEN btrim("lot") = '' OR btrim("cer_no") <> '' THEN 'MS' || "id"::text
  ELSE 'ML' || md5(upper(btrim("lot")) || chr(31) || "vendor_id"::text || chr(31) || "currency_code" || chr(31) || "stone" || chr(31) || "shape"
    || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality" || chr(31) || "cer_type"
    || chr(31) || "location" || chr(31) || "price_unit" || chr(31) || "item_note") END) STORED;
CREATE INDEX "memo_stock_lot_open_idx" ON "partner"."memo_stock" ("lot_key", "received_doc_date", "stock_id")
  WHERE "pending_pcs" > 0 OR "pending_weight_ct" > 0;
CREATE INDEX "memo_stock_lot_sold_open_idx" ON "partner"."memo_stock" ("vendor_id", "lot_key")
  WHERE "sold_pcs" > "purchased_pcs" OR "sold_weight_ct" > "purchased_weight_ct";
