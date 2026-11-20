-- sale SA revision 1 / ADR-0054 (accepted 2026-11-18, owner "อนุมัติทั้งสอง"), BE-SL-003.
-- Expand-only for schema "inventory" (inventory/sale database-diagram.md part A):
--   sale (header: customer + address snapshots, currency / Selling Rate, money fields and totals, ADR-0050 approval
--   columns, ADR-0045 soft delete, provisional / sync_state / applied_revision for the saga), sale_line (RESERVE |
--   STOCK, master ids stored as plain uuids with snapshots), sale_charge, sale_line_photo (links to stored_file, files
--   under files/sale/ are permanent, ADR-0030), sale_sync_op (the per-document-type saga table of the shared driver).
--   approval_setting gains the type 'sale' (default ON).
-- No cross-schema foreign key and no grant to another role. notification_event.document_type and
-- stored_file.source_type have no value CHECK, so 'sale' / 'sale-line' need no change there.
-- Rollback: prisma/rollback/20261119090000_sale.down.sql (refuses while any Sale exists).

CREATE TABLE "inventory"."sale" (
  "id" UUID NOT NULL,
  "numbering_id" UUID,
  "running_no" INTEGER NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "provisional" BOOLEAN NOT NULL DEFAULT false,
  "sync_state" VARCHAR(10) NOT NULL DEFAULT 'IDLE',
  "applied_revision" INTEGER NOT NULL DEFAULT 0,
  "doc_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "customer_id" UUID NOT NULL,
  "customer_code_snapshot" VARCHAR(120) NOT NULL DEFAULT '',
  "customer_name_snapshot" VARCHAR(200) NOT NULL DEFAULT '',
  "shipping_address_id" UUID,
  "shipping_address_snapshot" VARCHAR(1000) NOT NULL DEFAULT '',
  "invoice_address_id" UUID,
  "invoice_address_snapshot" VARCHAR(1000) NOT NULL DEFAULT '',
  "currency_code" CHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(18,6),
  "ref" VARCHAR(100) NOT NULL DEFAULT '',
  "document_note" VARCHAR(250) NOT NULL DEFAULT '',
  "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
  "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "tax_enabled" BOOLEAN NOT NULL DEFAULT false,
  "tax_rate" DECIMAL(9,4) NOT NULL DEFAULT 0,
  "tax_included" BOOLEAN NOT NULL DEFAULT false,
  "labor_work" VARCHAR(120),
  "labor_basis" VARCHAR(10),
  "labor_qty" DECIMAL(18,3),
  "labor_rate" DECIMAL(18,2),
  "subtotal" DECIMAL(18,2) NOT NULL,
  "discount_amount" DECIMAL(18,2) NOT NULL,
  "price_before_tax" DECIMAL(18,2) NOT NULL,
  "tax_amount" DECIMAL(18,2) NOT NULL,
  "charges_amount" DECIMAL(18,2) NOT NULL,
  "labor_amount" DECIMAL(18,2) NOT NULL,
  "grand_total" DECIMAL(18,2) NOT NULL,
  "line_count" SMALLINT NOT NULL,
  "total_pcs" INTEGER NOT NULL,
  "total_weight_ct" DECIMAL(15,3) NOT NULL,
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
  "deleted_at" TIMESTAMPTZ(3),
  "deleted_by" VARCHAR(64),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" VARCHAR(64) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "sale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "sale_sync_state_check" CHECK ("sync_state" IN ('IDLE', 'SYNCING')),
  CONSTRAINT "sale_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1),
  CONSTRAINT "sale_applied_revision_check" CHECK ("applied_revision" >= 0),
  CONSTRAINT "sale_version_check" CHECK ("version" >= 1),
  CONSTRAINT "sale_provisional_check" CHECK (NOT "provisional" OR "status" = 'APPROVED'),
  CONSTRAINT "sale_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL)),
  CONSTRAINT "sale_review_check" CHECK (
    ("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  CONSTRAINT "sale_submitted_check" CHECK ("submitted_at" IS NULL OR ("status" <> 'DRAFT' AND NOT "auto_approved")),
  CONSTRAINT "sale_due_date_check" CHECK ("due_date" >= "doc_date"),
  CONSTRAINT "sale_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  CONSTRAINT "sale_discount_type_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  CONSTRAINT "sale_tax_check" CHECK ("tax_rate" BETWEEN 0 AND 100),
  CONSTRAINT "sale_labor_check" CHECK (
    ("labor_work" IS NULL AND "labor_basis" IS NULL AND "labor_qty" IS NULL AND "labor_rate" IS NULL)
    OR ("labor_work" IS NOT NULL AND "labor_basis" IN ('PCS', 'WEIGHT') AND "labor_qty" >= 0 AND "labor_rate" >= 0)),
  CONSTRAINT "sale_money_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "price_before_tax" >= 0 AND "tax_amount" >= 0
    AND "charges_amount" >= 0 AND "labor_amount" >= 0 AND "grand_total" >= 0),
  CONSTRAINT "sale_totals_check" CHECK ("line_count" BETWEEN 1 AND 200 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0)
);
CREATE UNIQUE INDEX "sale_doc_no_key" ON "inventory"."sale" ("doc_no");
CREATE UNIQUE INDEX "sale_numbering_running_no_key" ON "inventory"."sale" ("numbering_id", "running_no");
CREATE UNIQUE INDEX "sale_plain_running_no_key" ON "inventory"."sale" ("running_no") WHERE "numbering_id" IS NULL;
CREATE INDEX "sale_list_idx" ON "inventory"."sale" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND NOT "provisional";
CREATE INDEX "sale_deleted_list_idx" ON "inventory"."sale" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "sale_pending_idx" ON "inventory"."sale" ("submitted_at", "id") WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL;
CREATE INDEX "sale_revision_idx" ON "inventory"."sale" ("id") WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL;
CREATE INDEX "sale_syncing_idx" ON "inventory"."sale" ("sync_state") WHERE "sync_state" = 'SYNCING';
CREATE INDEX "sale_customer_idx" ON "inventory"."sale" ("customer_id", "doc_date" DESC);

CREATE TABLE "inventory"."sale_line" (
  "id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "source" VARCHAR(10) NOT NULL,
  "reserve_line_id" UUID,
  "reserve_id" UUID,
  "reserve_doc_no" VARCHAR(40),
  "memo_stock_id" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL DEFAULT '',
  "memo_receive_id" UUID,
  "memo_receive_doc_no" VARCHAR(40),
  "stone_code" VARCHAR(60) NOT NULL DEFAULT '',
  "stone" VARCHAR(60) NOT NULL DEFAULT '',
  "shape" VARCHAR(60) NOT NULL DEFAULT '',
  "size" VARCHAR(60) NOT NULL DEFAULT '',
  "color" VARCHAR(60) NOT NULL DEFAULT '',
  "clarity" VARCHAR(60) NOT NULL DEFAULT '',
  "cutting" VARCHAR(60) NOT NULL DEFAULT '',
  "quality" VARCHAR(60) NOT NULL DEFAULT '',
  "lot" VARCHAR(40) NOT NULL DEFAULT '',
  "location" VARCHAR(40) NOT NULL DEFAULT '',
  "cer_type" VARCHAR(20) NOT NULL DEFAULT '',
  "cer_no" VARCHAR(60) NOT NULL DEFAULT '',
  "price_unit" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "cap_pcs" INTEGER NOT NULL,
  "cap_weight_ct" DECIMAL(12,3) NOT NULL,
  "reserve_net_unit_price" DECIMAL(18,4),
  "unit_price" DECIMAL(18,2) NOT NULL,
  "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
  "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(18,2) NOT NULL,
  "item_note" VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_line_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "inventory"."sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_line_position_check" CHECK ("position" BETWEEN 1 AND 200),
  CONSTRAINT "sale_line_source_check" CHECK (
    ("source" = 'RESERVE' AND "reserve_line_id" IS NOT NULL AND "reserve_id" IS NOT NULL)
    OR ("source" = 'STOCK' AND "reserve_line_id" IS NULL AND "reserve_id" IS NULL)),
  CONSTRAINT "sale_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)
    AND "pcs" <= "cap_pcs" AND "weight_ct" <= "cap_weight_ct"),
  CONSTRAINT "sale_line_price_check" CHECK ("unit_price" > 0 AND "discount_amount" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0
    AND ("reserve_net_unit_price" IS NULL OR "reserve_net_unit_price" >= 0)),
  CONSTRAINT "sale_line_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS'))
);
CREATE UNIQUE INDEX "sale_line_position_key" ON "inventory"."sale_line" ("sale_id", "position");
CREATE UNIQUE INDEX "sale_line_reserve_line_key" ON "inventory"."sale_line" ("sale_id", "reserve_line_id") WHERE "reserve_line_id" IS NOT NULL;
CREATE UNIQUE INDEX "sale_line_stock_key" ON "inventory"."sale_line" ("sale_id", "memo_stock_id") WHERE "source" = 'STOCK';
CREATE INDEX "sale_line_memo_stock_idx" ON "inventory"."sale_line" ("memo_stock_id");
CREATE INDEX "sale_line_reserve_line_idx" ON "inventory"."sale_line" ("reserve_line_id");

CREATE TABLE "inventory"."sale_charge" (
  "sale_id" UUID NOT NULL,
  "charge_type" VARCHAR(20) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "sale_charge_pkey" PRIMARY KEY ("sale_id", "charge_type"),
  CONSTRAINT "sale_charge_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "inventory"."sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_charge_amount_check" CHECK ("amount" >= 0)
);

-- Photo links only: the stored_file rows and bytes under files/sale/ are never deleted (ADR-0030).
CREATE TABLE "inventory"."sale_line_photo" (
  "line_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "sale_line_photo_pkey" PRIMARY KEY ("line_id", "position"),
  CONSTRAINT "sale_line_photo_line_fkey" FOREIGN KEY ("line_id") REFERENCES "inventory"."sale_line" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_line_photo_file_fkey" FOREIGN KEY ("file_id") REFERENCES "inventory"."stored_file" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_line_photo_position_check" CHECK ("position" BETWEEN 0 AND 4)
);
CREATE INDEX "sale_line_photo_file_idx" ON "inventory"."sale_line_photo" ("file_id");

-- Saga ops of the shared SyncDriver (ADR-0054 D6; same columns as master_sync_op). APPLY_DRAFT = a DRAFT saved while
-- approval is OFF (ADR-0050 saveStatus, e.g. after Restore), as Load to Stock.
CREATE TABLE "inventory"."sale_sync_op" (
  "id" UUID NOT NULL,
  "sale_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "state" VARCHAR(10) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "attempts" SMALLINT NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "last_error" VARCHAR(64),
  "created_by" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_sync_op_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_sync_op_sale_fkey" FOREIGN KEY ("sale_id") REFERENCES "inventory"."sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_sync_op_state_check" CHECK ("state" IN ('PREPARED', 'CONFIRMED', 'REFUSED', 'DONE', 'STUCK')),
  CONSTRAINT "sale_sync_op_kind_check" CHECK ("kind" IN ('CREATE', 'APPLY_DRAFT', 'APPROVE', 'UPDATE', 'DELETE')),
  CONSTRAINT "sale_sync_op_attempts_check" CHECK ("attempts" BETWEEN 0 AND 100 AND "revision" >= 1),
  CONSTRAINT "sale_sync_op_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sale_sync_op_payload_size_check" CHECK (octet_length("payload"::text) <= 393216)
);
CREATE UNIQUE INDEX "sale_sync_op_sale_revision_key" ON "inventory"."sale_sync_op" ("sale_id", "revision");
CREATE INDEX "sale_sync_op_due_idx" ON "inventory"."sale_sync_op" ("next_attempt_at") WHERE "state" IN ('PREPARED', 'CONFIRMED');
CREATE INDEX "sale_sync_op_done_idx" ON "inventory"."sale_sync_op" ("updated_at") WHERE "state" = 'DONE';

-- Approval type 'sale' (ADR-0054 D7, default ON).
ALTER TABLE "inventory"."approval_setting" DROP CONSTRAINT "approval_setting_type_check";
ALTER TABLE "inventory"."approval_setting" ADD CONSTRAINT "approval_setting_type_check"
  CHECK ("type" IN ('load-to-stock', 'merge-split', 'stock-transfer-location', 'sale'));
INSERT INTO "inventory"."approval_setting" ("type", "require_approval") VALUES ('sale', true) ON CONFLICT ("type") DO NOTHING;

-- Grants as in the init migration: normally covered by the migrator's default privileges; repeated so the app role
-- gets exactly DML on the new tables. Skipped where the role does not exist (local superuser setups).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "inventory"."sale", "inventory"."sale_line", "inventory"."sale_charge",
      "inventory"."sale_line_photo", "inventory"."sale_sync_op" TO gms_inventory_app;
  END IF;
END $$;
