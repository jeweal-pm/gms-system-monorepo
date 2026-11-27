-- stock-transfer-location SA rev 1 / ADR-0060 D2/D4/D8 (BE-STL-001), accepted 2026-11-24 (owner "อนุมัติ"). Additive only; no
-- existing row is rewritten.
--   1. stock.transferred_from_uuid: the source stock of a row created by a transfer (every transfer creates a NEW Stock ID, D3).
--   2. stock_transfer (document) + stock_transfer_line (one own lot = one source stock per row, unique per document).
--   3. stock_movement.kind VARCHAR(20 → 32) + stock_movement_kind_check: TRANSFER_OUT / TRANSFER_IN and their reversals (append-only ledger unchanged).
--   4. approval_setting_type_check already allows 'stock-transfer-location' (init + sale migrations) and its row exists: unchanged.
-- Rollback: prisma/rollback/20261124120000_stock_transfer_location.down.sql (refuses once a transfer was applied).

-- 1. Origin of a transferred stock row.
ALTER TABLE "inventory"."stock" ADD COLUMN "transferred_from_uuid" UUID;
ALTER TABLE "inventory"."stock" ADD CONSTRAINT "stock_transferred_from_fkey" FOREIGN KEY ("transferred_from_uuid") REFERENCES "inventory"."stock" ("id");
CREATE INDEX "stock_transferred_from_idx" ON "inventory"."stock" ("transferred_from_uuid") WHERE "transferred_from_uuid" IS NOT NULL;

-- 2. Document.
CREATE TABLE "inventory"."stock_transfer" (
  "id" UUID NOT NULL,
  "numbering_id" UUID,
  "running_no" INTEGER NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "doc_date" DATE NOT NULL,
  "ref" VARCHAR(100) NOT NULL DEFAULT '',
  "note" VARCHAR(250) NOT NULL DEFAULT '',
  "status" VARCHAR(20) NOT NULL,
  "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  "revision_count" SMALLINT NOT NULL DEFAULT 0,
  "applied_revision" INTEGER NOT NULL DEFAULT 0,
  "line_count" SMALLINT NOT NULL DEFAULT 0,
  "total_pcs" INTEGER NOT NULL DEFAULT 0,
  "total_weight_ct" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMPTZ(3),
  "submitted_by" VARCHAR(64),
  "submitted_by_name" VARCHAR(200),
  "review_action" VARCHAR(10),
  "review_note" VARCHAR(500),
  "reviewed_at" TIMESTAMPTZ(3),
  "reviewed_by" VARCHAR(64),
  "reviewed_by_name" VARCHAR(200),
  "approved_at" TIMESTAMPTZ(3),
  "approved_by" VARCHAR(64),
  "applied_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ(3),
  "deleted_by" VARCHAR(64),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" VARCHAR(64) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "stock_transfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfer_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "stock_transfer_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1),
  CONSTRAINT "stock_transfer_applied_revision_check" CHECK ("applied_revision" >= 0),
  CONSTRAINT "stock_transfer_version_check" CHECK ("version" >= 1),
  CONSTRAINT "stock_transfer_running_no_check" CHECK ("running_no" >= 1),
  CONSTRAINT "stock_transfer_totals_check" CHECK ("line_count" BETWEEN 0 AND 200 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  CONSTRAINT "stock_transfer_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL)),
  CONSTRAINT "stock_transfer_review_check" CHECK (
    ("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  CONSTRAINT "stock_transfer_submitted_check" CHECK ("submitted_at" IS NULL OR ("status" <> 'DRAFT' AND NOT "auto_approved")),
  CONSTRAINT "stock_transfer_applied_check" CHECK (("status" = 'APPROVED') = ("applied_at" IS NOT NULL) OR "deleted_at" IS NOT NULL)
);
-- Gap-free running number per Document Setup row (NULL = not configured: plain numbers), ADR-0052 D10 pattern.
CREATE UNIQUE INDEX "stock_transfer_running_no_key" ON "inventory"."stock_transfer" ("numbering_id", "running_no") NULLS NOT DISTINCT;
-- Daybook (newest first) and the Approve Center / approval-setting counts.
CREATE INDEX "stock_transfer_daybook_idx" ON "inventory"."stock_transfer" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL;
CREATE INDEX "stock_transfer_deleted_idx" ON "inventory"."stock_transfer" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "stock_transfer_pending_idx" ON "inventory"."stock_transfer" ("submitted_at", "id") WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL;
CREATE INDEX "stock_transfer_revision_idx" ON "inventory"."stock_transfer" ("id") WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL;

CREATE TABLE "inventory"."stock_transfer_line" (
  "id" UUID NOT NULL,
  "transfer_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "from_stock_uuid" UUID NOT NULL,
  "from_location" VARCHAR(40) NOT NULL,
  "on_hand_pcs" INTEGER NOT NULL,
  "on_hand_weight_ct" DECIMAL(12,3) NOT NULL,
  "to_location" VARCHAR(40) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "new_stock_uuid" UUID,
  "applied_from_version" INTEGER,
  "remark" VARCHAR(250) NOT NULL DEFAULT '',
  CONSTRAINT "stock_transfer_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_transfer_line_transfer_fkey" FOREIGN KEY ("transfer_id") REFERENCES "inventory"."stock_transfer" ("id") ON DELETE CASCADE,
  CONSTRAINT "stock_transfer_line_from_stock_fkey" FOREIGN KEY ("from_stock_uuid") REFERENCES "inventory"."stock" ("id"),
  CONSTRAINT "stock_transfer_line_new_stock_fkey" FOREIGN KEY ("new_stock_uuid") REFERENCES "inventory"."stock" ("id"),
  CONSTRAINT "stock_transfer_line_position_check" CHECK ("position" BETWEEN 1 AND 200),
  CONSTRAINT "stock_transfer_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)
    AND "on_hand_pcs" >= 0 AND "on_hand_weight_ct" >= 0),
  CONSTRAINT "stock_transfer_line_location_check" CHECK (btrim("to_location") <> '' AND upper(btrim("to_location")) <> upper(btrim("from_location"))),
  CONSTRAINT "stock_transfer_line_applied_check" CHECK (("new_stock_uuid" IS NULL) = ("applied_from_version" IS NULL))
);
-- One lot per row (ADR-0060 D2 / D13).
CREATE UNIQUE INDEX "stock_transfer_line_from_key" ON "inventory"."stock_transfer_line" ("transfer_id", "from_stock_uuid");
CREATE UNIQUE INDEX "stock_transfer_line_position_key" ON "inventory"."stock_transfer_line" ("transfer_id", "position");
CREATE INDEX "stock_transfer_line_from_stock_idx" ON "inventory"."stock_transfer_line" ("from_stock_uuid");
CREATE INDEX "stock_transfer_line_new_stock_idx" ON "inventory"."stock_transfer_line" ("new_stock_uuid") WHERE "new_stock_uuid" IS NOT NULL;

-- 3. Ledger kinds (the full list: Load, holds, Sale, Transfer). The column widens 20 → 32 first: 'TRANSFER_OUT_REVERSAL' has 21
--    characters (and the already-allowed 'MEMO_OUT_RETURN_REVERSAL' 24). A varchar length increase is metadata-only (no rewrite).
ALTER TABLE "inventory"."stock_movement" ALTER COLUMN "kind" TYPE VARCHAR(32);
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL',
  -- stock-adjustment (ADR-0059, 20261124120000_stock_adjustment runs first in lexical order): keep its kinds.
  'ADJUST', 'ADJUST_REVERSAL',
  'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_OUT_REVERSAL', 'TRANSFER_IN_REVERSAL'));

-- 4. Approval type: present since the init migration (default ON); kept as is.
INSERT INTO "inventory"."approval_setting" ("type", "require_approval") VALUES ('stock-transfer-location', true) ON CONFLICT ("type") DO NOTHING;

-- Grants as in the earlier migrations: normally covered by the migrator's default privileges; repeated so the app role gets
-- exactly DML on the new tables. Skipped where the role does not exist (local superuser setups).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory"."stock_transfer", "inventory"."stock_transfer_line" TO gms_inventory_app;
  END IF;
END $$;
