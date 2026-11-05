-- purchase-order SA revision 1 / ADR-0041 (owner 2026-11-04: "อนุมัติ purchase-order revision 1").
-- Expand only: 4 new tables in schema partner; no existing table changes, no backfill.
-- Rollback (before Purchase uses them): DROP purchase_order_line_photo, purchase_order_charge, purchase_order_line,
-- purchase_order. Photo bytes and stored_files rows stay (ADR-0030).

-- CreateTable
CREATE TABLE "partner"."purchase_order" (
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

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."purchase_order_line" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
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
    "purchased_pcs" INTEGER NOT NULL DEFAULT 0,
    "purchased_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."purchase_order_charge" (
    "purchase_order_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_order_charge_pkey" PRIMARY KEY ("purchase_order_id","charge_type")
);

-- CreateTable
CREATE TABLE "partner"."purchase_order_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "purchase_order_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_doc_no_key" ON "partner"."purchase_order"("doc_no");

-- CreateIndex
CREATE INDEX "purchase_order_list_idx" ON "partner"."purchase_order"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "purchase_order_vendor_idx" ON "partner"."purchase_order"("vendor_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "purchase_order_status_idx" ON "partner"."purchase_order"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "purchase_order_address_idx" ON "partner"."purchase_order"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_numbering_running_no_key" ON "partner"."purchase_order"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_plain_running_no_key" ON "partner"."purchase_order"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_position_key" ON "partner"."purchase_order_line"("purchase_order_id", "position");

-- CreateIndex
CREATE INDEX "purchase_order_line_stone_code_idx" ON "partner"."purchase_order_line"("stone_code_id");

-- CreateIndex
CREATE INDEX "purchase_order_line_photo_file_idx" ON "partner"."purchase_order_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."purchase_order" ADD CONSTRAINT "purchase_order_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order" ADD CONSTRAINT "purchase_order_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order" ADD CONSTRAINT "purchase_order_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "partner"."vendor_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "partner"."purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order_line" ADD CONSTRAINT "purchase_order_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order_charge" ADD CONSTRAINT "purchase_order_charge_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "partner"."purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order_line_photo" ADD CONSTRAINT "purchase_order_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."purchase_order_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_order_line_photo" ADD CONSTRAINT "purchase_order_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value checks (database-diagram.md; the memo_receive rules, MANUAL lines only, purchased ≤ ordered).
ALTER TABLE "partner"."purchase_order"
  ADD CONSTRAINT "purchase_order_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "purchase_order_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL))),
  ADD CONSTRAINT "purchase_order_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "purchase_order_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "purchase_order_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "purchase_order_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "purchase_order_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "purchase_order_totals_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal" AND "grand_total" >= 0),
  ADD CONSTRAINT "purchase_order_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."purchase_order_line"
  ADD CONSTRAINT "purchase_order_line_source_check" CHECK ("source" = 'MANUAL'),
  ADD CONSTRAINT "purchase_order_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0),
  ADD CONSTRAINT "purchase_order_line_purchased_check" CHECK ("purchased_pcs" BETWEEN 0 AND "pcs" AND "purchased_weight_ct" >= 0 AND "purchased_weight_ct" <= "weight_ct");
ALTER TABLE "partner"."purchase_order_charge"
  ADD CONSTRAINT "purchase_order_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
ALTER TABLE "partner"."purchase_order_line_photo"
  ADD CONSTRAINT "purchase_order_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);
