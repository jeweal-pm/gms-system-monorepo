-- quotation SA revision 1 / ADR-0032 (approved by the owner 2026-10-26, "อนุมัติ SA quotation rev 1").
-- Additive: four new tables in schema "partner"; no existing table or index changes.
-- Rollback: DROP quotation_line_photo, quotation_charge, quotation_line, quotation (photo bytes stay, ADR-0030).

-- CreateTable
CREATE TABLE "partner"."quotation" (
    "id" UUID NOT NULL,
    "numbering_id" UUID NOT NULL,
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
    "status_reason" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(64) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" VARCHAR(64),

    CONSTRAINT "quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."quotation_line" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
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
    "amount" DECIMAL(18,2) NOT NULL,
    "item_note" VARCHAR(500) NOT NULL DEFAULT '',

    CONSTRAINT "quotation_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."quotation_charge" (
    "quotation_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "quotation_charge_pkey" PRIMARY KEY ("quotation_id","charge_type")
);

-- CreateTable
CREATE TABLE "partner"."quotation_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "quotation_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotation_doc_no_key" ON "partner"."quotation"("doc_no");

-- CreateIndex
CREATE INDEX "quotation_list_idx" ON "partner"."quotation"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "quotation_status_list_idx" ON "partner"."quotation"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "quotation_customer_idx" ON "partner"."quotation"("customer_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "quotation_shipping_address_idx" ON "partner"."quotation"("shipping_address_id");

-- CreateIndex
CREATE INDEX "quotation_invoice_address_idx" ON "partner"."quotation"("invoice_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_numbering_running_no_key" ON "partner"."quotation"("numbering_id", "running_no");

-- CreateIndex
CREATE INDEX "quotation_line_stone_code_idx" ON "partner"."quotation_line"("stone_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_line_position_key" ON "partner"."quotation_line"("quotation_id", "position");

-- CreateIndex
CREATE INDEX "quotation_line_photo_file_idx" ON "partner"."quotation_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."quotation" ADD CONSTRAINT "quotation_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation" ADD CONSTRAINT "quotation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partner"."customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation" ADD CONSTRAINT "quotation_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation" ADD CONSTRAINT "quotation_invoice_address_id_fkey" FOREIGN KEY ("invoice_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "partner"."quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation_charge" ADD CONSTRAINT "quotation_charge_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "partner"."quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation_line_photo" ADD CONSTRAINT "quotation_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."quotation_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."quotation_line_photo" ADD CONSTRAINT "quotation_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Value checks (SA-QT-03/07/08).
ALTER TABLE "partner"."quotation"
  ADD CONSTRAINT "quotation_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
  ADD CONSTRAINT "quotation_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "quotation_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "quotation_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "quotation_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "quotation_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "quotation_labor_check" CHECK (("labor_work" IS NULL AND "labor_basis" IS NULL AND "labor_qty" IS NULL AND "labor_rate" IS NULL)
    OR ("labor_basis" IN ('PCS', 'WEIGHT') AND "labor_qty" >= 0 AND "labor_rate" >= 0)),
  ADD CONSTRAINT "quotation_version_check" CHECK ("version" >= 1);

ALTER TABLE "partner"."quotation_line"
  ADD CONSTRAINT "quotation_line_position_check" CHECK ("position" BETWEEN 1 AND 200),
  ADD CONSTRAINT "quotation_line_source_check" CHECK ("source" IN ('MANUAL', 'STOCK')),
  ADD CONSTRAINT "quotation_line_price_unit_check" CHECK ("price_unit" IN ('PER_CT', 'PER_PCS')),
  ADD CONSTRAINT "quotation_line_values_check" CHECK ("pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0);

ALTER TABLE "partner"."quotation_charge"
  ADD CONSTRAINT "quotation_charge_type_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE')),
  ADD CONSTRAINT "quotation_charge_amount_check" CHECK ("amount" >= 0);

ALTER TABLE "partner"."quotation_line_photo"
  ADD CONSTRAINT "quotation_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 4);
