-- memo-outstanding-vendor SA revision 1 / ADR-0035 SA-MOV-02 (owner 2026-10-29: "อนุมัติ memo-outstanding-vendor revision 1").
-- Additive: bucket counters on memo_stock. Every existing row backfills to 0, so pending = received still holds
-- (no writer has reduced pending yet) and both CHECKs validate immediately.
-- Rollback (safe while no writer uses the buckets; revision 1 has none):
--   DROP INDEX "partner"."memo_stock_open_idx";
--   ALTER TABLE "partner"."memo_stock" DROP CONSTRAINT "memo_stock_balance", DROP CONSTRAINT "memo_stock_buckets_nonneg",
--     DROP COLUMN "returned_pcs", DROP COLUMN "returned_weight_ct", DROP COLUMN "sold_pcs", DROP COLUMN "sold_weight_ct",
--     DROP COLUMN "reserved_pcs", DROP COLUMN "reserved_weight_ct";

-- AlterTable
ALTER TABLE "partner"."memo_stock"
  ADD COLUMN "returned_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "returned_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "sold_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sold_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "reserved_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reserved_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Value checks (database-diagram.md): every bucket >= 0, and Return + Sold + Reserve + Outstanding = Memo (Q-MOV-02).
ALTER TABLE "partner"."memo_stock"
  ADD CONSTRAINT "memo_stock_buckets_nonneg" CHECK ("returned_pcs" >= 0 AND "returned_weight_ct" >= 0 AND "sold_pcs" >= 0
    AND "sold_weight_ct" >= 0 AND "reserved_pcs" >= 0 AND "reserved_weight_ct" >= 0),
  ADD CONSTRAINT "memo_stock_balance" CHECK ("pending_pcs" = "received_pcs" - "returned_pcs" - "sold_pcs" - "reserved_pcs"
    AND "pending_weight_ct" = "received_weight_ct" - "returned_weight_ct" - "sold_weight_ct" - "reserved_weight_ct");

-- CreateIndex
CREATE INDEX "memo_stock_open_idx" ON "partner"."memo_stock"("memo_receive_id") WHERE ((pending_pcs > 0) OR (pending_weight_ct > (0)::numeric) OR (reserved_pcs > 0) OR (reserved_weight_ct > (0)::numeric));
