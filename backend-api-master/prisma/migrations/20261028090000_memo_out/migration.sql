-- memo-out + memo-out-return SA revision 1 / ADR-0033 (owner 2026-10-28: "ให้ Memo Out กับ Memo Out Return เชื่อมกับ
-- document setup และ ทำ api เลย"). Additive: six new tables in schema "partner"; no existing table changes.
-- Memo Out = customer + shipping/invoice address (like quotation); Memo Out Return = vendor + one address.
-- Rollback: DROP memo_out_return_charge, memo_out_return_line, memo_out_return, memo_out_charge, memo_out_line, memo_out.

-- CreateTable
CREATE TABLE "partner"."memo_out" (
    "id" UUID NOT NULL,
    "numbering_id" UUID,
    "running_no" INTEGER NOT NULL,
    "doc_no" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "doc_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_code_snapshot" VARCHAR(120) NOT NULL,
    "customer_name_snapshot" VARCHAR(200) NOT NULL,
    "shipping_address_id" UUID,
    "shipping_address_snapshot" VARCHAR(1000) NOT NULL,
    "invoice_address_id" UUID,
    "invoice_address_snapshot" VARCHAR(1000) NOT NULL,
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "memo_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_out_line" (
    "id" UUID NOT NULL,
    "memo_out_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "stone_code_id" UUID,
    "stone_code_snapshot" VARCHAR(60) NOT NULL DEFAULT '',
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
    "pcs" INTEGER NOT NULL,
    "weight_ct" DECIMAL(12,3) NOT NULL,
    "price_unit" VARCHAR(10) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL,
    "item_note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "memo_out_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_out_charge" (
    "memo_out_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "memo_out_charge_pkey" PRIMARY KEY ("memo_out_id","charge_type")
);

-- CreateTable
CREATE TABLE "partner"."memo_out_return" (
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "memo_out_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_out_return_line" (
    "id" UUID NOT NULL,
    "memo_out_return_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "stone_code_id" UUID,
    "stone_code_snapshot" VARCHAR(60) NOT NULL DEFAULT '',
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
    "pcs" INTEGER NOT NULL,
    "weight_ct" DECIMAL(12,3) NOT NULL,
    "price_unit" VARCHAR(10) NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,2) NOT NULL,
    "item_note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "memo_out_return_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_out_return_charge" (
    "memo_out_return_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "memo_out_return_charge_pkey" PRIMARY KEY ("memo_out_return_id","charge_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_doc_no_key" ON "partner"."memo_out"("doc_no");

-- CreateIndex
CREATE INDEX "memo_out_list_idx" ON "partner"."memo_out"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "memo_out_customer_idx" ON "partner"."memo_out"("customer_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "memo_out_shipping_address_idx" ON "partner"."memo_out"("shipping_address_id");

-- CreateIndex
CREATE INDEX "memo_out_invoice_address_idx" ON "partner"."memo_out"("invoice_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_numbering_running_no_key" ON "partner"."memo_out"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_plain_running_no_key" ON "partner"."memo_out"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE INDEX "memo_out_line_stone_code_idx" ON "partner"."memo_out_line"("stone_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_line_position_key" ON "partner"."memo_out_line"("memo_out_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_return_doc_no_key" ON "partner"."memo_out_return"("doc_no");

-- CreateIndex
CREATE INDEX "memo_out_return_list_idx" ON "partner"."memo_out_return"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "memo_out_return_vendor_idx" ON "partner"."memo_out_return"("vendor_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "memo_out_return_address_idx" ON "partner"."memo_out_return"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_return_numbering_running_no_key" ON "partner"."memo_out_return"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_return_plain_running_no_key" ON "partner"."memo_out_return"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE INDEX "memo_out_return_line_stone_code_idx" ON "partner"."memo_out_return_line"("stone_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "memo_out_return_line_position_key" ON "partner"."memo_out_return_line"("memo_out_return_id", "position");

-- AddForeignKey
ALTER TABLE "partner"."memo_out" ADD CONSTRAINT "memo_out_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out" ADD CONSTRAINT "memo_out_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partner"."customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out" ADD CONSTRAINT "memo_out_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out" ADD CONSTRAINT "memo_out_invoice_address_id_fkey" FOREIGN KEY ("invoice_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_memo_out_id_fkey" FOREIGN KEY ("memo_out_id") REFERENCES "partner"."memo_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_charge" ADD CONSTRAINT "memo_out_charge_memo_out_id_fkey" FOREIGN KEY ("memo_out_id") REFERENCES "partner"."memo_out"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "partner"."vendor_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return_line" ADD CONSTRAINT "memo_out_return_line_memo_out_return_id_fkey" FOREIGN KEY ("memo_out_return_id") REFERENCES "partner"."memo_out_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return_line" ADD CONSTRAINT "memo_out_return_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return_charge" ADD CONSTRAINT "memo_out_return_charge_memo_out_return_id_fkey" FOREIGN KEY ("memo_out_return_id") REFERENCES "partner"."memo_out_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Value checks (same rules as quotation SA-QT-03/07/08; rev 1 documents are drafts only).
ALTER TABLE "partner"."memo_out"
  ADD CONSTRAINT "memo_out_status_check" CHECK ("status" IN ('DRAFT')),
  ADD CONSTRAINT "memo_out_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "memo_out_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "memo_out_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "memo_out_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "memo_out_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "memo_out_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."memo_out_return"
  ADD CONSTRAINT "memo_out_return_status_check" CHECK ("status" IN ('DRAFT')),
  ADD CONSTRAINT "memo_out_return_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "memo_out_return_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "memo_out_return_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "memo_out_return_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "memo_out_return_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "memo_out_return_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."memo_out_line"
  ADD CONSTRAINT "memo_out_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "partner"."memo_out_return_line"
  ADD CONSTRAINT "memo_out_return_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "partner"."memo_out_charge"
  ADD CONSTRAINT "memo_out_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
ALTER TABLE "partner"."memo_out_return_charge"
  ADD CONSTRAINT "memo_out_return_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
