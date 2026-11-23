-- lot-based-stock, owner change 2026-11-21 (Q4, verbatim: "ของจาก Load (own stock) ไม่ต้องรวม Lot ในรอบนี้"): our stock is not
-- merged into lots this round. `stock.lot_key` becomes 'OS' || id for every stock (a group of one), so each own-stock
-- picker row and lot line names exactly one stock; the lot pickers, allocation and hold paths are unchanged.
-- 20261120090000_lot_based_stock is applied on dev and stays unchanged. Guard: no Sale line names a lot yet (the Memo
-- Stock key is redefined by master in the same release). Rollback: re-create the column with the 20261120090000 expression.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."sale_line" WHERE "lot_key" IS NOT NULL) THEN
    RAISE EXCEPTION 'own_lot_key_per_stock: sale lines already name lots; re-key them first';
  END IF;
END $$;

DROP INDEX "inventory"."stock_lot_open_idx";
ALTER TABLE "inventory"."stock" DROP COLUMN "lot_key";
ALTER TABLE "inventory"."stock" ADD COLUMN "lot_key" VARCHAR(40) GENERATED ALWAYS AS ('OS' || "id"::text) STORED;
CREATE INDEX "stock_lot_open_idx" ON "inventory"."stock" ("lot_key", "ref_doc_date", "stock_id")
  WHERE "status" = 'ACTIVE' AND ("on_hand_pcs" > 0 OR "on_hand_weight_ct" > 0);
