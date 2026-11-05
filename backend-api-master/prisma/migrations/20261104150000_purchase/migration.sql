-- purchase SA revision 1 / ADR-0042 (owner 2026-11-04: "backend ทำ api เลย …", clarified "Purchase ปุ่ม Memo Stock จะตัดจาก
-- stock ของ memo และปุ่ม Purchase Order PU จะตัด stock จากการตัดใบ PO ที่มีการซื้อเข้าเข้ามา").
-- Expand only: memo_stock gains purchased_pcs / purchased_weight_ct (default 0, <= sold) and a partial index for the
-- SOLD picker group; purchase_order_line gains a partial index of open lines; three new tables purchase,
-- purchase_line and purchase_charge in schema partner. No backfill (nothing writes sold_* yet, so every row has
-- sold = purchased = 0 and the new CHECK validates at once). memo_stock_balance is unchanged.
--
-- Rollback (database-diagram.md):
-- * While no purchase exists, or only PENDING_APPROVAL purchases exist (a pending purchase cuts nothing, SA default D2):
--     DROP TABLE "partner"."purchase_charge", "partner"."purchase_line", "partner"."purchase";
--     DROP INDEX "partner"."memo_stock_sold_open_idx", "partner"."purchase_order_line_open_idx";
--     ALTER TABLE "partner"."memo_stock" DROP CONSTRAINT "memo_stock_purchased_check",
--       DROP COLUMN "purchased_pcs", DROP COLUMN "purchased_weight_ct";
-- * Once APPROVED purchases exist, first reverse their stock in one transaction, then drop as above:
--     UPDATE "partner"."memo_stock" s SET pending_pcs = s.pending_pcs + h.p, pending_weight_ct = s.pending_weight_ct + h.w,
--       sold_pcs = s.sold_pcs - h.p, sold_weight_ct = s.sold_weight_ct - h.w
--     FROM (SELECT l.memo_stock_id, sum(l.pcs) p, sum(l.weight_ct) w FROM "partner"."purchase_line" l
--           JOIN "partner"."purchase" d ON d.id = l.purchase_id
--           WHERE d.status = 'APPROVED' AND l.memo_group = 'IN_STOCK' GROUP BY 1) h
--     WHERE s.id = h.memo_stock_id;
--     UPDATE "partner"."purchase_order_line" o SET purchased_pcs = o.purchased_pcs - h.p, purchased_weight_ct = o.purchased_weight_ct - h.w
--     FROM (SELECT l.purchase_order_line_id, sum(l.pcs) p, sum(l.weight_ct) w FROM "partner"."purchase_line" l
--           JOIN "partner"."purchase" d ON d.id = l.purchase_id
--           WHERE d.status = 'APPROVED' AND l.purchase_order_line_id IS NOT NULL GROUP BY 1) h
--     WHERE o.id = h.purchase_order_line_id;
--   SOLD-group purchases disappear with the dropped purchased_* columns, and every purchase is lost with the tables:
--   a rollback with approved data is a business decision.

-- AlterTable: settlement counter of the sold bucket (SA-PU-05, SA default D1).
ALTER TABLE "partner"."memo_stock"
  ADD COLUMN "purchased_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purchased_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;

ALTER TABLE "partner"."memo_stock"
  ADD CONSTRAINT "memo_stock_purchased_check" CHECK ("purchased_pcs" >= 0 AND "purchased_weight_ct" >= 0
    AND "purchased_pcs" <= "sold_pcs" AND "purchased_weight_ct" <= "sold_weight_ct");

-- CreateTable
CREATE TABLE "partner"."purchase" (
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

    CONSTRAINT "purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."purchase_line" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "source" VARCHAR(16) NOT NULL,
    "memo_stock_id" UUID,
    "memo_group" VARCHAR(10),
    "purchase_order_line_id" UUID,
    "stock_id" VARCHAR(10) NOT NULL,
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

    CONSTRAINT "purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner"."purchase_charge" (
    "purchase_id" UUID NOT NULL,
    "charge_type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "purchase_charge_pkey" PRIMARY KEY ("purchase_id","charge_type")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_doc_no_key" ON "partner"."purchase"("doc_no");

-- CreateIndex
CREATE INDEX "purchase_list_idx" ON "partner"."purchase"("doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "purchase_vendor_idx" ON "partner"."purchase"("vendor_id", "doc_date" DESC);

-- CreateIndex
CREATE INDEX "purchase_status_idx" ON "partner"."purchase"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "purchase_address_idx" ON "partner"."purchase"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_numbering_running_no_key" ON "partner"."purchase"("numbering_id", "running_no");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_plain_running_no_key" ON "partner"."purchase"("running_no") WHERE ("numbering_id" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_line_position_key" ON "partner"."purchase_line"("purchase_id", "position");

-- CreateIndex: a Memo Stock item at most once per group in a document (NULLs distinct, so STOCK lines only).
CREATE UNIQUE INDEX "purchase_line_memo_stock_key" ON "partner"."purchase_line"("purchase_id", "memo_stock_id", "memo_group");

-- CreateIndex: a PO line at most once per document.
CREATE UNIQUE INDEX "purchase_line_po_line_key" ON "partner"."purchase_line"("purchase_id", "purchase_order_line_id");

-- CreateIndex: issued Stock IDs (MANUAL / PURCHASE_ORDER, SA-PU-10) never repeat; STOCK lines repeat their item's id.
CREATE UNIQUE INDEX "purchase_line_issued_stock_id_key" ON "partner"."purchase_line"("stock_id") WHERE ("source" <> 'STOCK');

-- CreateIndex
CREATE INDEX "purchase_line_memo_stock_idx" ON "partner"."purchase_line"("memo_stock_id");

-- CreateIndex
CREATE INDEX "purchase_line_po_line_idx" ON "partner"."purchase_line"("purchase_order_line_id");

-- CreateIndex
CREATE INDEX "purchase_line_stone_code_idx" ON "partner"."purchase_line"("stone_code_id");

-- CreateIndex: the SOLD group of the Memo Stock picker (empty until a Sale document writes sold_*).
CREATE INDEX "memo_stock_sold_open_idx" ON "partner"."memo_stock"("vendor_id", "received_doc_date" DESC, "stock_id" DESC)
  WHERE (("sold_pcs" > "purchased_pcs") OR ("sold_weight_ct" > "purchased_weight_ct"));

-- CreateIndex: the Purchase Order picker (lines with something still to purchase).
CREATE INDEX "purchase_order_line_open_idx" ON "partner"."purchase_order_line"("purchase_order_id")
  WHERE (("purchased_pcs" < "pcs") OR ("purchased_weight_ct" < "weight_ct"));

-- AddForeignKey
ALTER TABLE "partner"."purchase" ADD CONSTRAINT "purchase_numbering_id_fkey" FOREIGN KEY ("numbering_id") REFERENCES "partner"."document_numbering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase" ADD CONSTRAINT "purchase_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "partner"."vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase" ADD CONSTRAINT "purchase_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "partner"."vendor_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "partner"."purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_stone_code_id_fkey" FOREIGN KEY ("stone_code_id") REFERENCES "stone"."stone_code"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_memo_stock_id_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "partner"."purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_charge" ADD CONSTRAINT "purchase_charge_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "partner"."purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Value checks (database-diagram.md: the purchase_order set renamed purchase_*, plus the line source rules).
ALTER TABLE "partner"."purchase"
  ADD CONSTRAINT "purchase_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "purchase_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL))),
  ADD CONSTRAINT "purchase_due_date_check" CHECK ("due_date" >= "doc_date"),
  ADD CONSTRAINT "purchase_running_no_check" CHECK ("running_no" >= 1),
  ADD CONSTRAINT "purchase_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0),
  ADD CONSTRAINT "purchase_tax_rate_check" CHECK ("tax_rate" >= 0 AND "tax_rate" <= 100),
  ADD CONSTRAINT "purchase_exchange_rate_check" CHECK ("exchange_rate" IS NULL OR "exchange_rate" > 0),
  ADD CONSTRAINT "purchase_totals_check" CHECK ("subtotal" >= 0 AND "discount_amount" >= 0 AND "discount_amount" <= "subtotal" AND "grand_total" >= 0),
  ADD CONSTRAINT "purchase_version_check" CHECK ("version" >= 1);
ALTER TABLE "partner"."purchase_line"
  ADD CONSTRAINT "purchase_line_source_check" CHECK ("source" IN ('STOCK', 'PURCHASE_ORDER', 'MANUAL')
    AND (("source" = 'STOCK') = ("memo_stock_id" IS NOT NULL AND "memo_group" IS NOT NULL))
    AND (("source" = 'PURCHASE_ORDER') = ("purchase_order_line_id" IS NOT NULL))
    AND ("source" = 'STOCK' OR ("memo_group" IS NULL AND "memo_stock_id" IS NULL))),
  ADD CONSTRAINT "purchase_line_memo_group_check" CHECK ("memo_group" IS NULL OR "memo_group" IN ('IN_STOCK', 'SOLD')),
  ADD CONSTRAINT "purchase_line_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0) AND "unit_price" > 0),
  ADD CONSTRAINT "purchase_line_values_check" CHECK ("position" BETWEEN 1 AND 200 AND "price_unit" IN ('PER_CT', 'PER_PCS')
    AND "pcs" BETWEEN 0 AND 999999 AND "weight_ct" >= 0 AND "unit_price" >= 0 AND "amount" >= 0
    AND "discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);
ALTER TABLE "partner"."purchase_charge"
  ADD CONSTRAINT "purchase_charge_values_check" CHECK ("charge_type" IN ('SHIPPING', 'HANDLING', 'INSURANCE', 'CERTIFICATE') AND "amount" >= 0);
