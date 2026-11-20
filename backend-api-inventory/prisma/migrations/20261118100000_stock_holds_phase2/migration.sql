-- load-to-stock SA revision 2 / ADR-0052 Amendment 2 D16/D18 (accepted 2026-11-18, owner "อนุมัติ UI rev phase 2 + SA rev 2"),
-- BE-LS-P2-01. Schema `inventory` only (database-diagram.md part C):
--   1. stock.ref_doc_date / ref_doc_no (the load's date and number; picker key of the one From Stock list, D16), backfilled
--      once from load_to_stock, then NOT NULL; partial index stock_picker_idx replaces stock_available_idx (no reader left).
--   2. stock_hold re-keyed per (document type, document id, stock) (D18). Phase 1 never wrote it: the migration refuses to
--      run when it holds any row. line_id is dropped; document_no added; kind must match the document type; zero rows are
--      deleted, never stored.
--   3. stock_hold_document: one row per holding document (applied revision, request hash, small result).
--   4. stock_movement kinds of the holds (deltas = on-hand change, cost 0).
-- Lot (D23) needs no change: stock.lot / load_to_stock_row.lot already exist (varchar(40) NOT NULL DEFAULT '').
-- Rollback (only while stock_hold and stock_hold_document are empty): DROP TABLE stock_hold_document; restore line_id +
--   stock_hold_line_key; restore the phase-1 kind CHECK; DROP INDEX stock_picker_idx; recreate stock_available_idx; drop the
--   two ref_doc columns.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "inventory"."stock_hold") THEN
    RAISE EXCEPTION 'inventory.stock_hold must be empty before the phase-2 re-key (phase 1 never writes it)';
  END IF;
END $$;

-- 1. Picker key -------------------------------------------------------------------------------------------------------
ALTER TABLE "inventory"."stock"
  ADD COLUMN "ref_doc_date" DATE,
  ADD COLUMN "ref_doc_no" VARCHAR(40);

UPDATE "inventory"."stock" AS s SET "ref_doc_date" = l."doc_date", "ref_doc_no" = l."doc_no"
FROM "inventory"."load_to_stock" AS l WHERE l."id" = s."load_id";

ALTER TABLE "inventory"."stock"
  ALTER COLUMN "ref_doc_date" SET NOT NULL,
  ALTER COLUMN "ref_doc_no" SET NOT NULL;

DROP INDEX "inventory"."stock_available_idx";
CREATE INDEX "stock_picker_idx" ON "inventory"."stock" ("ref_doc_date" DESC, "stock_id" DESC)
  WHERE "status" = 'ACTIVE' AND ("on_hand_pcs" > 0 OR "on_hand_weight_ct" > 0);

-- 2. Hold ledger per document --------------------------------------------------------------------------------------------
CREATE TABLE "inventory"."stock_hold_document" (
  "document_type" VARCHAR(40) NOT NULL,
  "document_id" UUID NOT NULL,
  "applied_revision" INTEGER NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "document_no" VARCHAR(40),
  "result" JSONB NOT NULL DEFAULT '{}',
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "stock_hold_document_pkey" PRIMARY KEY ("document_type", "document_id"),
  CONSTRAINT "stock_hold_document_type_check" CHECK ("document_type" IN ('reserve', 'memo-out', 'memo-out-return', 'sale')),
  CONSTRAINT "stock_hold_document_revision_check" CHECK ("applied_revision" >= 1),
  CONSTRAINT "stock_hold_document_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "stock_hold_document_result_size_check" CHECK (octet_length("result"::text) <= 16384)
);

DROP INDEX "inventory"."stock_hold_line_key";
ALTER TABLE "inventory"."stock_hold"
  DROP COLUMN "line_id",
  ADD COLUMN "document_no" VARCHAR(40),
  ADD CONSTRAINT "stock_hold_kind_type_check" CHECK (
    ("document_type" = 'reserve' AND "kind" = 'RESERVED')
    OR ("document_type" = 'memo-out' AND "kind" = 'MEMO_OUT')
    OR ("document_type" = 'memo-out-return' AND "kind" = 'MEMO_OUT_RETURN')
    OR ("document_type" = 'sale' AND "kind" = 'SOLD')),
  ADD CONSTRAINT "stock_hold_nonzero_check" CHECK ("pcs" > 0 OR "weight_ct" > 0),
  ADD CONSTRAINT "stock_hold_document_fkey" FOREIGN KEY ("document_type", "document_id")
    REFERENCES "inventory"."stock_hold_document" ("document_type", "document_id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "stock_hold_doc_stock_key" ON "inventory"."stock_hold" ("document_type", "document_id", "stock_uuid");

-- 4. Ledger kinds ---------------------------------------------------------------------------------------------------------
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL'));

-- Grants (as the init migration): DML on the new table for the app role; the ledger stays append-only.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory"."stock_hold_document" TO gms_inventory_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "inventory"."stock_movement" FROM gms_inventory_app;
  END IF;
END $$;
