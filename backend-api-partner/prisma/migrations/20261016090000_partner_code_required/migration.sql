-- ADR-0021 (customer SA rev 2, vendor SA rev 2): Code Name becomes required.
-- Hand-written (`prisma migrate dev --create-only` style). No row is deleted.
--
-- 1. Backfill every row whose "code" IS NULL with the next running number, in order
--    "created_at", "id": prefix C (customer) / V (vendor) + at least 3 digits (C001, C999, C1000).
--    The start is max(numeric suffix of existing codes matching ^[Cc][0-9]+$ / ^[Vv][0-9]+$, with at
--    most 18 significant digits so the bigint cast cannot overflow) + 1, the same rule as
--    GET /internal/v1/{customers,vendors}/next-code. Generated numbers are above every counted code,
--    so they cannot collide with an existing code_key.
--    "code_key" is lower("code"), which keeps the existing *_code_key_chk CHECK true.
--    "updated_at"/"updated_by" are not changed (the backfill is not a user edit).
-- 2. Make "code" and "code_key" NOT NULL. The existing CHECKs (*_code_key_chk, *_code_nonblank_chk)
--    stay valid; their "IS NULL" branches simply become unreachable.
--
-- The partner container runs `prisma migrate deploy` before it serves requests (single instance),
-- so no concurrent insert can take a backfilled number during this script.

-- customer -----------------------------------------------------------------------------------------
WITH "base" AS (
  SELECT COALESCE(max(substring("code" FROM 2)::bigint), 0) AS "n"
  FROM "partner"."customer"
  WHERE "code" ~ '^[Cc][0-9]+$' AND length(ltrim(substring("code" FROM 2), '0')) <= 18
), "numbered" AS (
  SELECT "id", (SELECT "n" FROM "base") + row_number() OVER (ORDER BY "created_at", "id") AS "n"
  FROM "partner"."customer"
  WHERE "code" IS NULL
), "generated" AS (
  SELECT "id", 'C' || CASE WHEN "n" < 1000 THEN lpad("n"::text, 3, '0') ELSE "n"::text END AS "code"
  FROM "numbered"
)
UPDATE "partner"."customer" AS "c"
SET "code" = "generated"."code", "code_key" = lower("generated"."code")
FROM "generated"
WHERE "c"."id" = "generated"."id";

ALTER TABLE "partner"."customer"
  ALTER COLUMN "code" SET NOT NULL,
  ALTER COLUMN "code_key" SET NOT NULL;

-- vendor -------------------------------------------------------------------------------------------
WITH "base" AS (
  SELECT COALESCE(max(substring("code" FROM 2)::bigint), 0) AS "n"
  FROM "partner"."vendor"
  WHERE "code" ~ '^[Vv][0-9]+$' AND length(ltrim(substring("code" FROM 2), '0')) <= 18
), "numbered" AS (
  SELECT "id", (SELECT "n" FROM "base") + row_number() OVER (ORDER BY "created_at", "id") AS "n"
  FROM "partner"."vendor"
  WHERE "code" IS NULL
), "generated" AS (
  SELECT "id", 'V' || CASE WHEN "n" < 1000 THEN lpad("n"::text, 3, '0') ELSE "n"::text END AS "code"
  FROM "numbered"
)
UPDATE "partner"."vendor" AS "v"
SET "code" = "generated"."code", "code_key" = lower("generated"."code")
FROM "generated"
WHERE "v"."id" = "generated"."id";

ALTER TABLE "partner"."vendor"
  ALTER COLUMN "code" SET NOT NULL,
  ALTER COLUMN "code_key" SET NOT NULL;
