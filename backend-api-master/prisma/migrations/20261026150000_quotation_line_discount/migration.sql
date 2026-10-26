-- Owner 2026-10-26 (Figma row panel): a per-line discount, either a percent or an amount, and up to
-- 5 photos per line (was 4). Additive; existing lines get no discount. Rollback: drop the three columns
-- and restore the photo position check to 1..4 (only while no line has a 5th photo).
ALTER TABLE "partner"."quotation_line"
  ADD COLUMN "discount_type" VARCHAR(10) NOT NULL DEFAULT 'NONE',
  ADD COLUMN "discount_value" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "quotation_line_discount_check" CHECK ("discount_type" IN ('NONE', 'PERCENT', 'AMOUNT') AND "discount_value" >= 0 AND "discount_amount" >= 0);

ALTER TABLE "partner"."quotation_line_photo" DROP CONSTRAINT "quotation_line_photo_position_check";
ALTER TABLE "partner"."quotation_line_photo" ADD CONSTRAINT "quotation_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);
