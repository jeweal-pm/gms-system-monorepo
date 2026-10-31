-- memo-out-return SA revision 2 / ADR-0033 revision 3 (owner 2026-10-31: "อนุมัติ memo-out-return revision 4").
-- Memo Out Return: the customer brings back what a Memo Out lent (Q-MOR-11/12: customer + Shipping / Invoice address);
-- each line names an approved Memo Out From Stock line (SA-MOR-13); PENDING_APPROVAL -> APPROVED (Q-MOR-14), and
-- approval adds to memo_out_line.returned_* and moves the Memo Stock item from Reserve back to pending (SA-MOR-17).
-- The party columns change, so the migration stops if any memo out return exists (Q-MOR-17).
-- Rollback (only while no memo out return is APPROVED and the table is empty): drop the new columns, constraints and
--   indexes below and restore the vendor columns, FKs, indexes and status CHECK of 20261028090000_memo_out.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."memo_out_return") THEN
    RAISE EXCEPTION 'memo_out_return has rows: the party changes from vendor to customer (Q-MOR-17); remove them first';
  END IF;
END $$;

-- memo_out_return: vendor party -> customer party with Shipping / Invoice addresses, approval columns.
ALTER TABLE "partner"."memo_out_return" DROP CONSTRAINT "memo_out_return_vendor_id_fkey";
ALTER TABLE "partner"."memo_out_return" DROP CONSTRAINT "memo_out_return_address_id_fkey";
DROP INDEX "partner"."memo_out_return_vendor_idx";
DROP INDEX "partner"."memo_out_return_address_idx";
ALTER TABLE "partner"."memo_out_return"
  DROP COLUMN "vendor_id",
  DROP COLUMN "vendor_code_snapshot",
  DROP COLUMN "vendor_name_snapshot",
  DROP COLUMN "address_id",
  DROP COLUMN "address_snapshot",
  ADD COLUMN "customer_id" UUID NOT NULL,
  ADD COLUMN "customer_code_snapshot" VARCHAR(120) NOT NULL,
  ADD COLUMN "customer_name_snapshot" VARCHAR(200) NOT NULL,
  ADD COLUMN "shipping_address_id" UUID,
  ADD COLUMN "shipping_address_snapshot" VARCHAR(1000) NOT NULL,
  ADD COLUMN "invoice_address_id" UUID,
  ADD COLUMN "invoice_address_snapshot" VARCHAR(1000) NOT NULL,
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" VARCHAR(64);

ALTER TABLE "partner"."memo_out_return" DROP CONSTRAINT "memo_out_return_status_check";
ALTER TABLE "partner"."memo_out_return"
  ADD CONSTRAINT "memo_out_return_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
  ADD CONSTRAINT "memo_out_return_approved_check" CHECK ((("status" = 'APPROVED') = ("approved_at" IS NOT NULL)) AND (("approved_at" IS NULL) = ("approved_by" IS NULL)));

ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "partner"."customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_shipping_address_id_fkey" FOREIGN KEY ("shipping_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "partner"."memo_out_return" ADD CONSTRAINT "memo_out_return_invoice_address_id_fkey" FOREIGN KEY ("invoice_address_id") REFERENCES "partner"."customer_address"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "memo_out_return_customer_idx" ON "partner"."memo_out_return"("customer_id", "doc_date" DESC);
CREATE INDEX "memo_out_return_status_idx" ON "partner"."memo_out_return"("status", "doc_date" DESC, "created_at" DESC, "id" DESC);
CREATE INDEX "memo_out_return_shipping_address_idx" ON "partner"."memo_out_return"("shipping_address_id");
CREATE INDEX "memo_out_return_invoice_address_idx" ON "partner"."memo_out_return"("invoice_address_id");

-- memo_out_return_line: the Memo Out line it brings back (once per document).
ALTER TABLE "partner"."memo_out_return_line" ADD COLUMN "memo_out_line_id" UUID NOT NULL;
ALTER TABLE "partner"."memo_out_return_line" ADD CONSTRAINT "memo_out_return_line_memo_out_line_id_fkey" FOREIGN KEY ("memo_out_line_id") REFERENCES "partner"."memo_out_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "memo_out_return_line_memo_out_line_key" ON "partner"."memo_out_return_line"("memo_out_return_id", "memo_out_line_id");
CREATE INDEX "memo_out_return_line_memo_out_line_idx" ON "partner"."memo_out_return_line"("memo_out_line_id");

-- memo_out_line: what approved returns brought back; outstanding = out - returned (SA-MOR-14).
ALTER TABLE "partner"."memo_out_line"
  ADD COLUMN "returned_pcs" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "returned_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "partner"."memo_out_line"
  ADD CONSTRAINT "memo_out_line_returned_check" CHECK ("returned_pcs" BETWEEN 0 AND "pcs" AND "returned_weight_ct" >= 0 AND "returned_weight_ct" <= "weight_ct");
-- Memo Outstanding picker: open From Stock lines only.
CREATE INDEX "memo_out_line_open_idx" ON "partner"."memo_out_line"("memo_out_id")
  WHERE "memo_stock_id" IS NOT NULL AND ("returned_pcs" < "pcs" OR "returned_weight_ct" < "weight_ct");
