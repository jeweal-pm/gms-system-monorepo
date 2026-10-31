-- memo-out SA revision 2 / ADR-0033 revision 2 (owner 2026-10-31: "อนุมัติ memo-out revision 2").
-- Memo Out: PENDING_APPROVAL -> APPROVED (SA-MO-11); a line may name a Memo Stock item (From Stock, SA-MO-12), and
-- approval moves its quantity from pending into Reserve (SA-MO-14). Additive; existing drafts become PENDING_APPROVAL
-- and their lines stay manual (SA-MO-16).
-- Rollback (only while no memo out is APPROVED): DROP INDEX memo_stock_pending_all_idx, memo_out_status_idx,
--   memo_out_line_memo_stock_idx, memo_out_line_memo_stock_key; drop memo_out_line_stock_check, the FK and the four
--   memo_out_line stock columns; drop memo_out_approved_check and approved_at / approved_by; UPDATE memo_out SET
--   status = 'DRAFT'; restore memo_out_status_check CHECK (status IN ('DRAFT')).

-- AlterTable
ALTER TABLE "partner"."memo_out"
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" VARCHAR(64);

-- Status flow: drafts wait for approval now.
ALTER TABLE "partner"."memo_out" DROP CONSTRAINT "memo_out_status_check";
UPDATE "partner"."memo_out" SET "status" = 'PENDING_APPROVAL' WHERE "status" = 'DRAFT';
ALTER TABLE "partner"."memo_out"
  ADD CONSTRAINT "memo_out_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "memo_out_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL)));

-- AlterTable
ALTER TABLE "partner"."memo_out_line"
  ADD COLUMN "memo_stock_id" UUID,
  ADD COLUMN "stock_id" VARCHAR(10),
  ADD COLUMN "stock_pending_pcs" INTEGER,
  ADD COLUMN "stock_pending_weight_ct" DECIMAL(12,3);

-- A manual line has none of the stock columns; a stock line has all of them and takes at most the pending it saw.
ALTER TABLE "partner"."memo_out_line"
  ADD CONSTRAINT "memo_out_line_stock_check" CHECK (
    ("memo_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
    OR ("memo_stock_id" IS NOT NULL AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL
        AND "source" = 'STOCK' AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));

-- AddForeignKey
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_memo_stock_id_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_line_memo_stock_key" ON "partner"."memo_out_line"("memo_out_id", "memo_stock_id");
CREATE INDEX "memo_out_line_memo_stock_idx" ON "partner"."memo_out_line"("memo_stock_id");
CREATE INDEX "memo_out_status_idx" ON "partner"."memo_out"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "memo_stock_pending_all_idx" ON "partner"."memo_stock"("received_doc_date" DESC, "stock_id" DESC) WHERE ((pending_pcs > 0) OR (pending_weight_ct > (0)::numeric));
