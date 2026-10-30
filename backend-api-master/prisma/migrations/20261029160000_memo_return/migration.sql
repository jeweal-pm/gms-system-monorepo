-- memo-return SA revision 2 (owner 2026-10-29): Memo Return sends Memo Stock items (ADR-0034) back to their vendor.
-- Each line names the memo_stock row it returns; approval (PENDING_APPROVAL -> APPROVED) reduces that row's pending
-- quantity (owner Q-MR-15). Numbers from Document Setup key memo-return. Additive, no backfill.
-- Rollback (only before any memo return is approved): DROP memo_return_charge, memo_return_line, memo_return.

-- CreateTable
CREATE TABLE "partner"."memo_return" (
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

    CONSTRAINT "memo_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_return_line" (
    "id" UUID NOT NULL,
    "memo_return_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "memo_stock_id" UUID NOT NULL,
    "stock_id" VARCHAR(10) NOT NULL,
    "outstanding_pcs" INTEGER NOT NULL,
    "outstanding_weight_ct" DECIMAL(12,3) NOT NULL,
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

    CONSTRAINT "memo_return_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."memo_return_charge" (
    "memo_return_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "memo_return_charge_pkey" PRIMARY KEY ("memo_return_id","charge_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "memo_return_doc_no_key" ON "partner"."memo_return"("doc_no");
CREATE UNIQUE INDEX "memo_return_numbering_running_no_key" ON "partner"."memo_return"("numbering_id", "running_no");
CREATE UNIQUE INDEX "memo_return_plain_running_no_key" ON "partner"."memo_return"("running_no") WHERE ("numbering_id" IS NULL);
CREATE INDEX "memo_return_list_idx" ON "partner"."memo_return"("doc_date" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "memo_return_vendor_idx" ON "partner"."memo_return"("vendor_id", "doc_date" DESC);
CREATE INDEX "memo_return_status_idx" ON "partner"."memo_return"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "memo_return_address_idx" ON "partner"."memo_return"("address_id");
CREATE UNIQUE INDEX "memo_return_line_position_key" ON "partner"."memo_return_line"("memo_return_id", "position");
CREATE UNIQUE INDEX "memo_return_line_memo_stock_key" ON "partner"."memo_return_line"("memo_return_id", "memo_stock_id");
CREATE INDEX "memo_return_line_memo_stock_idx" ON "partner"."memo_return_line"("memo_stock_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_return" ADD CONSTRAINT "memo_return_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_return" ADD CONSTRAINT "memo_return_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_return" ADD CONSTRAINT "memo_return_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "partner"."vendor_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_return_line" ADD CONSTRAINT "memo_return_line_memo_return_id_fkey" FOREIGN KEY ("memo_return_id") REFERENCES "partner"."memo_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_return_line" ADD CONSTRAINT "memo_return_line_memo_stock_id_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_return_charge" ADD CONSTRAINT "memo_return_charge_memo_return_id_fkey" FOREIGN KEY ("memo_return_id") REFERENCES "partner"."memo_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks (Prisma does not model CHECK constraints)
ALTER TABLE "partner"."memo_return"
  ADD CONSTRAINT "memo_return_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "memo_return_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL))),
  ADD CONSTRAINT "memo_return_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "memo_return_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "memo_return_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "memo_return_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "memo_return_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "memo_return_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."memo_return_line"
  ADD CONSTRAINT "memo_return_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "source" IN ('MANUAL', 'STOCK') AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0),
  -- A return never exceeds the pending quantity of its Memo Stock item when the line was saved.
  ADD CONSTRAINT "memo_return_line_outstanding_check" CHECK ("pcs" <= "outstanding_pcs" AND "weight_ct" <= "outstanding_weight_ct");
ALTER TABLE "partner"."memo_return_charge"
  ADD CONSTRAINT "memo_return_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
