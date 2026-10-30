-- memo-out-return UI rev 3 (owner 2026-10-28): each line keeps the Outstanding quantity it was picked with;
-- pcs / weight_ct are the quantity returned now and may not exceed it.
-- Rollback: ALTER TABLE "partner"."memo_out_return_line" DROP CONSTRAINT "memo_out_return_line_outstanding_check",
--   DROP COLUMN "outstanding_pcs", DROP COLUMN "outstanding_weight_ct".
ALTER TABLE "partner"."memo_out_return_line"
  ADD COLUMN "outstanding_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "outstanding_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Lines saved before this revision had no outstanding quantity: treat what they return as outstanding.
UPDATE "partner"."memo_out_return_line" SET "outstanding_pcs" = "pcs", "outstanding_weight_ct" = "weight_ct";

ALTER TABLE "partner"."memo_out_return_line"
  ADD CONSTRAINT "memo_out_return_line_outstanding_check"
  CHECK ("pcs" <= "outstanding_pcs" AND "weight_ct" <= "outstanding_weight_ct");
