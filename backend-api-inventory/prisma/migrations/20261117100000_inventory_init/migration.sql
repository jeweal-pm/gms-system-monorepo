-- load-to-stock SA revision 1 / ADR-0052 (accepted 2026-11-17), BE-LS-007 / BE-LS-013: schema `inventory` of
-- backend-api-inventory (database-diagram.md part A). No cross-schema foreign key: purchase_line_id, purchase_id,
-- vendor_id, stone_code_id, numbering_id and user ids are plain columns validated through the master internal API.
-- Retention: documents, stock, movements and files are permanent (ADR-0030: stored_file has no expires/purge column);
-- notifications 90 days and DONE sync ops 30 days, deleted by the service's bounded daily job.
-- Run by the one-off migrate job (gms_inventory_migrator), never at app start-up. Roles: prisma/roles/provision-inventory-roles.sql.
-- Rollback (only when no applied load exists, or every applied load was deleted through the API first):
--   DROP SCHEMA "inventory" CASCADE.

-- Schema "inventory" is created by prisma/roles/provision-inventory-roles.sql (owned by gms_inventory_migrator, which has no
-- CREATE privilege on the database).

-- Documents ---------------------------------------------------------------------------------------------------------
CREATE TABLE "inventory"."load_to_stock" (
  "id" UUID NOT NULL,
  "numbering_id" UUID,
  "running_no" INTEGER NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "provisional" BOOLEAN NOT NULL DEFAULT false,
  "sync_state" VARCHAR(10) NOT NULL DEFAULT 'IDLE',
  "applied_revision" INTEGER NOT NULL DEFAULT 0,
  "doc_date" DATE NOT NULL,
  "vendor_id" UUID NOT NULL,
  "vendor_code_snapshot" VARCHAR(120) NOT NULL DEFAULT '',
  "vendor_name_snapshot" VARCHAR(200) NOT NULL DEFAULT '',
  "currency_code" CHAR(3) NOT NULL,
  "ref" VARCHAR(100) NOT NULL DEFAULT '',
  "document_note" VARCHAR(250) NOT NULL DEFAULT '',
  "mode" VARCHAR(10) NOT NULL,
  "row_count" SMALLINT NOT NULL,
  "total_pcs" INTEGER NOT NULL,
  "total_weight_ct" DECIMAL(15,3) NOT NULL,
  "total_cost_base" DECIMAL(18,2) NOT NULL,
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
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" VARCHAR(64) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "load_to_stock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "load_to_stock_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED')),
  CONSTRAINT "load_to_stock_mode_check" CHECK ("mode" IN ('NONE', 'SPLIT', 'MERGE')),
  CONSTRAINT "load_to_stock_sync_state_check" CHECK ("sync_state" IN ('IDLE', 'SYNCING')),
  CONSTRAINT "load_to_stock_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1),
  CONSTRAINT "load_to_stock_applied_revision_check" CHECK ("applied_revision" >= 0),
  CONSTRAINT "load_to_stock_version_check" CHECK ("version" >= 1),
  CONSTRAINT "load_to_stock_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by" IS NULL)),
  CONSTRAINT "load_to_stock_review_check" CHECK (
    ("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL)
    OR ("review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  CONSTRAINT "load_to_stock_provisional_check" CHECK (NOT "provisional" OR "status" = 'APPROVED'),
  CONSTRAINT "load_to_stock_totals_check" CHECK ("row_count" BETWEEN 1 AND 200 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0 AND "total_cost_base" >= 0)
);
CREATE UNIQUE INDEX "load_to_stock_doc_no_key" ON "inventory"."load_to_stock" ("doc_no");
CREATE UNIQUE INDEX "load_to_stock_numbering_running_no_key" ON "inventory"."load_to_stock" ("numbering_id", "running_no");
CREATE UNIQUE INDEX "load_to_stock_plain_running_no_key" ON "inventory"."load_to_stock" ("running_no") WHERE "numbering_id" IS NULL;
CREATE INDEX "load_to_stock_list_idx" ON "inventory"."load_to_stock" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL AND NOT "provisional";
CREATE INDEX "load_to_stock_deleted_list_idx" ON "inventory"."load_to_stock" ("doc_date" DESC, "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "load_to_stock_pending_idx" ON "inventory"."load_to_stock" ("submitted_at", "id") WHERE "status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL;
CREATE INDEX "load_to_stock_revision_idx" ON "inventory"."load_to_stock" ("id") WHERE "status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL;
CREATE INDEX "load_to_stock_vendor_idx" ON "inventory"."load_to_stock" ("vendor_id", "doc_date" DESC);
CREATE INDEX "load_to_stock_syncing_idx" ON "inventory"."load_to_stock" ("sync_state") WHERE "sync_state" = 'SYNCING';

CREATE TABLE "inventory"."load_to_stock_source" (
  "id" UUID NOT NULL,
  "load_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "purchase_line_id" UUID NOT NULL,
  "purchase_id" UUID NOT NULL,
  "purchase_doc_no" VARCHAR(40) NOT NULL,
  "purchase_doc_date" DATE NOT NULL,
  "purchase_currency" CHAR(3) NOT NULL,
  "exchange_rate" DECIMAL(18,6) NOT NULL,
  "price_unit" VARCHAR(10) NOT NULL,
  "unit_price" DECIMAL(18,2) NOT NULL,
  "net_unit_price" DECIMAL(18,4) NOT NULL,
  "unit_cost_base" DECIMAL(18,4) NOT NULL,
  "line_pcs" INTEGER NOT NULL,
  "line_weight_ct" DECIMAL(12,3) NOT NULL,
  "location" VARCHAR(40) NOT NULL DEFAULT '',
  "stone_code_id" UUID,
  "stone_code" VARCHAR(60) NOT NULL DEFAULT '',
  "stone" VARCHAR(60) NOT NULL DEFAULT '',
  "shape" VARCHAR(60) NOT NULL DEFAULT '',
  "size" VARCHAR(60) NOT NULL DEFAULT '',
  "color" VARCHAR(60) NOT NULL DEFAULT '',
  "clarity" VARCHAR(60) NOT NULL DEFAULT '',
  "cutting" VARCHAR(60) NOT NULL DEFAULT '',
  "quality" VARCHAR(60) NOT NULL DEFAULT '',
  "lot" VARCHAR(40) NOT NULL DEFAULT '',
  "cer_type" VARCHAR(20) NOT NULL DEFAULT '',
  "cer_no" VARCHAR(60) NOT NULL DEFAULT '',
  "item_note" VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT "load_to_stock_source_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "load_to_stock_source_load_fkey" FOREIGN KEY ("load_id") REFERENCES "inventory"."load_to_stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_source_rate_check" CHECK ("exchange_rate" > 0),
  CONSTRAINT "load_to_stock_source_price_check" CHECK ("net_unit_price" >= 0 AND "unit_cost_base" >= 0 AND "unit_price" >= 0),
  CONSTRAINT "load_to_stock_source_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS'))
);
CREATE UNIQUE INDEX "load_to_stock_source_line_key" ON "inventory"."load_to_stock_source" ("load_id", "purchase_line_id");
CREATE UNIQUE INDEX "load_to_stock_source_position_key" ON "inventory"."load_to_stock_source" ("load_id", "position");
CREATE INDEX "load_to_stock_source_purchase_line_idx" ON "inventory"."load_to_stock_source" ("purchase_line_id");

CREATE TABLE "inventory"."load_to_stock_row" (
  "id" UUID NOT NULL,
  "load_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "location" VARCHAR(40) NOT NULL,
  "parcel" VARCHAR(50) NOT NULL DEFAULT '',
  "stone_code_id" UUID,
  "stone_code" VARCHAR(60) NOT NULL DEFAULT '',
  "stone" VARCHAR(60) NOT NULL DEFAULT '',
  "shape" VARCHAR(60) NOT NULL DEFAULT '',
  "size" VARCHAR(60) NOT NULL DEFAULT '',
  "color" VARCHAR(60) NOT NULL DEFAULT '',
  "clarity" VARCHAR(60) NOT NULL DEFAULT '',
  "cutting" VARCHAR(60) NOT NULL DEFAULT '',
  "quality" VARCHAR(60) NOT NULL DEFAULT '',
  "lot" VARCHAR(40) NOT NULL DEFAULT '',
  "cer_type" VARCHAR(20) NOT NULL DEFAULT '',
  "cer_no" VARCHAR(60) NOT NULL DEFAULT '',
  "price_unit" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "unit_cost_base" DECIMAL(18,4) NOT NULL,
  "cost_amount_base" DECIMAL(18,2) NOT NULL,
  "stock_price" DECIMAL(18,2) NOT NULL,
  "sale_price" DECIMAL(18,2) NOT NULL,
  "item_note" VARCHAR(500) NOT NULL DEFAULT '',
  "stock_id" VARCHAR(10),
  CONSTRAINT "load_to_stock_row_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "load_to_stock_row_load_fkey" FOREIGN KEY ("load_id") REFERENCES "inventory"."load_to_stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_row_qty_check" CHECK ("pcs" >= 1 AND "weight_ct" >= 0),
  CONSTRAINT "load_to_stock_row_money_check" CHECK ("unit_cost_base" >= 0 AND "cost_amount_base" >= 0 AND "stock_price" >= 0 AND "sale_price" >= 0),
  CONSTRAINT "load_to_stock_row_location_check" CHECK (char_length("location") BETWEEN 1 AND 40),
  CONSTRAINT "load_to_stock_row_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS'))
);
CREATE UNIQUE INDEX "load_to_stock_row_position_key" ON "inventory"."load_to_stock_row" ("load_id", "position");
CREATE INDEX "load_to_stock_row_location_idx" ON "inventory"."load_to_stock_row" ("location");

CREATE TABLE "inventory"."load_to_stock_row_source" (
  "row_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "cost_amount_base" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "load_to_stock_row_source_pkey" PRIMARY KEY ("row_id", "source_id"),
  CONSTRAINT "load_to_stock_row_source_row_fkey" FOREIGN KEY ("row_id") REFERENCES "inventory"."load_to_stock_row" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_row_source_source_fkey" FOREIGN KEY ("source_id") REFERENCES "inventory"."load_to_stock_source" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_row_source_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND "cost_amount_base" >= 0)
);
CREATE INDEX "load_to_stock_row_source_source_idx" ON "inventory"."load_to_stock_row_source" ("source_id");

-- Files (ADR-0048 rules, ADR-0030 permanent retention) ------------------------------------------------------------
CREATE TABLE "inventory"."stored_file" (
  "id" UUID NOT NULL,
  "bucket" VARCHAR(16) NOT NULL,
  "object_key" VARCHAR(512) NOT NULL,
  "filename" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(255) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "source_type" VARCHAR(64) NOT NULL,
  "source_id" VARCHAR(128) NOT NULL,
  "origin_service" VARCHAR(16),
  "origin_file_id" UUID,
  "created_by" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "ready_at" TIMESTAMPTZ(6),
  CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_file_status_check" CHECK ("status" IN ('pending', 'ready')),
  CONSTRAINT "stored_file_origin_check" CHECK (("origin_service" IS NULL) = ("origin_file_id" IS NULL)),
  CONSTRAINT "stored_file_size_check" CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880)
);
CREATE UNIQUE INDEX "stored_file_bucket_object_key_key" ON "inventory"."stored_file" ("bucket", "object_key");
CREATE UNIQUE INDEX "stored_file_origin_key" ON "inventory"."stored_file" ("origin_service", "origin_file_id") WHERE "origin_file_id" IS NOT NULL;
CREATE INDEX "stored_file_source_idx" ON "inventory"."stored_file" ("source_type", "source_id");
CREATE INDEX "stored_file_user_idx" ON "inventory"."stored_file" ("created_by", "created_at" DESC);

CREATE TABLE "inventory"."load_to_stock_row_photo" (
  "row_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "load_to_stock_row_photo_pkey" PRIMARY KEY ("row_id", "position"),
  CONSTRAINT "load_to_stock_row_photo_row_fkey" FOREIGN KEY ("row_id") REFERENCES "inventory"."load_to_stock_row" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_row_photo_file_fkey" FOREIGN KEY ("file_id") REFERENCES "inventory"."stored_file" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "load_to_stock_row_photo_position_check" CHECK ("position" BETWEEN 1 AND 5)
);
CREATE INDEX "load_to_stock_row_photo_file_idx" ON "inventory"."load_to_stock_row_photo" ("file_id");

-- Own stock (ADR-0052 D6 / D15 phase 1) ----------------------------------------------------------------------------
-- load_row_id is nullable: a row removed from an applied load is deleted from the document while its (reversed) stock
-- keeps its Stock ID and load_id (backend implementation note, testing.md).
CREATE TABLE "inventory"."stock" (
  "id" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "load_row_id" UUID,
  "load_id" UUID NOT NULL,
  "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  "location" VARCHAR(40) NOT NULL,
  "parcel" VARCHAR(50) NOT NULL DEFAULT '',
  "stone_code_id" UUID,
  "stone_code" VARCHAR(60) NOT NULL DEFAULT '',
  "stone" VARCHAR(60) NOT NULL DEFAULT '',
  "shape" VARCHAR(60) NOT NULL DEFAULT '',
  "size" VARCHAR(60) NOT NULL DEFAULT '',
  "color" VARCHAR(60) NOT NULL DEFAULT '',
  "clarity" VARCHAR(60) NOT NULL DEFAULT '',
  "cutting" VARCHAR(60) NOT NULL DEFAULT '',
  "quality" VARCHAR(60) NOT NULL DEFAULT '',
  "lot" VARCHAR(40) NOT NULL DEFAULT '',
  "cer_type" VARCHAR(20) NOT NULL DEFAULT '',
  "cer_no" VARCHAR(60) NOT NULL DEFAULT '',
  "price_unit" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "on_hand_pcs" INTEGER NOT NULL,
  "on_hand_weight_ct" DECIMAL(12,3) NOT NULL,
  "reserved_pcs" INTEGER NOT NULL DEFAULT 0,
  "reserved_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "memo_out_pcs" INTEGER NOT NULL DEFAULT 0,
  "memo_out_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "sold_pcs" INTEGER NOT NULL DEFAULT 0,
  "sold_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "consumed_pcs" INTEGER NOT NULL DEFAULT 0,
  "consumed_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unit_cost_base" DECIMAL(18,4) NOT NULL,
  "cost_amount_base" DECIMAL(18,2) NOT NULL,
  "stock_price" DECIMAL(18,2) NOT NULL,
  "sale_price" DECIMAL(18,2) NOT NULL,
  "currency_code" CHAR(3) NOT NULL,
  "vendor_id" UUID NOT NULL,
  "vendor_name_snapshot" VARCHAR(200) NOT NULL DEFAULT '',
  "item_note" VARCHAR(500) NOT NULL DEFAULT '',
  "first_used_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "stock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_load_row_fkey" FOREIGN KEY ("load_row_id") REFERENCES "inventory"."load_to_stock_row" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_status_check" CHECK ("status" IN ('ACTIVE', 'REVERSED')),
  CONSTRAINT "stock_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS')),
  CONSTRAINT "stock_buckets_check" CHECK (
    "on_hand_pcs" >= 0 AND "reserved_pcs" >= 0 AND "memo_out_pcs" >= 0 AND "sold_pcs" >= 0 AND "consumed_pcs" >= 0
    AND "on_hand_weight_ct" >= 0 AND "reserved_weight_ct" >= 0 AND "memo_out_weight_ct" >= 0 AND "sold_weight_ct" >= 0 AND "consumed_weight_ct" >= 0),
  CONSTRAINT "stock_pcs_balance_check" CHECK ("pcs" = "on_hand_pcs" + "reserved_pcs" + "memo_out_pcs" + "sold_pcs" + "consumed_pcs"),
  CONSTRAINT "stock_weight_balance_check" CHECK ("weight_ct" = "on_hand_weight_ct" + "reserved_weight_ct" + "memo_out_weight_ct" + "sold_weight_ct" + "consumed_weight_ct"),
  CONSTRAINT "stock_reversed_check" CHECK ("status" = 'ACTIVE' OR ("on_hand_pcs" = 0 AND "on_hand_weight_ct" = 0)),
  CONSTRAINT "stock_money_check" CHECK ("unit_cost_base" >= 0 AND "cost_amount_base" >= 0 AND "stock_price" >= 0 AND "sale_price" >= 0)
);
CREATE UNIQUE INDEX "stock_stock_id_key" ON "inventory"."stock" ("stock_id");
CREATE UNIQUE INDEX "stock_load_row_id_key" ON "inventory"."stock" ("load_row_id");
CREATE INDEX "stock_load_idx" ON "inventory"."stock" ("load_id");
CREATE INDEX "stock_available_idx" ON "inventory"."stock" ("location", "stock_id") WHERE "status" = 'ACTIVE' AND "on_hand_pcs" > 0;
CREATE INDEX "stock_in_use_idx" ON "inventory"."stock" ("load_id") WHERE "on_hand_pcs" <> "pcs" OR "on_hand_weight_ct" <> "weight_ct";

CREATE TABLE "inventory"."stock_photo" (
  "stock_uuid" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "stock_photo_pkey" PRIMARY KEY ("stock_uuid", "position"),
  CONSTRAINT "stock_photo_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_photo_file_fkey" FOREIGN KEY ("file_id") REFERENCES "inventory"."stored_file" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_photo_position_check" CHECK ("position" BETWEEN 1 AND 5)
);
CREATE INDEX "stock_photo_file_idx" ON "inventory"."stock_photo" ("file_id");

-- Holds (phase 1: schema only, written from ADR-0052 D15 phase 2b)
CREATE TABLE "inventory"."stock_hold" (
  "id" UUID NOT NULL,
  "document_type" VARCHAR(40) NOT NULL,
  "document_id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "stock_uuid" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "revision" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "stock_hold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_hold_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_hold_kind_check" CHECK ("kind" IN ('RESERVED', 'MEMO_OUT', 'MEMO_OUT_RETURN', 'SOLD')),
  CONSTRAINT "stock_hold_document_type_check" CHECK ("document_type" IN ('reserve', 'memo-out', 'memo-out-return', 'sale')),
  CONSTRAINT "stock_hold_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND "revision" >= 1)
);
CREATE UNIQUE INDEX "stock_hold_line_key" ON "inventory"."stock_hold" ("document_type", "document_id", "line_id");
CREATE INDEX "stock_hold_stock_idx" ON "inventory"."stock_hold" ("stock_uuid");
CREATE INDEX "stock_hold_document_idx" ON "inventory"."stock_hold" ("document_type", "document_id");

-- Append-only stock ledger (app role: INSERT / SELECT only, below)
CREATE TABLE "inventory"."stock_movement" (
  "id" UUID NOT NULL,
  "stock_uuid" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "document_type" VARCHAR(40) NOT NULL,
  "document_id" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "pcs_delta" INTEGER NOT NULL,
  "weight_delta" DECIMAL(12,3) NOT NULL,
  "cost_delta_base" DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_movement_stock_fkey" FOREIGN KEY ("stock_uuid") REFERENCES "inventory"."stock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stock_movement_kind_check" CHECK ("kind" IN ('LOAD_IN', 'LOAD_ADJUST', 'LOAD_REVERSAL'))
);
CREATE INDEX "stock_movement_stock_idx" ON "inventory"."stock_movement" ("stock_uuid", "created_at");
CREATE INDEX "stock_movement_document_idx" ON "inventory"."stock_movement" ("document_type", "document_id");
CREATE INDEX "stock_movement_created_idx" ON "inventory"."stock_movement" ("created_at");

-- Platform: approval settings (ADR-0052 D8), master sync ops (D4), notifications (D12) -----------------------------
CREATE TABLE "inventory"."approval_setting" (
  "type" VARCHAR(32) NOT NULL,
  "require_approval" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64),
  "updated_by_name" VARCHAR(200),
  CONSTRAINT "approval_setting_pkey" PRIMARY KEY ("type"),
  CONSTRAINT "approval_setting_type_check" CHECK ("type" IN ('load-to-stock', 'merge-split', 'stock-transfer-location')),
  CONSTRAINT "approval_setting_version_check" CHECK ("version" >= 1)
);
INSERT INTO "inventory"."approval_setting" ("type", "require_approval") VALUES
  ('load-to-stock', true), ('merge-split', true), ('stock-transfer-location', true);

CREATE TABLE "inventory"."master_sync_op" (
  "id" UUID NOT NULL,
  "load_id" UUID NOT NULL,
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
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "master_sync_op_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "master_sync_op_load_fkey" FOREIGN KEY ("load_id") REFERENCES "inventory"."load_to_stock" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "master_sync_op_state_check" CHECK ("state" IN ('PREPARED', 'CONFIRMED', 'REFUSED', 'DONE', 'STUCK')),
  CONSTRAINT "master_sync_op_kind_check" CHECK ("kind" IN ('CREATE', 'APPLY_DRAFT', 'APPROVE', 'UPDATE', 'DELETE')),
  CONSTRAINT "master_sync_op_attempts_check" CHECK ("attempts" BETWEEN 0 AND 100 AND "revision" >= 1),
  -- The desired document of an edit rides in the payload (≤ 200 rows from a ≤ 256 KiB request).
  CONSTRAINT "master_sync_op_payload_size_check" CHECK (octet_length("payload"::text) <= 393216)
);
CREATE UNIQUE INDEX "master_sync_op_load_revision_key" ON "inventory"."master_sync_op" ("load_id", "revision");
CREATE INDEX "master_sync_op_due_idx" ON "inventory"."master_sync_op" ("next_attempt_at") WHERE "state" IN ('PREPARED', 'CONFIRMED');
CREATE INDEX "master_sync_op_done_idx" ON "inventory"."master_sync_op" ("updated_at") WHERE "state" = 'DONE';

CREATE TABLE "inventory"."notification_event" (
  "id" UUID NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "document_type" VARCHAR(40) NOT NULL,
  "document_id" UUID NOT NULL,
  "doc_no" VARCHAR(40) NOT NULL,
  "actor_user_id" VARCHAR(64) NOT NULL,
  "summary" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_event_summary_size_check" CHECK (octet_length("summary"::text) <= 1024)
);
CREATE INDEX "notification_event_type_created_idx" ON "inventory"."notification_event" ("document_type", "created_at" DESC, "id" DESC);
CREATE INDEX "notification_event_created_idx" ON "inventory"."notification_event" ("created_at");

CREATE TABLE "inventory"."notification_recipient" (
  "event_id" UUID NOT NULL,
  "user_id" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  CONSTRAINT "notification_recipient_pkey" PRIMARY KEY ("event_id", "user_id"),
  CONSTRAINT "notification_recipient_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "inventory"."notification_event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notification_recipient_user_created_idx" ON "inventory"."notification_recipient" ("user_id", "created_at" DESC, "event_id" DESC);
CREATE INDEX "notification_recipient_unread_idx" ON "inventory"."notification_recipient" ("user_id") WHERE "read_at" IS NULL;

-- Grants: the app role normally gets DML through the migrator's default privileges (prisma/roles); repeated here so a
-- re-provisioned role is never broader, and the stock ledger stays append-only for it. Skipped where the role does not
-- exist (local superuser setups, tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gms_inventory_app') THEN
    GRANT USAGE ON SCHEMA "inventory" TO gms_inventory_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "inventory" TO gms_inventory_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON "inventory"."stock_movement" FROM gms_inventory_app;
    REVOKE ALL ON "inventory"."_prisma_migrations" FROM gms_inventory_app;
  END IF;
END $$;
