-- company-profile SA revision 3 (SA-CP-12…15): Road/Street, plain-text bank details, terms removed.

-- SA-CP-12: optional Road/Street.
ALTER TABLE "partner"."company_profile" ADD COLUMN "road_street" VARCHAR(300) NOT NULL DEFAULT '';

-- SA-CP-13/14: bank details JSONB (Tiptap JSON) -> TEXT. One line per top-level block (its text
-- nodes joined), lines joined with LF, at most 5,000 characters. Formatting is lost (one-way).
ALTER TABLE "partner"."company_profile" ADD COLUMN "bank_details_text" TEXT NOT NULL DEFAULT '';
UPDATE "partner"."company_profile" AS cp
SET "bank_details_text" = LEFT(COALESCE((
  SELECT string_agg(line, E'\n' ORDER BY ord)
  FROM (
    SELECT block.ord,
           COALESCE((SELECT string_agg(t #>> '{}', '') FROM jsonb_path_query(block.value, 'strict $.**.text') AS t), '') AS line
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cp."bank_details" -> 'content') = 'array' THEN cp."bank_details" -> 'content' ELSE '[]'::jsonb END)
         WITH ORDINALITY AS block(value, ord)
  ) AS lines
), ''), 5000)
WHERE cp."bank_details" IS NOT NULL;
ALTER TABLE "partner"."company_profile" DROP COLUMN "bank_details";
ALTER TABLE "partner"."company_profile" RENAME COLUMN "bank_details_text" TO "bank_details";

-- SA-CP-15: Terms and Conditions removed (owner 2026-10-17). Existing terms are deleted.
ALTER TABLE "partner"."company_profile" DROP COLUMN "terms";
ALTER TABLE "partner"."company_profile" DROP COLUMN "show_terms_on_invoice";
