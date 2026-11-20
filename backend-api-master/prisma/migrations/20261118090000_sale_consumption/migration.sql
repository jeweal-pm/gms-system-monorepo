-- sale SA revision 1 / ADR-0054 (accepted 2026-11-18, owner "อนุมัติทั้งสอง"), BE-SL-001.
-- Expand-only for api-master (inventory/sale database-diagram.md part B):
--   1. reserve_line.sold_pcs / sold_weight_ct (DEFAULT 0: no Sale exists, so no backfill) + CHECK reserve_line_sold_check
--      (0 ≤ sold ≤ line qty; manual lines never sold) + partial index reserve_line_open_idx (open stock lines).
--   2. reserve_open_customer_idx: approved, live Reserves per customer + currency (From Reserve picker, ADR-0054 D4).
--   3. sale_consumption (one per inventory Sale: applied revision, request hash, result) and sale_consumption_line (the
--      Sale's applied quantity per line; Σ per Reserve line = reserve_line.sold_*, Memo Stock moves via memo_stock.sold).
-- No cross-schema foreign key: sale_id / line_id are inventory ids, validated by the internal API only.
-- memo_stock_balance and memo_stock_purchased_check are unchanged and enforce the bucket moves.
-- Rollback: prisma/rollback/20261118090000_sale_consumption.down.sql (refuses while any consumption line exists).

-- 1. Reserve line sold quantity
ALTER TABLE "partner"."reserve_line"
  ADD COLUMN "sold_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sold_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_sold_check" CHECK (
  "sold_pcs" BETWEEN 0 AND "pcs"
  AND "sold_weight_ct" >= 0 AND "sold_weight_ct" <= "weight_ct"
  AND ("memo_stock_id" IS NOT NULL OR ("sold_pcs" = 0 AND "sold_weight_ct" = 0))
);

CREATE INDEX "reserve_line_open_idx" ON "partner"."reserve_line" ("reserve_id", "position")
  WHERE "memo_stock_id" IS NOT NULL AND ("sold_pcs" < "pcs" OR "sold_weight_ct" < "weight_ct");

-- 2. From Reserve picker
CREATE INDEX "reserve_open_customer_idx" ON "partner"."reserve" ("customer_id", "currency_code", "doc_date", "id")
  WHERE "status" = 'APPROVED' AND "deleted_at" IS NULL;

-- 3. Consumption ledger
CREATE TABLE "partner"."sale_consumption" (
  "sale_id" UUID NOT NULL,
  "sale_doc_no" VARCHAR(40) NOT NULL,
  "customer_id" UUID NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "request_hash" CHAR(64) NOT NULL DEFAULT '',
  "result" JSONB NOT NULL DEFAULT '{}',
  "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_by" VARCHAR(64),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_consumption_pkey" PRIMARY KEY ("sale_id"),
  CONSTRAINT "sale_consumption_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "sale_consumption_hash_check" CHECK ("request_hash" = '' OR "request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sale_consumption_result_size_check" CHECK (octet_length("result"::text) <= 32768)
);

CREATE TABLE "partner"."sale_consumption_line" (
  "sale_id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "source" VARCHAR(10) NOT NULL,
  "reserve_line_id" UUID,
  "memo_stock_id" UUID NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "sale_consumption_line_pkey" PRIMARY KEY ("sale_id", "line_id"),
  CONSTRAINT "sale_consumption_line_source_check" CHECK (
    ("source" = 'RESERVE' AND "reserve_line_id" IS NOT NULL) OR ("source" = 'STOCK' AND "reserve_line_id" IS NULL)
  ),
  CONSTRAINT "sale_consumption_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0),
  CONSTRAINT "sale_consumption_line_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "partner"."sale_consumption" ("sale_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_consumption_line_reserve_line_fkey" FOREIGN KEY ("reserve_line_id") REFERENCES "partner"."reserve_line" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_consumption_line_memo_stock_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "sale_consumption_line_reserve_line_idx" ON "partner"."sale_consumption_line" ("reserve_line_id");
CREATE INDEX "sale_consumption_line_memo_stock_idx" ON "partner"."sale_consumption_line" ("memo_stock_id");
CREATE UNIQUE INDEX "sale_consumption_line_reserve_line_key" ON "partner"."sale_consumption_line" ("sale_id", "reserve_line_id") WHERE "reserve_line_id" IS NOT NULL;
