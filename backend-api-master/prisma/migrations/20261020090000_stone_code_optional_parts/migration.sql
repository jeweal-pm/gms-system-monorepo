-- stone-master SA-SM-05 revision (owner 2026-10-20, "ให้สองอันดับแรก require แต่อันดับอื่นๆไม่ require"):
-- only the parts at positions #1 and #2 are required (checked by the service), so name, shape and color become nullable.
-- Existing rows keep their values; the foreign keys and RESTRICT rules are unchanged.
ALTER TABLE "stone"."stone_code" ALTER COLUMN "stone_name_id" DROP NOT NULL,
ALTER COLUMN "shape_id" DROP NOT NULL,
ALTER COLUMN "color_id" DROP NOT NULL;
