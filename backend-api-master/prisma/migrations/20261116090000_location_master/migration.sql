-- location-master SA revision 1 / ADR-0052 (owner 2026-11-16): Location Master. Expand-only: the documents keep their
-- own `location varchar(40)` columns (the name is copied, no foreign key), so no existing table changes.
CREATE TABLE "partner"."location" (
  "id" UUID NOT NULL,
  "name" VARCHAR(40) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" VARCHAR(64) NOT NULL,
  "updated_by" VARCHAR(64) NOT NULL,
  CONSTRAINT "location_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "location_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 40)
);

-- SA-LM-01: unique ignoring case; also serves the list order (lower(name), id).
CREATE UNIQUE INDEX "location_name_lower_key" ON "partner"."location" (lower("name"));

-- SA-LM-07 / Q-LM-03: once, every name already typed on a Purchase Order or Purchase row (trimmed, non-empty, ≤ 40),
-- keeping the first spelling per case-insensitive name. Q-LM-04: `Memo` (Memo Stock's system location) is not copied.
INSERT INTO "partner"."location" ("id", "name", "created_by", "updated_by")
SELECT gen_random_uuid(), "name", 'migration', 'migration'
FROM (
  SELECT DISTINCT ON (lower("name")) "name"
  FROM (
    SELECT btrim("location") AS "name" FROM "partner"."purchase_order_line"
    UNION ALL
    SELECT btrim("location") AS "name" FROM "partner"."purchase_line"
  ) AS "typed"
  WHERE "name" <> '' AND char_length("name") <= 40 AND lower("name") <> 'memo'
  ORDER BY lower("name"), "name"
) AS "distinct_names";
