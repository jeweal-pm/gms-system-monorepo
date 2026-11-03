-- quotation SA revision 2 / ADR-0038 (owner 2026-11-03: "อนุมัติ quotation revision 2").
-- A quotation line may name a Memo Stock item (From Stock, SA-QT-15). It only copies the item's details: nothing is
-- taken or held (SA-QT-18). Additive; existing lines stay MANUAL with NULL stock columns, so there is no backfill.
-- Rollback (only while no STOCK quotation line exists): DROP INDEX quotation_line_memo_stock_idx,
--   quotation_line_memo_stock_key; drop quotation_line_stock_check, the FK and the four stock columns.

-- AlterTable
ALTER TABLE "partner"."quotation_line"
  ADD COLUMN "memo_stock_id" UUID,
  ADD COLUMN "stock_id" VARCHAR(10),
  ADD COLUMN "stock_pending_pcs" INTEGER,
  ADD COLUMN "stock_pending_weight_ct" DECIMAL(12,3);

-- A manual line has none of the stock columns; a stock line has all of them and quotes at most the pending it saw.
ALTER TABLE "partner"."quotation_line"
  ADD CONSTRAINT "quotation_line_stock_check" CHECK (
    ("memo_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
    OR ("memo_stock_id" IS NOT NULL AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL
        AND "source" = 'STOCK' AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));

-- AddForeignKey
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_memo_stock_id_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "quotation_line_memo_stock_key" ON "partner"."quotation_line"("quotation_id", "memo_stock_id");
CREATE INDEX "quotation_line_memo_stock_idx" ON "partner"."quotation_line"("memo_stock_id");
