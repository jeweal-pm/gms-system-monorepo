-- load-to-stock SA revision 1 / ADR-0052 (accepted 2026-11-17, owner "อนุมัติ UI rev 1 + ADR-0052 + SA rev 1"), BE-LS-002.
-- Expand-only for api-master (database-diagram.md part B):
--   1. purchase_line.loaded_pcs / loaded_weight_ct (DEFAULT 0: nothing was ever loaded, so no backfill) + CHECK
--      purchase_line_loaded_check + partial index purchase_line_loadable_idx (remaining pcs > 0, non-STOCK lines).
--   2. load_allocation (one per inventory Load to Stock document, idempotent revision + request hash + result),
--      load_allocation_line (the document's current allocation per purchase line), load_stock_id (every Stock ID issued
--      for a load; never reused, kept forever).
--   3. document_numbering.external_used_at: a numbering row used by an inventory document is "used" (locked) as well.
--   4. approval_setting: the three inventory types move to inventory.approval_setting (ADR-0052 D8, Q-LS-25 default):
--      their (inactive) rows are deleted and the type CHECK narrowed to the eight master document types.
-- No cross-schema foreign key: load_document_id is the inventory document id, validated by the internal API only.
-- Rollback: prisma/rollback/20261117090000_load_to_stock_allocation.down.sql (refuses while any allocation line exists).

-- 1. Purchase remaining
ALTER TABLE "partner"."purchase_line"
  ADD COLUMN "loaded_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "loaded_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_loaded_check" CHECK (
  "loaded_pcs" >= 0 AND "loaded_pcs" <= "pcs"
  AND "loaded_weight_ct" >= 0 AND "loaded_weight_ct" <= "weight_ct"
  AND ("source" <> 'STOCK' OR ("loaded_pcs" = 0 AND "loaded_weight_ct" = 0))
);

-- The Load to Stock picker: lines with remaining pcs > 0 (owner Q-LS-26: a pcs-0 line is never loadable).
CREATE INDEX "purchase_line_loadable_idx" ON "partner"."purchase_line" ("purchase_id", "position")
  WHERE "source" <> 'STOCK' AND "pcs" > "loaded_pcs";

-- 2. Allocation ledger
CREATE TABLE "partner"."load_allocation" (
  "load_document_id" UUID NOT NULL,
  "vendor_id" UUID NOT NULL,
  "applied_revision" INTEGER NOT NULL DEFAULT 0,
  "request_hash" CHAR(64) NOT NULL DEFAULT '',
  "result" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64),
  CONSTRAINT "load_allocation_pkey" PRIMARY KEY ("load_document_id"),
  CONSTRAINT "load_allocation_revision_check" CHECK ("applied_revision" >= 0),
  CONSTRAINT "load_allocation_hash_check" CHECK ("request_hash" = '' OR "request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "load_allocation_result_size_check" CHECK (octet_length("result"::text) <= 16384)
);

CREATE TABLE "partner"."load_allocation_line" (
  "load_document_id" UUID NOT NULL,
  "purchase_line_id" UUID NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "load_allocation_line_pkey" PRIMARY KEY ("load_document_id", "purchase_line_id"),
  CONSTRAINT "load_allocation_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND NOT ("pcs" = 0 AND "weight_ct" = 0)),
  CONSTRAINT "load_allocation_line_allocation_fkey" FOREIGN KEY ("load_document_id") REFERENCES "partner"."load_allocation" ("load_document_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_allocation_line_purchase_line_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "partner"."purchase_line" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "load_allocation_line_purchase_line_idx" ON "partner"."load_allocation_line" ("purchase_line_id");

CREATE TABLE "partner"."load_stock_id" (
  "stock_id" VARCHAR(10) NOT NULL,
  "load_document_id" UUID NOT NULL,
  "issued_revision" INTEGER NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "load_stock_id_pkey" PRIMARY KEY ("stock_id"),
  CONSTRAINT "load_stock_id_revision_check" CHECK ("issued_revision" >= 1),
  CONSTRAINT "load_stock_id_allocation_fkey" FOREIGN KEY ("load_document_id") REFERENCES "partner"."load_allocation" ("load_document_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "load_stock_id_load_idx" ON "partner"."load_stock_id" ("load_document_id");

-- 3. Document Setup: used by an inventory document
ALTER TABLE "partner"."document_numbering" ADD COLUMN "external_used_at" TIMESTAMPTZ(3);

-- 4. Approval setting: inventory types leave master (they were inactive: no document type used them)
DELETE FROM "partner"."approval_setting" WHERE "type" IN ('load-to-stock', 'merge-split', 'stock-transfer-location');
ALTER TABLE "partner"."approval_setting" DROP CONSTRAINT "approval_setting_type_check";
ALTER TABLE "partner"."approval_setting" ADD CONSTRAINT "approval_setting_type_check" CHECK ("type" IN ('quotation', 'reserve', 'memo-receive', 'memo-return', 'memo-out', 'memo-out-return', 'purchase-order', 'purchase'));
