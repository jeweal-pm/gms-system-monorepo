-- INV-20261029-004: Purchase Outstanding (SA-POS-03) prunes documents with no balance before grouping, through an
-- EXISTS on this partial index (same predicate as the service's PU_HAS_BALANCE), as Memo Outstanding uses
-- memo_stock_open_idx and From Customer memo_out_line_open_idx. The expression statistics give the planner the real
-- share of items with a balance (without them it assumes 1/3 and hash-joins every memo_stock row; measured on a
-- 50,000-row seed: 26 ms → 5.6 ms). Expand only: one index and one statistics object, no row or contract change.
-- Rollback: DROP STATISTICS "partner"."memo_stock_balance_stats"; DROP INDEX "partner"."memo_stock_balance_open_idx".
CREATE INDEX "memo_stock_balance_open_idx" ON "partner"."memo_stock"("memo_receive_id")
  WHERE (("received_pcs" - "returned_pcs" - "purchased_pcs") > 0 OR ("received_weight_ct" - "returned_weight_ct" - "purchased_weight_ct") > 0);

CREATE STATISTICS "partner"."memo_stock_balance_stats"
  ON (("received_pcs" - "returned_pcs" - "purchased_pcs")), (("received_weight_ct" - "returned_weight_ct" - "purchased_weight_ct"))
  FROM "partner"."memo_stock";
