-- stock-transfer-location ADR-0060 D6 (BE-STL-002): Stock IDs issued to an inventory document that is not a Load to Stock
-- (first user: Stock Transfer Location). One row per (document type, document id, revision) keeps the ids issued for that
-- revision, so `PUT /internal/v1/inventory/stock-id-issues/{documentType}/{documentId}` replays the same ids for the same
-- revision. Ids come from the one Stock ID counter (memo_stock_id_counter, ADR-0052 D5) and are never reused; ids of an
-- abandoned revision stay here (gaps are allowed). No cross-schema foreign key: document_id is the inventory document id.
-- Additive only. Rollback: prisma/rollback/20261124120000_stock_id_issue.down.sql.
CREATE TABLE "partner"."stock_id_issue" (
  "document_type" VARCHAR(40) NOT NULL,
  "document_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "stock_ids" VARCHAR(10)[] NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64),
  CONSTRAINT "stock_id_issue_pkey" PRIMARY KEY ("document_type", "document_id", "revision"),
  CONSTRAINT "stock_id_issue_type_check" CHECK ("document_type" IN ('stock-transfer-location')),
  CONSTRAINT "stock_id_issue_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "stock_id_issue_count_check" CHECK (cardinality("stock_ids") BETWEEN 1 AND 200)
);
