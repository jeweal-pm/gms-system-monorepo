-- approve-center SA revision 1 / ADR-0046 (accepted 2026-11-07; backend started by the owner 2026-11-10 "เริ่ม backend approval").
-- Seven engine headers (reserve, memo_receive, memo_return, memo_out, memo_out_return, purchase_order, purchase) in schema partner:
--   * 11 columns: submitted_at/by/by_name (D4), review_action/note, reviewed_at/by/by_name (D3), line_count, total_pcs,
--     total_weight_ct (D17); added nullable, backfilled (submitted_* = created_*, totals = sums of the lines), then the five
--     D4/D17 columns are set NOT NULL. version / updated_at / updated_by are NOT touched (open pages keep working).
--   * status CHECK widened to PENDING_APPROVAL / APPROVED / REJECTED / REVISION_REQUESTED (D2); deleted CHECK widened to
--     PENDING_APPROVAL / REVISION_REQUESTED (D8); new review, review-status and totals CHECKs (all existing rows satisfy them:
--     no row is REJECTED / REVISION_REQUESTED and all review columns are null). Implementation note (2026-11-10): the
--     diagram's comparisons are written NULL-safe here (IS NOT DISTINCT FROM, explicit IS NOT NULL) because a plain
--     'review_action = ...' is NULL, not false, when review_action is NULL, and a NULL CHECK result passes.
--   * partial index <t>_pending_idx (submitted_at, id) WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL (D18).
-- Lines, charges, photos, memo_stock, counters and stored_files are not changed.
-- ADR-0048 (approval-setup, migration 20261110090000_approval_setting) amends this right after: submitted_* become nullable,
-- DRAFT is added, auto_approved / revision_count are added. Both ship in the same release, this one first.
--
-- Rollback (database-diagram.md › Rollback; revert the master code first, it reads these columns):
--   -- business decision for rows in the new statuses before the old CHECKs can return (default):
--   UPDATE "partner"."<t>" SET status = 'PENDING_APPROVAL' WHERE status = 'REVISION_REQUESTED';
--   UPDATE "partner"."<t>" SET status = 'PENDING_APPROVAL', deleted_at = reviewed_at, deleted_by = reviewed_by WHERE status = 'REJECTED';
--   DROP INDEX "partner"."<t>_pending_idx";
--   ALTER TABLE "partner"."<t>" DROP CONSTRAINT "<t>_review_check", DROP CONSTRAINT "<t>_review_status_check",
--     DROP CONSTRAINT "<t>_totals_qty_check", DROP CONSTRAINT "<t>_status_check", DROP CONSTRAINT "<t>_deleted_check";
--   ALTER TABLE "partner"."<t>" ADD CONSTRAINT "<t>_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED')),
--     ADD CONSTRAINT "<t>_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
--       OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" = 'PENDING_APPROVAL'));
--   ALTER TABLE "partner"."<t>" DROP COLUMN "submitted_at", DROP COLUMN "submitted_by", DROP COLUMN "submitted_by_name",
--     DROP COLUMN "review_action", DROP COLUMN "review_note", DROP COLUMN "reviewed_at", DROP COLUMN "reviewed_by",
--     DROP COLUMN "reviewed_by_name", DROP COLUMN "line_count", DROP COLUMN "total_pcs", DROP COLUMN "total_weight_ct";

-- reserve
ALTER TABLE "partner"."reserve"
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

UPDATE "partner"."reserve" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."reserve" h LEFT JOIN "partner"."reserve_line" l ON l."reserve_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."reserve"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."reserve" DROP CONSTRAINT "reserve_status_check", DROP CONSTRAINT "reserve_deleted_check";
ALTER TABLE "partner"."reserve"
  ADD CONSTRAINT "reserve_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "reserve_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "reserve_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "reserve_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "reserve_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "reserve_pending_idx" ON "partner"."reserve"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."reserve";

-- memo_receive
ALTER TABLE "partner"."memo_receive"
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

UPDATE "partner"."memo_receive" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."memo_receive" h LEFT JOIN "partner"."memo_receive_line" l ON l."memo_receive_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."memo_receive"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."memo_receive" DROP CONSTRAINT "memo_receive_status_check", DROP CONSTRAINT "memo_receive_deleted_check";
ALTER TABLE "partner"."memo_receive"
  ADD CONSTRAINT "memo_receive_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_receive_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "memo_receive_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "memo_receive_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "memo_receive_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "memo_receive_pending_idx" ON "partner"."memo_receive"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."memo_receive";

-- memo_return
ALTER TABLE "partner"."memo_return"
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

UPDATE "partner"."memo_return" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."memo_return" h LEFT JOIN "partner"."memo_return_line" l ON l."memo_return_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."memo_return"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."memo_return" DROP CONSTRAINT "memo_return_status_check", DROP CONSTRAINT "memo_return_deleted_check";
ALTER TABLE "partner"."memo_return"
  ADD CONSTRAINT "memo_return_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "memo_return_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "memo_return_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "memo_return_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "memo_return_pending_idx" ON "partner"."memo_return"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."memo_return";

-- memo_out
ALTER TABLE "partner"."memo_out"
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

UPDATE "partner"."memo_out" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."memo_out" h LEFT JOIN "partner"."memo_out_line" l ON l."memo_out_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."memo_out"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."memo_out" DROP CONSTRAINT "memo_out_status_check", DROP CONSTRAINT "memo_out_deleted_check";
ALTER TABLE "partner"."memo_out"
  ADD CONSTRAINT "memo_out_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_out_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "memo_out_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "memo_out_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "memo_out_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "memo_out_pending_idx" ON "partner"."memo_out"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."memo_out";

-- memo_out_return
ALTER TABLE "partner"."memo_out_return"
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

UPDATE "partner"."memo_out_return" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."memo_out_return" h LEFT JOIN "partner"."memo_out_return_line" l ON l."memo_out_return_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."memo_out_return"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."memo_out_return" DROP CONSTRAINT "memo_out_return_status_check", DROP CONSTRAINT "memo_out_return_deleted_check";
ALTER TABLE "partner"."memo_out_return"
  ADD CONSTRAINT "memo_out_return_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "memo_out_return_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "memo_out_return_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "memo_out_return_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "memo_out_return_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "memo_out_return_pending_idx" ON "partner"."memo_out_return"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."memo_out_return";

-- purchase_order
ALTER TABLE "partner"."purchase_order"
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

UPDATE "partner"."purchase_order" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."purchase_order" h LEFT JOIN "partner"."purchase_order_line" l ON l."purchase_order_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."purchase_order"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."purchase_order" DROP CONSTRAINT "purchase_order_status_check", DROP CONSTRAINT "purchase_order_deleted_check";
ALTER TABLE "partner"."purchase_order"
  ADD CONSTRAINT "purchase_order_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "purchase_order_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "purchase_order_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "purchase_order_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "purchase_order_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "purchase_order_pending_idx" ON "partner"."purchase_order"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."purchase_order";

-- purchase
ALTER TABLE "partner"."purchase"
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

UPDATE "partner"."purchase" d SET submitted_at = d."created_at", submitted_by = d."created_by", line_count = s.n, total_pcs = s.pcs, total_weight_ct = s.wt
FROM (SELECT h."id", count(l."id")::smallint AS n, COALESCE(sum(l."pcs"), 0)::int AS pcs, COALESCE(sum(l."weight_ct"), 0) AS wt
      FROM "partner"."purchase" h LEFT JOIN "partner"."purchase_line" l ON l."purchase_id" = h."id" GROUP BY h."id") s
WHERE s."id" = d."id";

ALTER TABLE "partner"."purchase"
  ALTER COLUMN "submitted_at" SET NOT NULL,
  ALTER COLUMN "submitted_by" SET NOT NULL,
  ALTER COLUMN "line_count" SET NOT NULL,
  ALTER COLUMN "total_pcs" SET NOT NULL,
  ALTER COLUMN "total_weight_ct" SET NOT NULL;

ALTER TABLE "partner"."purchase" DROP CONSTRAINT "purchase_status_check", DROP CONSTRAINT "purchase_deleted_check";
ALTER TABLE "partner"."purchase"
  ADD CONSTRAINT "purchase_status_check" CHECK ("status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED')),
  ADD CONSTRAINT "purchase_deleted_check" CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL)
    OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL AND "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED'))),
  ADD CONSTRAINT "purchase_review_check" CHECK (("review_action" IS NULL AND "review_note" IS NULL AND "reviewed_at" IS NULL AND "reviewed_by" IS NULL AND "reviewed_by_name" IS NULL)
    OR ("review_action" IS NOT NULL AND "review_action" IN ('REJECT', 'REVISE') AND "review_note" IS NOT NULL AND char_length(btrim("review_note")) BETWEEN 1 AND 500 AND "reviewed_at" IS NOT NULL AND "reviewed_by" IS NOT NULL)),
  ADD CONSTRAINT "purchase_totals_qty_check" CHECK ("line_count" >= 0 AND "total_pcs" >= 0 AND "total_weight_ct" >= 0),
  ADD CONSTRAINT "purchase_review_status_check" CHECK (("status" <> 'REJECTED' OR "review_action" IS NOT DISTINCT FROM 'REJECT')
    AND ("status" <> 'REVISION_REQUESTED' OR "review_action" IS NOT DISTINCT FROM 'REVISE')
    AND ("review_action" IS DISTINCT FROM 'REJECT' OR "status" = 'REJECTED'));

CREATE INDEX "purchase_pending_idx" ON "partner"."purchase"("submitted_at" ASC, "id" ASC) WHERE ("status" = 'PENDING_APPROVAL' AND "deleted_at" IS NULL);

ANALYZE "partner"."purchase";
