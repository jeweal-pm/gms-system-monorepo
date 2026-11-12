-- approval-setup SA revision 1 / ADR-0048 (accepted 2026-11-10 "อนุมัติ ADR-0048"; backend started 2026-11-10 "เริ่ม backend approval").
-- Amends 20261107090000_approval_review (ADR-0046); applies right after it in the same release.
--   1. partner.approval_setting: one row per approval type (11 keys), seeded quotation = false, all others = true.
--   2. Eight headers (the seven engine documents + quotation): auto_approved (NOT NULL DEFAULT false) and revision_count
--      (NOT NULL DEFAULT 0, 0..1); DRAFT added to every status CHECK. Engine headers: submitted_at / submitted_by become
--      nullable (set by submit); new submitted / auto-approved / revision-count CHECKs; deleted CHECK widened.
--      Quotation joins with the ADR-0046 columns (review, submitted, totals), backfilled from its lines; its pending index.
--   3. Partial index <t>_revision_idx (id) WHERE status = 'REVISION_REQUESTED' AND deleted_at IS NULL per header
--      (turn-OFF guard and Setup counts).
--   4. Backfill: quotation APPROVED rows -> auto_approved = true (Save-approved quotations stay editable while Quotation is
--      OFF); quotation PENDING_APPROVAL / REJECTED rows -> submitted_* = created_*. Every other row keeps auto_approved =
--      false, revision_count = 0. No document is approved by SQL: pending documents are handled by the go-live command.
--
-- isUsed FK indexes verified present (no index added here): memo_stock_memo_receive_line_id_key,
-- memo_out_return_line_memo_out_line_idx, purchase_line_memo_stock_idx, purchase_line_po_line_idx,
-- reserve_line_memo_stock_idx, memo_out_line_memo_stock_idx, memo_return_line_memo_stock_idx, quotation_line_memo_stock_idx.
--
-- Stage-1 deviations from database-diagram.md (backend implementation note, 2026-11-10; the follow-up migration of
-- stage 2 tightens them together with the code that needs them):
--   * <t>_deleted_check keeps PENDING_APPROVAL as a deletable status (today's delete path and any soft-deleted pending
--     rows already in the database); DRAFT and auto-approved APPROVED are added.
--   * <t>_submitted_check exempts auto-approved rows (auto_approved_check requires submitted_at IS NULL on them) and
--     deleted rows, as the diagram's "non-deleted rows" says.
--   * quotation: submitted / auto-approved / review-status CHECKs are deferred to stage 2 (the quotation flow rewrite),
--     because today's quotation submit / reject / cancel paths do not write the review / submitted columns yet.
--
-- Rollback (database-diagram.md › Rollback). Before any DRAFT / revise is used:
--   DROP TABLE "partner"."approval_setting";
--   per header: DROP INDEX "partner"."<t>_revision_idx"; DROP the new CHECKs (<t>_submitted_check, <t>_auto_approved_check,
--     <t>_revision_count_check) and restore the 20261107090000 versions of <t>_status_check / <t>_deleted_check;
--     UPDATE "partner"."<t>" SET submitted_at = created_at, submitted_by = created_by WHERE submitted_at IS NULL;
--     ALTER COLUMN submitted_at / submitted_by SET NOT NULL; DROP COLUMN auto_approved, revision_count.
--   quotation: DROP INDEX quotation_pending_idx, quotation_revision_idx; DROP CONSTRAINT quotation_review_check,
--     quotation_totals_qty_check, quotation_revision_count_check; restore quotation_status_check / quotation_deleted_check
--     of 20261026090000 / 20261106090000; DROP the 13 added columns.
-- After DRAFT is used: map DRAFT -> PENDING_APPROVAL with submitted_* = created_* first; auto-approved rows stay APPROVED.

-- 1. approval_setting
CREATE TABLE "partner"."approval_setting" (
  "type" VARCHAR(32) NOT NULL,
  "require_approval" BOOLEAN NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updated_by" VARCHAR(64),
  "updated_by_name" VARCHAR(200),
  CONSTRAINT "approval_setting_pkey" PRIMARY KEY ("type"),
  CONSTRAINT "approval_setting_type_check" CHECK ("type" IN ('quotation', 'reserve', 'memo-receive', 'memo-return', 'memo-out', 'memo-out-return', 'purchase-order', 'purchase', 'load-to-stock', 'merge-split', 'stock-transfer-location')),
  CONSTRAINT "approval_setting_version_check" CHECK ("version" >= 1)
);

INSERT INTO "partner"."approval_setting" ("type", "require_approval", "updated_at") VALUES
  ('quotation', false, now()),
  ('reserve', true, now()),
  ('memo-receive', true, now()),
  ('memo-return', true, now()),
  ('memo-out', true, now()),
  ('memo-out-return', true, now()),
  ('purchase-order', true, now()),
  ('purchase', true, now()),
  ('load-to-stock', true, now()),
  ('merge-split', true, now()),
  ('stock-transfer-location', true, now());

-- reserve
ALTER TABLE "partner"."reserve"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."reserve" DROP CONSTRAINT "reserve_status_check", DROP CONSTRAINT "reserve_deleted_check";
ALTER TABLE "partner"."reserve"
  ADD CONSTRAINT "reserve_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "reserve_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "reserve_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "reserve_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "reserve_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "reserve_revision_idx" ON "partner"."reserve"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- memo_receive
ALTER TABLE "partner"."memo_receive"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."memo_receive" DROP CONSTRAINT "memo_receive_status_check", DROP CONSTRAINT "memo_receive_deleted_check";
ALTER TABLE "partner"."memo_receive"
  ADD CONSTRAINT "memo_receive_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_receive_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "memo_receive_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "memo_receive_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "memo_receive_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "memo_receive_revision_idx" ON "partner"."memo_receive"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- memo_return
ALTER TABLE "partner"."memo_return"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."memo_return" DROP CONSTRAINT "memo_return_status_check", DROP CONSTRAINT "memo_return_deleted_check";
ALTER TABLE "partner"."memo_return"
  ADD CONSTRAINT "memo_return_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_return_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "memo_return_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "memo_return_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "memo_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "memo_return_revision_idx" ON "partner"."memo_return"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- memo_out
ALTER TABLE "partner"."memo_out"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."memo_out" DROP CONSTRAINT "memo_out_status_check", DROP CONSTRAINT "memo_out_deleted_check";
ALTER TABLE "partner"."memo_out"
  ADD CONSTRAINT "memo_out_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_out_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "memo_out_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "memo_out_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "memo_out_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "memo_out_revision_idx" ON "partner"."memo_out"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- memo_out_return
ALTER TABLE "partner"."memo_out_return"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."memo_out_return" DROP CONSTRAINT "memo_out_return_status_check", DROP CONSTRAINT "memo_out_return_deleted_check";
ALTER TABLE "partner"."memo_out_return"
  ADD CONSTRAINT "memo_out_return_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_out_return_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "memo_out_return_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "memo_out_return_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "memo_out_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "memo_out_return_revision_idx" ON "partner"."memo_out_return"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- purchase_order
ALTER TABLE "partner"."purchase_order"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."purchase_order" DROP CONSTRAINT "purchase_order_status_check", DROP CONSTRAINT "purchase_order_deleted_check";
ALTER TABLE "partner"."purchase_order"
  ADD CONSTRAINT "purchase_order_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "purchase_order_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "purchase_order_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "purchase_order_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "purchase_order_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "purchase_order_revision_idx" ON "partner"."purchase_order"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- purchase
ALTER TABLE "partner"."purchase"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0,
  ALTER COLUMN "submitted_at" DROP NOT NULL,
  ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "partner"."purchase" DROP CONSTRAINT "purchase_status_check", DROP CONSTRAINT "purchase_deleted_check";
ALTER TABLE "partner"."purchase"
  ADD CONSTRAINT "purchase_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "purchase_submitted_check" CHECK ((("submitted_at" IS NULL) = ("submitted_by" IS NULL))
    AND ("submitted_at" IS NOT NULL OR "submitted_by_name" IS NULL)
    AND ("deleted_at" IS NOT NULL OR "auto_approved" OR (("status" = 'DRAFT') = ("submitted_at" IS NULL)))),
  ADD CONSTRAINT "purchase_auto_approved_check" CHECK (NOT "auto_approved" OR ("status" = 'APPROVED' AND "submitted_at" IS NULL AND "review_action" IS NULL)),
  ADD CONSTRAINT "purchase_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "purchase_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "purchase_revision_idx" ON "partner"."purchase"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

-- quotation (joins ADR-0046 with the same columns; keeps CANCELLED and its status_reason)
ALTER TABLE "partner"."quotation"
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "submitted_by" VARCHAR(64),
  ADD COLUMN "submitted_by_name" VARCHAR(200),
  ADD COLUMN "review_action" VARCHAR(10),
  ADD COLUMN "review_note" VARCHAR(500),
  ADD COLUMN "reviewed_at" TIMESTAMP(3),
  ADD COLUMN "reviewed_by" VARCHAR(64),
  ADD COLUMN "reviewed_by_name" VARCHAR(200),
  ADD COLUMN "line_count" SMALLINT,
  ADD COLUMN "total_pcs" INTEGER,
  ADD COLUMN "total_weight_ct" DECIMAL(15,3);
ALTER TABLE "partner"."quotation"
  ADD COLUMN "auto_approved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "revision_count" SMALLINT NOT NULL DEFAULT 0;

UPDATE "partner"."quotation" d SET line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."quotation" h LEFT JOIN "partner"."quotation_line" l ON l."quotation_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

UPDATE "partner"."quotation" SET "auto_approved" = true WHERE "status" = 'APPROVED';
UPDATE "partner"."quotation" SET "submitted_at" = "created_at", "submitted_by" = "created_by" WHERE "status" IN ('PENDING_APPROVAL', 'REJECTED');

ALTER TABLE "partner"."quotation"
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."quotation" DROP CONSTRAINT "quotation_status_check", DROP CONSTRAINT "quotation_deleted_check";
ALTER TABLE "partner"."quotation"
  ADD CONSTRAINT "quotation_status_check" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'CANCELLED')),
  ADD CONSTRAINT "quotation_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "quotation_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "quotation_revision_count_check" CHECK ("revision_count" BETWEEN 0 AND 1 AND ("status" <> 'REVISION_REQUESTED' OR "revision_count" = 1)),
  ADD CONSTRAINT "quotation_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
      AND ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'REVISION_REQUESTED') OR ("status" = 'APPROVED' AND "auto_approved"))));

CREATE INDEX "quotation_pending_idx" ON "partner"."quotation"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);
CREATE INDEX "quotation_revision_idx" ON "partner"."quotation"("id") WHERE ("status" = 'REVISION_REQUESTED' AND "deleted_at" IS NULL);

ANALYZE "partner"."quotation";
ANALYZE "partner"."reserve";
ANALYZE "partner"."memo_receive";
ANALYZE "partner"."memo_return";
ANALYZE "partner"."memo_out";
ANALYZE "partner"."memo_out_return";
ANALYZE "partner"."purchase_order";
ANALYZE "partner"."purchase";
