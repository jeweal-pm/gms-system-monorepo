-- Stock Adjustment SA rev 1 / ADR-0059 (BE-SAJ-001). Additive; stock itself is unchanged.
CREATE TABLE "inventory"."stock_adjustment" (
  "id" UUID NOT NULL,
  "numbering_id" UUID,
  "running_no" INTEGER NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "doc_date" DATE NOT NULL,
  "location" VARCHAR(40) NOT NULL,
  "ref" VARCHAR(100) NOT NULL DEFAULT '',
  "note" VARCHAR(250) NOT NULL DEFAULT '',
  "status" VARCHAR(20) NOT NULL,
  "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  "revision_count" SMALLINT NOT NULL DEFAULT 0,
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
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_adjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustment_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "stock_adjustment_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1),
  CONSTRAINT "stock_adjustment_version_check" CHECK ("version" >= 1),
  CONSTRAINT "stock_adjustment_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL)),
  CONSTRAINT "stock_adjustment_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL) OR ("review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  CONSTRAINT "stock_adjustment_submitted_check" CHECK ("submitted_at" IS NULL OR ("status" <> 'DRAFT' AND NOT "auto_approved"))
);
CREATE UNIQUE INDEX "stock_adjustment_doc_no_key" ON "inventory"."stock_adjustment" ("doc_no");
CREATE UNIQUE INDEX "stock_adjustment_numbering_running_no_key" ON "inventory"."stock_adjustment" ("numbering_id", "running_no");
CREATE UNIQUE INDEX "stock_adjustment_plain_running_no_key" ON "inventory"."stock_adjustment" ("running_no") WHERE "numbering_id" IS NULL;
CREATE INDEX "stock_adjustment_list_idx" ON "inventory"."stock_adjustment" ("doc_date" DESC, "id" DESC) WHERE "deleted_at" IS NULL;
CREATE INDEX "stock_adjustment_pending_idx" ON "inventory"."stock_adjustment" ("status") WHERE "status" = 'PENDING_APPROVAL';

CREATE TABLE "inventory"."stock_adjustment_line" (
  "id" UUID NOT NULL,
  "adjustment_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "stock_uuid" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "lot_key" VARCHAR(40) NOT NULL,
  "stock_pcs" INTEGER NOT NULL,
  "stock_weight_ct" DECIMAL(12,3) NOT NULL,
  "stock_price" DECIMAL(18,2) NOT NULL,
  "physical_pcs" INTEGER NOT NULL,
  "physical_weight_ct" DECIMAL(12,3) NOT NULL,
  "physical_price" DECIMAL(18,2),
  "remark" VARCHAR(250) NOT NULL DEFAULT '',
  "applied_version" INTEGER,
  "prev_stock_price" DECIMAL(18,2),
  CONSTRAINT "stock_adjustment_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_adjustment_line_adjustment_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "inventory"."stock_adjustment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_adjustment_line_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_adjustment_line_position_check" CHECK ("position" BETWEEN 1 AND 200),
  CONSTRAINT "stock_adjustment_line_qty_check" CHECK ("stock_pcs" >= 0 AND "stock_weight_ct" >= 0 AND "physical_pcs" >= 0 AND "physical_weight_ct" >= 0),
  CONSTRAINT "stock_adjustment_line_price_check" CHECK ("stock_price" >= 0 AND ("physical_price" IS NULL OR "physical_price" >= 0) AND ("prev_stock_price" IS NULL OR "prev_stock_price" >= 0)),
  CONSTRAINT "stock_adjustment_line_applied_check" CHECK (("applied_version" IS NULL) = ("prev_stock_price" IS NULL))
);
CREATE UNIQUE INDEX "stock_adjustment_line_stock_key" ON "inventory"."stock_adjustment_line" ("adjustment_id", "stock_uuid");
CREATE UNIQUE INDEX "stock_adjustment_line_position_key" ON "inventory"."stock_adjustment_line" ("adjustment_id", "position");
CREATE INDEX "stock_adjustment_line_stock_idx" ON "inventory"."stock_adjustment_line" ("stock_uuid");

ALTER TABLE "inventory"."stock_movement" DROP CONSTRAINT "stock_movement_kind_check";
ALTER TABLE "inventory"."stock_movement" ADD CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN (
  'LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL',
  'HOLD_RESERVE', 'RELEASE_RESERVE', 'MEMO_OUT', 'MEMO_OUT_REVERSAL', 'MEMO_OUT_RETURN', 'MEMO_OUT_RETURN_REVERSAL',
  'SALE_OUT', 'SALE_OUT_REVERSAL', 'ADJUST', 'ADJUST_REVERSAL'));

ALTER TABLE "inventory"."approval_setting" DROP CONSTRAINT "approval_setting_type_check";
ALTER TABLE "inventory"."approval_setting" ADD CONSTRAINT "approval_setting_type_check"
  CHECK ("type" IN ('load-to-stock', 'merge-split', 'stock-transfer-location', 'sale', 'stock-adjustment'));
INSERT INTO "inventory"."approval_setting" ("type", "require_approval") VALUES ('stock-adjustment', true) ON CONFLICT ("type") DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory"."stock_adjustment", "inventory"."stock_adjustment_line" TO gms_inventory_app;
  END IF;
END $$;
