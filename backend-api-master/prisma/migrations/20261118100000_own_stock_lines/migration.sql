-- load-to-stock SA revision 2 / ADR-0052 Amendment 2 D17-D20 (accepted 2026-11-18, owner "อนุมัติ UI rev phase 2 + SA rev 2"),
-- BE-LS-P2-03. Additive, schema partner only (database-diagram.md part C "Master changes"):
--   1. quotation_line / reserve_line / memo_out_line: own_stock_id (inventory stock.id; no cross-service FK), source
--      OWN_STOCK, the stock CHECK extended (a stock line names exactly one of memo_stock_id / own_stock_id), unique
--      (document, own_stock_id) and an own_stock_id index. memo_out_return_line is unchanged (it reaches our stock through
--      memo_out_line.own_stock_id).
--   2. memo_out_line_open_idx recreated so own-stock Memo Out lines appear in the Memo Outstanding picker / report.
--   3. reserve / memo_out / memo_out_return: sync_state (IDLE | SYNCING) + hold_revision, partial index on SYNCING.
--   4. inventory_sync_op: the master side of the hold saga (one active op per document).
-- No backfill: no own-stock line exists yet. Rollback (only while every own_stock_id is NULL and inventory_sync_op has no
--   PREPARED / STUCK row): drop inventory_sync_op, the sync columns and indexes, restore the phase-1 CHECKs and open index,
--   drop own_stock_id.

-- 1. Own-stock lines
ALTER TABLE "partner"."quotation_line" ADD COLUMN "own_stock_id" UUID;
ALTER TABLE "partner"."reserve_line" ADD COLUMN "own_stock_id" UUID;
ALTER TABLE "partner"."memo_out_line" ADD COLUMN "own_stock_id" UUID;

ALTER TABLE "partner"."quotation_line" DROP CONSTRAINT "quotation_line_source_check";
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_source_check" CHECK ("source" IN ('MANUAL', 'STOCK', 'OWN_STOCK'));

ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_values_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK', 'OWN_STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "partner"."memo_out_line" DROP CONSTRAINT "memo_out_line_values_check";
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK', 'OWN_STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);

-- A manual line has none of the stock columns; a stock line names exactly one item (Memo Stock or our stock), has the
-- snapshot columns and takes at most the pending / available it saw.
ALTER TABLE "partner"."quotation_line" DROP CONSTRAINT "quotation_line_stock_check";
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_stock_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."memo_out_line" DROP CONSTRAINT "memo_out_line_stock_check";
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));

CREATE UNIQUE INDEX "quotation_line_own_stock_key" ON "partner"."quotation_line" ("quotation_id", "own_stock_id");
CREATE INDEX "quotation_line_own_stock_idx" ON "partner"."quotation_line" ("own_stock_id");
CREATE UNIQUE INDEX "reserve_line_own_stock_key" ON "partner"."reserve_line" ("reserve_id", "own_stock_id");
CREATE INDEX "reserve_line_own_stock_idx" ON "partner"."reserve_line" ("own_stock_id");
CREATE UNIQUE INDEX "memo_out_line_own_stock_key" ON "partner"."memo_out_line" ("memo_out_id", "own_stock_id");
CREATE INDEX "memo_out_line_own_stock_idx" ON "partner"."memo_out_line" ("own_stock_id");

-- 2. Memo Outstanding: open lines of either stock
DROP INDEX "partner"."memo_out_line_open_idx";
CREATE INDEX "memo_out_line_open_idx" ON "partner"."memo_out_line" ("memo_out_id")
  WHERE ("memo_stock_id" IS NOT NULL OR "own_stock_id" IS NOT NULL) AND ("returned_pcs" < "pcs" OR "returned_weight_ct" < "weight_ct");

-- 3. Saga state on the holding documents
ALTER TABLE "partner"."reserve"
  ADD COLUMN "sync_state" VARCHAR(10) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "hold_revision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "reserve_sync_state_check" CHECK ("sync_state" IN ('IDLE', 'SYNCING') AND "hold_revision" >= 0);
ALTER TABLE "partner"."memo_out"
  ADD COLUMN "sync_state" VARCHAR(10) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "hold_revision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "memo_out_sync_state_check" CHECK ("sync_state" IN ('IDLE', 'SYNCING') AND "hold_revision" >= 0);
ALTER TABLE "partner"."memo_out_return"
  ADD COLUMN "sync_state" VARCHAR(10) NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "hold_revision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "memo_out_return_sync_state_check" CHECK ("sync_state" IN ('IDLE', 'SYNCING') AND "hold_revision" >= 0);
CREATE INDEX "reserve_syncing_idx" ON "partner"."reserve" ("id") WHERE "sync_state" = 'SYNCING';
CREATE INDEX "memo_out_syncing_idx" ON "partner"."memo_out" ("id") WHERE "sync_state" = 'SYNCING';
CREATE INDEX "memo_out_return_syncing_idx" ON "partner"."memo_out_return" ("id") WHERE "sync_state" = 'SYNCING';

-- 4. Saga op
CREATE TABLE "partner"."inventory_sync_op" (
  "id" UUID NOT NULL,
  "document_type" VARCHAR(20) NOT NULL,
  "document_id" UUID NOT NULL,
  "stage" VARCHAR(10) NOT NULL,
  "state" VARCHAR(10) NOT NULL DEFAULT 'PREPARED',
  "revision" INTEGER NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" SMALLINT NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "last_error" VARCHAR(64),
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "inventory_sync_op_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_sync_op_type_check" CHECK ("document_type" IN ('reserve', 'memo-out', 'memo-out-return')),
  CONSTRAINT "inventory_sync_op_stage_check" CHECK ("stage" IN ('ACQUIRE', 'RELEASE', 'COMPENSATE')),
  CONSTRAINT "inventory_sync_op_state_check" CHECK ("state" IN ('PREPARED', 'DONE', 'REFUSED', 'ABANDONED', 'STUCK')),
  CONSTRAINT "inventory_sync_op_values_check" CHECK ("revision" >= 1 AND "attempts" >= 0 AND "request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "inventory_sync_op_payload_size_check" CHECK (octet_length("payload"::text) <= 65536)
);
CREATE UNIQUE INDEX "inventory_sync_op_revision_key" ON "partner"."inventory_sync_op" ("document_type", "document_id", "revision");
CREATE UNIQUE INDEX "inventory_sync_op_active_key" ON "partner"."inventory_sync_op" ("document_type", "document_id") WHERE "state" IN ('PREPARED', 'STUCK');
CREATE INDEX "inventory_sync_op_due_idx" ON "partner"."inventory_sync_op" ("next_attempt_at") WHERE "state" = 'PREPARED';
CREATE INDEX "inventory_sync_op_finished_idx" ON "partner"."inventory_sync_op" ("updated_at") WHERE "state" IN ('DONE', 'REFUSED', 'ABANDONED');
