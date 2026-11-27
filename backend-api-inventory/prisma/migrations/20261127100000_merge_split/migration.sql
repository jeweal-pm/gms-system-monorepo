-- merge-split SA rev 1 / ADR-0060 (merge-split own stock) D2/D9/D14, BE-MS-001, owner approval 2026-11-27.
-- Additive only; no existing row is rewritten and `stock` keeps every column (results reuse pcs / on_hand / consumed and the
-- generated lot_key / card_key / item_key).
--   1. merge_split (document), merge_split_source (picked own stock + on-hand snapshot = take), merge_split_result (new stock
--      details; stock_uuid / stock_id / applied_version once applied), merge_split_result_photo (stored_file references).
--   2. stock_movement_kind_check: the latest list + SPLIT_OUT / SPLIT_IN / SPLIT_REVERSAL / MERGE_OUT / MERGE_IN / MERGE_REVERSAL.
--   3. approval_setting 'merge-split' already exists (init migration): unchanged.
-- Rollback: prisma/rollback/20261127100000_merge_split.down.sql (refuses once a Merge/Split was applied).

-- 1. Document.
CREATE TABLE "inventory"."merge_split" (
  "id" UUID NOT NULL,
  "numbering_id" UUID,
  "running_no" INTEGER NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "doc_date" DATE NOT NULL,
  "mode" VARCHAR(5) NOT NULL,
  "ref" VARCHAR(100) NOT NULL DEFAULT '',
  "note" VARCHAR(250) NOT NULL DEFAULT '',
  "status" VARCHAR(20) NOT NULL,
  "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  "revision_count" SMALLINT NOT NULL DEFAULT 0,
  "apply_seq" INTEGER NOT NULL DEFAULT 0,
  "source_count" SMALLINT NOT NULL DEFAULT 0,
  "result_count" SMALLINT NOT NULL DEFAULT 0,
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
  CONSTRAINT "merge_split_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merge_split_mode_check" CHECK ("mode" IN ('SPLIT', 'MERGE')),
  CONSTRAINT "merge_split_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "merge_split_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1),
  CONSTRAINT "merge_split_apply_seq_check" CHECK ("apply_seq" >= 0),
  CONSTRAINT "merge_split_version_check" CHECK ("version" >= 1),
  CONSTRAINT "merge_split_running_no_check" CHECK ("running_no" >= 1),
  CONSTRAINT "merge_split_totals_check" CHECK ("source_count" BETWEEN 0 AND 200 AND "result_count" BETWEEN 0 AND 200 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  CONSTRAINT "merge_split_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL)),
  CONSTRAINT "merge_split_review_check" CHECK (
    ("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  CONSTRAINT "merge_split_submitted_check" CHECK ("submitted_at" IS NULL OR ("status" <> 'DRAFT' AND NOT "auto_approved")),
  CONSTRAINT "merge_split_applied_check" CHECK (("status" = 'APPROVED') = ("applied_at" IS NOT NULL) OR "deleted_at" IS NOT NULL)
);
-- Gap-free running number per Document Setup row (ADR-0052 D10 pattern) and a unique document number.
CREATE UNIQUE INDEX "merge_split_running_no_key" ON "inventory"."merge_split" ("numbering_id", "running_no") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "merge_split_doc_no_key" ON "inventory"."merge_split" ("doc_no");
-- Daybook (newest first), deleted list, Approve Center / approval-setting counts.
CREATE INDEX "merge_split_list_idx" ON "inventory"."merge_split" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL;
CREATE INDEX "merge_split_deleted_idx" ON "inventory"."merge_split" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "merge_split_pending_idx" ON "inventory"."merge_split" ("submitted_at", "id") WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL;
CREATE INDEX "merge_split_revision_idx" ON "inventory"."merge_split" ("id") WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL;

-- Picked own stock (whole on hand at pick time = take, SA-MS-03).
CREATE TABLE "inventory"."merge_split_source" (
  "id" UUID NOT NULL,
  "merge_split_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "client_key" VARCHAR(40) NOT NULL,
  "stock_uuid" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "avail_pcs" INTEGER NOT NULL,
  "avail_weight_ct" DECIMAL(12,3) NOT NULL,
  "price_unit" VARCHAR(10) NOT NULL,
  "unit_cost_base" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "take_cost_base" DECIMAL(18,2) NOT NULL DEFAULT 0,
  CONSTRAINT "merge_split_source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merge_split_source_doc_fkey" FOREIGN KEY ("merge_split_id") REFERENCES "inventory"."merge_split" ("id") ON DELETE CASCADE,
  CONSTRAINT "merge_split_source_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "merge_split_source_position_check" CHECK ("position" BETWEEN 1 AND 200),
  CONSTRAINT "merge_split_source_qty_check" CHECK ("avail_pcs" >= 1 AND "avail_weight_ct" >= 0),
  CONSTRAINT "merge_split_source_money_check" CHECK ("unit_cost_base" >= 0 AND "take_cost_base" >= 0),
  CONSTRAINT "merge_split_source_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS'))
);
CREATE UNIQUE INDEX "merge_split_source_stock_key" ON "inventory"."merge_split_source" ("merge_split_id", "stock_uuid");
CREATE UNIQUE INDEX "merge_split_source_position_key" ON "inventory"."merge_split_source" ("merge_split_id", "position");
CREATE UNIQUE INDEX "merge_split_source_client_key" ON "inventory"."merge_split_source" ("merge_split_id", "client_key");
-- The Pending exclusion of the From Stock picker / submit (SA-MS-04, SA-MS-14).
CREATE INDEX "merge_split_source_stock_idx" ON "inventory"."merge_split_source" ("stock_uuid");

-- New stock details (server-computed cost, SA-MS-05).
CREATE TABLE "inventory"."merge_split_result" (
  "id" UUID NOT NULL,
  "merge_split_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "source_id" UUID,
  "stone_code_id" UUID,
  "stone_code" VARCHAR(60) NOT NULL DEFAULT '',
  "stone" VARCHAR(60) NOT NULL DEFAULT '',
  "shape" VARCHAR(60) NOT NULL DEFAULT '',
  "size" VARCHAR(60) NOT NULL DEFAULT '',
  "color" VARCHAR(60) NOT NULL DEFAULT '',
  "clarity" VARCHAR(60) NOT NULL DEFAULT '',
  "cutting" VARCHAR(60) NOT NULL DEFAULT '',
  "quality" VARCHAR(60) NOT NULL DEFAULT '',
  "cer_type" VARCHAR(20) NOT NULL DEFAULT '',
  "cer_no" VARCHAR(60) NOT NULL DEFAULT '',
  "location" VARCHAR(40) NOT NULL,
  "lot" VARCHAR(40) NOT NULL DEFAULT '',
  "parcel" VARCHAR(50) NOT NULL DEFAULT '',
  "price_unit" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "unit_cost_base" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "cost_amount_base" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "stock_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "sale_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "item_note" VARCHAR(500) NOT NULL DEFAULT '',
  "stock_uuid" UUID,
  "stock_id" VARCHAR(10),
  "applied_version" INTEGER,
  CONSTRAINT "merge_split_result_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merge_split_result_doc_fkey" FOREIGN KEY ("merge_split_id") REFERENCES "inventory"."merge_split" ("id") ON DELETE CASCADE,
  CONSTRAINT "merge_split_result_source_fkey" FOREIGN KEY ("source_id") REFERENCES "inventory"."merge_split_source" ("id") ON DELETE CASCADE,
  CONSTRAINT "merge_split_result_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "merge_split_result_position_check" CHECK ("position" BETWEEN 1 AND 200),
  CONSTRAINT "merge_split_result_qty_check" CHECK ("pcs" >= 1 AND "weight_ct" >= 0),
  CONSTRAINT "merge_split_result_money_check" CHECK ("unit_cost_base" >= 0 AND "cost_amount_base" >= 0 AND "stock_price" >= 0 AND "sale_price" >= 0),
  CONSTRAINT "merge_split_result_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS')),
  CONSTRAINT "merge_split_result_location_check" CHECK (char_length(btrim("location")) BETWEEN 1 AND 40),
  CONSTRAINT "merge_split_result_applied_check" CHECK (("stock_uuid" IS NULL) = ("applied_version" IS NULL) AND ("stock_uuid" IS NULL) = ("stock_id" IS NULL))
);
CREATE UNIQUE INDEX "merge_split_result_position_key" ON "inventory"."merge_split_result" ("merge_split_id", "position");
CREATE UNIQUE INDEX "merge_split_result_stock_key" ON "inventory"."merge_split_result" ("stock_uuid") WHERE "stock_uuid" IS NOT NULL;
CREATE INDEX "merge_split_result_source_idx" ON "inventory"."merge_split_result" ("source_id") WHERE "source_id" IS NOT NULL;

CREATE TABLE "inventory"."merge_split_result_photo" (
  "result_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "merge_split_result_photo_pkey" PRIMARY KEY ("result_id", "position"),
  CONSTRAINT "merge_split_result_photo_result_fkey" FOREIGN KEY ("result_id") REFERENCES "inventory"."merge_split_result" ("id") ON DELETE CASCADE,
  CONSTRAINT "merge_split_result_photo_file_fkey" FOREIGN KEY ("file_id") REFERENCES "inventory"."stored_file" ("id") ON DELETE RESTRICT,
  CONSTRAINT "merge_split_result_photo_position_check" CHECK ("position" BETWEEN 1 AND 5)
);
CREATE INDEX "merge_split_result_photo_file_idx" ON "inventory"."merge_split_result_photo" ("file_id");

-- 2. Ledger kinds: the full latest list (20261124120000_stock_transfer_location) + the six Merge/Split kinds (all <= 32 chars).
ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL',
  'ADJUST', 'ADJUST_REVERSAL',
  'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_OUT_REVERSAL', 'TRANSFER_IN_REVERSAL',
  'SPLIT_OUT', 'SPLIT_IN', 'SPLIT_REVERSAL', 'MERGE_OUT', 'MERGE_IN', 'MERGE_REVERSAL'));

-- 3. Approval type row: present since the init migration (default ON); kept as is.
INSERT INTO "inventory"."approval_setting" ("type", "require_approval") VALUES ('merge-split', true) ON CONFLICT ("type") DO NOTHING;

-- Grants as in the earlier migrations (skipped where the role does not exist).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory"."merge_split", "inventory"."merge_split_source", "inventory"."merge_split_result",
      "inventory"."merge_split_result_photo" TO gms_inventory_app;
  END IF;
END $$;
