-- memo-receive SA revision 1 / ADR-0034 (owner 2026-10-29: "อนุมัติ memo-receive revision 3").
-- Expand only: 5 new tables in schema partner; no existing table changes, no backfill.
-- Rollback (only before any approved Memo Receive exists): DROP memo_stock, memo_stock_id_counter,
-- memo_receive_charge, memo_receive_line, memo_receive. After that, roll forward with a fix migration.

-- CreateTable
CREATE TABLE "partner"."memo_receive" (
    "id" UUID NOT NULL,
    "numbering_id" UUID,
    "running_no" INTEGER NOT NULL,
    "doc_no" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "doc_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "vendor_id" UUID NOT NULL,
    "vendor_code_snapshot" VARCHAR(120) NOT NULL,
    "vendor_name_snapshot" VARCHAR(200) NOT NULL,
    "address_id" UUID,
    "address_snapshot" VARCHAR(1000) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "exchange_rate" DECIMAL(18,6),
    "ref" VARCHAR(100) NOT NULL DEFAULT '',
    "document_note" VARCHAR(500) NOT NULL DEFAULT '',
    "discount_type" VARCHAR(10) NOT NULL,
    "discount_value" DECIMAL(18,4) NOT NULL,
    "tax_enabled" BOOLEAN NOT NULL,
    "tax_rate" DECIMAL(9,4) NOT NULL,
    "tax_included" BOOLEAN NOT NULL,
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
    "approved_at" TIMESTAMP(3),
    "approved_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "memo_receive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_receive_line" (
    "id" UUID NOT NULL,
    "memo_receive_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "stock_id" VARCHAR(10) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "stone_code_snapshot" VARCHAR(60) NOT NULL DEFAULT '',
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
    "pcs" INTEGER NOT NULL,
    "weight_ct" DECIMAL(12,3) NOT NULL,
    "price_unit" VARCHAR(10) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL,
    "item_note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "memo_receive_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_receive_charge" (
    "memo_receive_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "memo_receive_charge_pkey" PRIMARY KEY ("memo_receive_id","charge_type")
);

-- CreateTable
CREATE TABLE "partner"."memo_stock" (
    "id" UUID NOT NULL,
    "stock_id" VARCHAR(10) NOT NULL,
    "memo_receive_id" UUID NOT NULL,
    "memo_receive_line_id" UUID NOT NULL,
    "received_doc_no" VARCHAR(40) NOT NULL,
    "received_doc_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "vendor_id" UUID NOT NULL,
    "vendor_code_snapshot" VARCHAR(120) NOT NULL,
    "vendor_name_snapshot" VARCHAR(200) NOT NULL,
    "location" VARCHAR(40) NOT NULL DEFAULT 'Memo',
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
    "received_pcs" INTEGER NOT NULL,
    "received_weight_ct" DECIMAL(12,3) NOT NULL,
    "pending_pcs" INTEGER NOT NULL,
    "pending_weight_ct" DECIMAL(12,3) NOT NULL,
    "price_unit" VARCHAR(10) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "line_amount" DECIMAL(18,2) NOT NULL,
    "net_unit_price" DECIMAL(18,4) NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_stock_id_counter" (
    "year" SMALLINT NOT NULL,
    "last_no" INTEGER NOT NULL,

    CONSTRAINT "memo_stock_id_counter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "memo_receive_doc_no_key" ON "partner"."memo_receive"("doc_no");

-- CreateIndex
CREATE INDEX "memo_receive_list_idx" ON "partner"."memo_receive"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "memo_receive_vendor_idx" ON "partner"."memo_receive"("vendor_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "memo_receive_status_idx" ON "partner"."memo_receive"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "memo_receive_address_idx" ON "partner"."memo_receive"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_receive_numbering_running_no_key" ON "partner"."memo_receive"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "memo_receive_plain_running_no_key" ON "partner"."memo_receive"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "memo_receive_line_stock_id_key" ON "partner"."memo_receive_line"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_receive_line_position_key" ON "partner"."memo_receive_line"("memo_receive_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "memo_stock_stock_id_key" ON "partner"."memo_stock"("stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_stock_memo_receive_line_id_key" ON "partner"."memo_stock"("memo_receive_line_id");

-- CreateIndex
CREATE INDEX "memo_stock_pending_idx" ON "partner"."memo_stock"("vendor_id", "received_doc_date" DESC, "stock_id" DESC) WHERE ((pending_pcs > 0) OR (pending_weight_ct > (0)::numeric));

-- CreateIndex
CREATE INDEX "memo_stock_memo_receive_idx" ON "partner"."memo_stock"("memo_receive_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_receive" ADD CONSTRAINT "memo_receive_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_receive" ADD CONSTRAINT "memo_receive_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_receive" ADD CONSTRAINT "memo_receive_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "partner"."vendor_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_receive_line" ADD CONSTRAINT "memo_receive_line_memo_receive_id_fkey" FOREIGN KEY ("memo_receive_id") REFERENCES "partner"."memo_receive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_receive_charge" ADD CONSTRAINT "memo_receive_charge_memo_receive_id_fkey" FOREIGN KEY ("memo_receive_id") REFERENCES "partner"."memo_receive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_stock" ADD CONSTRAINT "memo_stock_memo_receive_id_fkey" FOREIGN KEY ("memo_receive_id") REFERENCES "partner"."memo_receive"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_stock" ADD CONSTRAINT "memo_stock_memo_receive_line_id_fkey" FOREIGN KEY ("memo_receive_line_id") REFERENCES "partner"."memo_receive_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_stock" ADD CONSTRAINT "memo_stock_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value checks (database-diagram.md; same rules as memo_out_return plus approval and Stock ID).
ALTER TABLE "partner"."memo_receive"
  ADD CONSTRAINT "memo_receive_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "memo_receive_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL))),
  ADD CONSTRAINT "memo_receive_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "memo_receive_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "memo_receive_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "memo_receive_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "memo_receive_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "memo_receive_totals_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal" AND "grand_total" >= 0),
  ADD CONSTRAINT "memo_receive_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."memo_receive_line"
  ADD CONSTRAINT "memo_receive_line_stock_id_check" CHECK ("stock_id" ~ '^[0-9]{6}$'),
  ADD CONSTRAINT "memo_receive_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "partner"."memo_receive_charge"
  ADD CONSTRAINT "memo_receive_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
ALTER TABLE "partner"."memo_stock"
  ADD CONSTRAINT "memo_stock_stock_id_check" CHECK ("stock_id" ~ '^[0-9]{6}$'),
  ADD CONSTRAINT "memo_stock_location_check" CHECK ("location" = 'Memo'),
  ADD CONSTRAINT "memo_stock_quantity_check" CHECK ("received_pcs" >= 0 AND "received_weight_ct" >= 0
    AND "pending_pcs" BETWEEN 0 AND "received_pcs" AND "pending_weight_ct" >= 0 AND "pending_weight_ct" <= "received_weight_ct"),
  ADD CONSTRAINT "memo_stock_price_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS') AND "unit_price" >= 0 AND "line_amount" >= 0 AND "net_unit_price" >= 0),
  ADD CONSTRAINT "memo_stock_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."memo_stock_id_counter"
  ADD CONSTRAINT "memo_stock_id_counter_values_check" CHECK ("year" BETWEEN 0 AND 99 AND "last_no" BETWEEN 0 AND 9999);
