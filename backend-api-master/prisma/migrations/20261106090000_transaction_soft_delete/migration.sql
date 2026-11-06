-- transaction-soft-delete SA revision 1 / ADR-0044 (owner 2026-11-06: "อยากทำ soft delete Quotation, Reserve, Memo Receive,
-- Memo Return, Memo Out, Memo Out Return, Purchase Order (PO), Purchase, ..."; approved "อนุมัติ เริ่มทำเลย", OQ-1:
-- Quotation deletable only before approval).
-- Expand only, on the 8 header tables in schema partner: deleted_at / deleted_by (nullable, no default: metadata-only),
-- CHECK <table>_deleted_check (both null, or both set in a deletable status: PENDING_APPROVAL for the engine documents,
-- DRAFT / PENDING_APPROVAL for quotation), and partial index <table>_deleted_list_idx for the Deleted list view.
-- Existing rows: the two columns are added NULL / NULL on every row, which satisfies the first branch of each CHECK, so
-- every CHECK validates at once with no backfill. Lines, charges, photo links and stored_files are not touched.
--
-- Rollback (database-diagram.md; roll the code back first, it selects the new columns):
--   -- Optional (business decision): remove deleted drafts so they don't reappear as live drafts.
--   -- DELETE FROM "partner"."<table>" WHERE deleted_at IS NOT NULL;   -- lines/charges/photo links cascade; stored_files stay
--   DROP INDEX "partner"."<table>_deleted_list_idx";
--   ALTER TABLE "partner"."<table>" DROP CONSTRAINT "<table>_deleted_check",
--     DROP COLUMN "deleted_at", DROP COLUMN "deleted_by";

-- quotation
ALTER TABLE "partner"."quotation"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."quotation"
  ADD CONSTRAINT "quotation_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('DRAFT', 'PENDING_APPROVAL')));

CREATE INDEX "quotation_deleted_list_idx" ON "partner"."quotation"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- reserve
ALTER TABLE "partner"."reserve"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."reserve"
  ADD CONSTRAINT "reserve_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "reserve_deleted_list_idx" ON "partner"."reserve"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- memo_receive
ALTER TABLE "partner"."memo_receive"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."memo_receive"
  ADD CONSTRAINT "memo_receive_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "memo_receive_deleted_list_idx" ON "partner"."memo_receive"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- memo_return
ALTER TABLE "partner"."memo_return"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."memo_return"
  ADD CONSTRAINT "memo_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "memo_return_deleted_list_idx" ON "partner"."memo_return"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- memo_out
ALTER TABLE "partner"."memo_out"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."memo_out"
  ADD CONSTRAINT "memo_out_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "memo_out_deleted_list_idx" ON "partner"."memo_out"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- memo_out_return
ALTER TABLE "partner"."memo_out_return"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."memo_out_return"
  ADD CONSTRAINT "memo_out_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "memo_out_return_deleted_list_idx" ON "partner"."memo_out_return"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- purchase_order
ALTER TABLE "partner"."purchase_order"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."purchase_order"
  ADD CONSTRAINT "purchase_order_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "purchase_order_deleted_list_idx" ON "partner"."purchase_order"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);

-- purchase
ALTER TABLE "partner"."purchase"
  ADD COLUMN "deleted_at" TIMESTAMP(3),
  ADD COLUMN "deleted_by" VARCHAR(64);

ALTER TABLE "partner"."purchase"
  ADD CONSTRAINT "purchase_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));

CREATE INDEX "purchase_deleted_list_idx" ON "partner"."purchase"("doc_date" DESC, "created_at" DESC, "id" DESC)
  WHERE ("deleted_at" IS NOT NULL);
