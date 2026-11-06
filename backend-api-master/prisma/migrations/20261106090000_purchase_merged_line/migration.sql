-- purchase SA revision 2 / ADR-0043 (owner 2026-11-06: "อนุมัติ purchase revision 3"): merged Memo Stock lines.
-- Additive: two nullable columns on purchase_line and two CHECK changes; no backfill.
-- Rollback (only while no MERGED line exists): drop purchase_line_sold_part_check and the two columns, and restore
-- purchase_line_memo_group_check to IN ('IN_STOCK', 'SOLD').

-- AlterTable
ALTER TABLE "partner"."purchase_line"
  ADD COLUMN "sold_part_pcs" INTEGER,
  ADD COLUMN "sold_part_weight_ct" DECIMAL(12,3);

-- SA-PU-21: a STOCK line may merge the Sold and In-stock parts of one item.
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_memo_group_check";
ALTER TABLE "partner"."purchase_line"
  ADD CONSTRAINT "purchase_line_memo_group_check" CHECK ("memo_group" IS NULL OR "memo_group" IN ('IN_STOCK', 'SOLD', 'MERGED'));

-- SA-PU-25: the Sold part taken first, written at Approve for MERGED lines only.
ALTER TABLE "partner"."purchase_line"
  ADD CONSTRAINT "purchase_line_sold_part_check" CHECK (
    ("sold_part_pcs" IS NULL AND "sold_part_weight_ct" IS NULL)
    OR ("memo_group" = 'MERGED' AND "sold_part_pcs" IS NOT NULL AND "sold_part_weight_ct" IS NOT NULL
        AND "sold_part_pcs" BETWEEN 0 AND "pcs" AND "sold_part_weight_ct" >= 0 AND "sold_part_weight_ct" <= "weight_ct"));
