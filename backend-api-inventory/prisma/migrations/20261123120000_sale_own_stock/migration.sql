-- sale-own-stock SA rev 1 / ADR-0058 D10 (BE-SO-001). Additive only; no existing row is rewritten.
--   1. sale_line: a third source OWN_STOCK (an own-stock lot, lot_key OS* / OL*) with the newest Load reference (load_id / load_doc_no).
--   2. sale_line_alloc: the per-Stock-ID FIFO allocation of an own line (own_stock_uuid -> stock); memo_stock_id becomes nullable
--      (exactly one of the two keys); this is what a void / edit / delete reverses exactly.
--   3. stock_movement_kind_check: SALE_OUT (on-hand -> sold) and SALE_OUT_REVERSAL (the opposite); append-only ledger unchanged.
-- Rollback: prisma/rollback/20261123120000_sale_own_stock.down.sql (refuses once an own-stock line / allocation / SALE_OUT row exists).

-- 1. Sale lines.
ALTER TABLE "inventory"."sale_line" ADD COLUMN "load_id" UUID, ADD COLUMN "load_doc_no" VARCHAR(40);
ALTER TABLE "inventory"."sale_line" DROP CONSTRAINT "sale_line_source_check";
ALTER TABLE "inventory"."sale_line" ADD CONSTRAINT "sale_line_source_check" CHECK (
  ("source" = 'RESERVE' AND "reserve_line_id" IS NOT NULL AND "reserve_id" IS NOT NULL)
  OR ("source" = 'STOCK' AND "reserve_line_id" IS NULL AND "reserve_id" IS NULL)
  OR ("source" = 'OWN_STOCK' AND "reserve_line_id" IS NULL AND "reserve_id" IS NULL));
ALTER TABLE "inventory"."sale_line" DROP CONSTRAINT "sale_line_stock_ref_check";
ALTER TABLE "inventory"."sale_line" ADD CONSTRAINT "sale_line_stock_ref_check" CHECK (
  ("memo_stock_id" IS NOT NULL AND "lot_key" IS NULL AND "stock_count" IS NULL)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NOT NULL AND "lot_key" LIKE 'M%' AND "source" = 'STOCK' AND "stock_count" IS NOT NULL AND "stock_count" >= 1)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NOT NULL AND "lot_key" LIKE 'O%' AND "source" = 'OWN_STOCK' AND "stock_count" IS NOT NULL AND "stock_count" >= 1 AND "load_id" IS NOT NULL)
  OR ("memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'RESERVE'));
CREATE UNIQUE INDEX "sale_line_own_lot_key" ON "inventory"."sale_line" ("sale_id", "lot_key") WHERE "source" = 'OWN_STOCK';

-- 2. Allocation of an own line to Stock IDs.
ALTER TABLE "inventory"."sale_line_alloc" ALTER COLUMN "memo_stock_id" DROP NOT NULL;
ALTER TABLE "inventory"."sale_line_alloc" ADD COLUMN "own_stock_uuid" UUID;
ALTER TABLE "inventory"."sale_line_alloc" ADD CONSTRAINT "sale_line_alloc_own_stock_fkey" FOREIGN KEY ("own_stock_uuid") REFERENCES "inventory"."stock" ("id");
ALTER TABLE "inventory"."sale_line_alloc" ADD CONSTRAINT "sale_line_alloc_ref_check" CHECK (("memo_stock_id" IS NOT NULL) <> ("own_stock_uuid" IS NOT NULL));
CREATE UNIQUE INDEX "sale_line_alloc_own_stock_key" ON "inventory"."sale_line_alloc" ("sale_line_id", "own_stock_uuid") WHERE "own_stock_uuid" IS NOT NULL;
CREATE INDEX "sale_line_alloc_own_stock_idx" ON "inventory"."sale_line_alloc" ("own_stock_uuid") WHERE "own_stock_uuid" IS NOT NULL;

-- 3. Ledger kinds.
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL'));
-- Grants: unchanged (table-level DML for the app role already covers the new columns; the ledger stays append-only).
