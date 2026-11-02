-- reserve SA revision 1 / ADR-0036 (owner 2026-11-02: "อนุมัติ reserve revision 1"): Reserve holds stones for a
-- customer for a later Sale. Same shape as memo_out after 20261031090000_memo_out_from_stock: customer + shipping /
-- invoice address, Document Setup number (key reserve), PENDING_APPROVAL -> APPROVED, lines that may name a Memo Stock
-- item (From Stock). Approval moves those lines from memo_stock pending into reserved (SA-RS-07). Additive, no backfill.
-- Rollback (only while no reserve is APPROVED): DROP TABLE reserve_charge, reserve_line, reserve.

-- CreateTable
CREATE TABLE "partner"."reserve" (
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
    "approved_at" TIMESTAMP(3),
    "approved_by" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(64) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(64) NOT NULL,

    CONSTRAINT "reserve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."reserve_line" (
    "id" UUID NOT NULL,
    "reserve_id" UUID NOT NULL,
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
    "memo_stock_id" UUID,
    "stock_id" VARCHAR(10),
    "stock_pending_pcs" INTEGER,
    "stock_pending_weight_ct" DECIMAL(12,3),

    CONSTRAINT "reserve_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."reserve_charge" (
    "reserve_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "reserve_charge_pkey" PRIMARY KEY ("reserve_id","charge_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "reserve_doc_no_key" ON "partner"."reserve"("doc_no");

-- CreateIndex
CREATE INDEX "reserve_list_idx" ON "partner"."reserve"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "reserve_customer_idx" ON "partner"."reserve"("customer_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "reserve_status_idx" ON "partner"."reserve"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "reserve_shipping_address_idx" ON "partner"."reserve"("shipping_address_id");

-- CreateIndex
CREATE INDEX "reserve_invoice_address_idx" ON "partner"."reserve"("invoice_address_id");

-- CreateIndex
CREATE UNIQUE INDEX "reserve_numbering_running_no_key" ON "partner"."reserve"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "reserve_plain_running_no_key" ON "partner"."reserve"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE INDEX "reserve_line_stone_code_idx" ON "partner"."reserve_line"("stone_code_id");

-- CreateIndex
CREATE INDEX "reserve_line_memo_stock_idx" ON "partner"."reserve_line"("memo_stock_id");

-- CreateIndex
CREATE UNIQUE INDEX "reserve_line_position_key" ON "partner"."reserve_line"("reserve_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "reserve_line_memo_stock_key" ON "partner"."reserve_line"("reserve_id", "memo_stock_id");

-- AddForeignKey
ALTER TABLE "partner"."reserve" ADD CONSTRAINT "reserve_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve" ADD CONSTRAINT "reserve_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partner"."customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve" ADD CONSTRAINT "reserve_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve" ADD CONSTRAINT "reserve_invoice_address_id_fkey" FOREIGN KEY ("invoice_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_reserve_id_fkey" FOREIGN KEY ("reserve_id") REFERENCES "partner"."reserve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_memo_stock_id_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve_charge" ADD CONSTRAINT "reserve_charge_reserve_id_fkey" FOREIGN KEY ("reserve_id") REFERENCES "partner"."reserve"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks (Prisma does not model CHECK constraints)
ALTER TABLE "partner"."reserve"
  ADD CONSTRAINT "reserve_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "reserve_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL))),
  ADD CONSTRAINT "reserve_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "reserve_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "reserve_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "reserve_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "reserve_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "reserve_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."reserve_line"
  ADD CONSTRAINT "reserve_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0),
  -- A manual line has none of the stock columns; a stock line has all of them and takes at most the pending it saw.
  ADD CONSTRAINT "reserve_line_stock_check" CHECK (
    ("memo_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "source" = 'MANUAL')
    OR ("memo_stock_id" IS NOT NULL AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL
        AND "source" = 'STOCK' AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."reserve_charge"
  ADD CONSTRAINT "reserve_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
