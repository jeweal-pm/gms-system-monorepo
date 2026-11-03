-- decimal-setup, owner 2026-11-03 (Q-DEC-08 changed: "max decimal 4", display and typing only): weight and price
-- places both accept 0..4. Storage scales (weight numeric(12,3), money numeric(18,2)), document validation and the
-- 2-dp server totals do not change. Widening only: every existing row (0..3 / 0..2) still satisfies the new CHECKs.
-- Rollback (only while no row uses 4, or weight 4 / price 3..4):
--   re-add the CHECKs as BETWEEN 0 AND 3 (weight) and BETWEEN 0 AND 2 (price).
ALTER TABLE "partner"."decimal_setup" DROP CONSTRAINT IF EXISTS "decimal_setup_weight_places_range";
ALTER TABLE "partner"."decimal_setup" DROP CONSTRAINT IF EXISTS "decimal_setup_price_places_range";
ALTER TABLE "partner"."decimal_setup" ADD CONSTRAINT "decimal_setup_weight_places_range" CHECK ("weight_places" BETWEEN 0 AND 4);
ALTER TABLE "partner"."decimal_setup" ADD CONSTRAINT "decimal_setup_price_places_range" CHECK ("price_places" BETWEEN 0 AND 4);
