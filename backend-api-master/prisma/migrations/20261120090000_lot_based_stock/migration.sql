-- lot-based-stock SA revision 1 / ADR-0055 (accepted 2026-11-20, owner "อนุมัติ lot-based-stock rev 1 (ค่า default)"),
-- BE-LOT-001. Additive, schema partner only (database-diagram.md "Master"):
--   1. memo_stock.lot_key: stored generated group key (D2) + the two lot indexes.
--   2. Document lines: lot_key / stock_count, widened stock CHECKs and nullability, one group per document.
--   3. Five allocation tables <doc>_line_alloc (Stock ID ledger of each applied lot line, D5).
--   4. sale_consumption_line re-keyed per memo stock (D7); stored result size raised for the allocations.
--   5. Backfill: one allocation row per APPLIED legacy stock line (status APPROVED, not deleted; D8).
--   6. In-migration verification: allocations equal the line quantities and the Reserve / Return buckets reconcile with them
--      (a mismatch aborts; nothing is applied). Sold / purchased rows without a source document are reported (WARNING).
-- Rollback: down.sql in this folder, only while no lot line exists (forward-fix only afterwards).

-- 1. Memo Stock group key. Every function used is IMMUTABLE on PostgreSQL 18 (upper, btrim, md5, chr, uuid/numeric out).
ALTER TABLE "partner"."memo_stock" ADD COLUMN "lot_key" VARCHAR(40) GENERATED ALWAYS AS (
  CASE WHEN btrim("lot") = '' OR btrim("cer_no") <> '' THEN 'MS' || "id"::text
  ELSE 'ML' || md5(upper(btrim("lot")) || chr(31) || "vendor_id"::text || chr(31) || "currency_code" || chr(31) || "stone" || chr(31) || "shape"
    || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality" || chr(31) || "cer_type"
    || chr(31) || "location" || chr(31) || "price_unit" || chr(31) || "unit_price"::text || chr(31) || "net_unit_price"::text || chr(31) || "item_note") END) STORED;
CREATE INDEX "memo_stock_lot_open_idx" ON "partner"."memo_stock" ("lot_key", "received_doc_date", "stock_id")
  WHERE "pending_pcs" > 0 OR "pending_weight_ct" > 0;
CREATE INDEX "memo_stock_lot_sold_open_idx" ON "partner"."memo_stock" ("vendor_id", "lot_key")
  WHERE "sold_pcs" > "purchased_pcs" OR "sold_weight_ct" > "purchased_weight_ct";

-- 2. Lot lines
ALTER TABLE "partner"."quotation_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "partner"."reserve_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "partner"."memo_out_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "partner"."memo_return_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "partner"."purchase_line" ADD COLUMN "lot_key" VARCHAR(40), ADD COLUMN "stock_count" SMALLINT;
ALTER TABLE "partner"."memo_return_line" ALTER COLUMN "memo_stock_id" DROP NOT NULL, ALTER COLUMN "stock_id" DROP NOT NULL;

-- A stock line names exactly one of: a Memo Stock item, an own stock (legacy, with its Stock ID), or a lot group
-- (prefix by source: STOCK => M..., OWN_STOCK => O...; no Stock ID; the group's available and stock count at save).
ALTER TABLE "partner"."quotation_line" DROP CONSTRAINT "quotation_line_stock_check";
ALTER TABLE "partner"."quotation_line" ADD CONSTRAINT "quotation_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "stock_count" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("lot_key" IS NOT NULL AND "memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_count" IS NOT NULL AND "stock_count" >= 1
      AND (("source" = 'STOCK' AND "lot_key" LIKE 'M%') OR ("source" = 'OWN_STOCK' AND "lot_key" LIKE 'O%'))
      AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_stock_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "stock_count" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("lot_key" IS NOT NULL AND "memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_count" IS NOT NULL AND "stock_count" >= 1
      AND (("source" = 'STOCK' AND "lot_key" LIKE 'M%') OR ("source" = 'OWN_STOCK' AND "lot_key" LIKE 'O%'))
      AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
ALTER TABLE "partner"."memo_out_line" DROP CONSTRAINT "memo_out_line_stock_check";
ALTER TABLE "partner"."memo_out_line" ADD CONSTRAINT "memo_out_line_stock_check" CHECK (
  ("memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "stock_id" IS NULL AND "stock_pending_pcs" IS NULL AND "stock_pending_weight_ct" IS NULL AND "stock_count" IS NULL AND "source" = 'MANUAL')
  OR ("memo_stock_id" IS NOT NULL AND "own_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("own_stock_id" IS NOT NULL AND "memo_stock_id" IS NULL AND "lot_key" IS NULL AND "source" = 'OWN_STOCK' AND "stock_id" IS NOT NULL AND "stock_pending_pcs" IS NOT NULL
      AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct")
  OR ("lot_key" IS NOT NULL AND "memo_stock_id" IS NULL AND "own_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_count" IS NOT NULL AND "stock_count" >= 1
      AND (("source" = 'STOCK' AND "lot_key" LIKE 'M%') OR ("source" = 'OWN_STOCK' AND "lot_key" LIKE 'O%'))
      AND "stock_pending_pcs" IS NOT NULL AND "stock_pending_weight_ct" IS NOT NULL AND "pcs" <= "stock_pending_pcs" AND "weight_ct" <= "stock_pending_weight_ct"));
-- Memo Return lines name a Memo Stock item (legacy, with its Stock ID) or a Memo Stock lot.
ALTER TABLE "partner"."memo_return_line" ADD CONSTRAINT "memo_return_line_stock_check" CHECK (
  ("memo_stock_id" IS NOT NULL AND "lot_key" IS NULL AND "stock_id" IS NOT NULL AND "stock_count" IS NULL)
  OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'M%' AND "memo_stock_id" IS NULL AND "stock_id" IS NULL AND "stock_count" IS NOT NULL AND "stock_count" >= 1));
-- Reserve lines of either Memo Stock reference may be sold (sale ADR-0054 D4).
ALTER TABLE "partner"."reserve_line" DROP CONSTRAINT "reserve_line_sold_check";
ALTER TABLE "partner"."reserve_line" ADD CONSTRAINT "reserve_line_sold_check" CHECK (
  "sold_pcs" BETWEEN 0 AND "pcs" AND "sold_weight_ct" >= 0 AND "sold_weight_ct" <= "weight_ct"
  AND ("memo_stock_id" IS NOT NULL OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'M%') OR ("sold_pcs" = 0 AND "sold_weight_ct" = 0)));
-- Purchase STOCK lines: a Memo Stock item or a Memo Stock lot, always with a group; the Stock ID only on item lines.
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_source_check";
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_source_check" CHECK (
  "source" IN ('STOCK', 'PURCHASE_ORDER', 'MANUAL')
  AND (("source" = 'STOCK') = ((("memo_stock_id" IS NOT NULL AND "lot_key" IS NULL) OR ("lot_key" IS NOT NULL AND "lot_key" LIKE 'M%' AND "memo_stock_id" IS NULL)) AND "memo_group" IS NOT NULL))
  AND (("source" = 'PURCHASE_ORDER') = ("purchase_order_line_id" IS NOT NULL))
  AND ("source" = 'STOCK' OR ("memo_group" IS NULL AND "memo_stock_id" IS NULL AND "lot_key" IS NULL)));
ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_stock_id_source_check";
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_stock_id_source_check" CHECK (
  ("source" = 'STOCK' AND "memo_stock_id" IS NOT NULL) = ("stock_id" IS NOT NULL));
ALTER TABLE "partner"."purchase_line" ADD CONSTRAINT "purchase_line_stock_count_check" CHECK (
  ("lot_key" IS NULL) = ("stock_count" IS NULL) AND ("stock_count" IS NULL OR "stock_count" >= 1));

-- One group per document (and per Purchase group).
CREATE UNIQUE INDEX "quotation_line_lot_key" ON "partner"."quotation_line" ("quotation_id", "source", "lot_key") WHERE "lot_key" IS NOT NULL;
CREATE UNIQUE INDEX "reserve_line_lot_key" ON "partner"."reserve_line" ("reserve_id", "source", "lot_key") WHERE "lot_key" IS NOT NULL;
CREATE UNIQUE INDEX "memo_out_line_lot_key" ON "partner"."memo_out_line" ("memo_out_id", "source", "lot_key") WHERE "lot_key" IS NOT NULL;
CREATE UNIQUE INDEX "memo_return_line_lot_key" ON "partner"."memo_return_line" ("memo_return_id", "lot_key") WHERE "lot_key" IS NOT NULL;
CREATE UNIQUE INDEX "purchase_line_lot_key" ON "partner"."purchase_line" ("purchase_id", "lot_key", "memo_group") WHERE "lot_key" IS NOT NULL;

-- Open lines of the pickers include lot lines.
DROP INDEX "partner"."memo_out_line_open_idx";
CREATE INDEX "memo_out_line_open_idx" ON "partner"."memo_out_line" ("memo_out_id")
  WHERE ("memo_stock_id" IS NOT NULL OR "own_stock_id" IS NOT NULL OR "lot_key" IS NOT NULL) AND ("returned_pcs" < "pcs" OR "returned_weight_ct" < "weight_ct");
DROP INDEX "partner"."reserve_line_open_idx";
CREATE INDEX "reserve_line_open_idx" ON "partner"."reserve_line" ("reserve_id", "position")
  WHERE ("memo_stock_id" IS NOT NULL OR "lot_key" LIKE 'M%') AND ("sold_pcs" < "pcs" OR "sold_weight_ct" < "weight_ct");

-- 3. Allocation tables (D5). seq = FIFO order; the Stock ID is a snapshot for audit (never returned to the browser).
CREATE TABLE "partner"."reserve_line_alloc" (
  "id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "seq" SMALLINT NOT NULL,
  "memo_stock_id" UUID,
  "own_stock_id" UUID,
  "stock_id" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "settled_pcs" INTEGER NOT NULL DEFAULT 0,
  "settled_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  CONSTRAINT "reserve_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reserve_line_alloc_line_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."reserve_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "reserve_line_alloc_memo_stock_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "reserve_line_alloc_stock_check" CHECK (("memo_stock_id" IS NULL) <> ("own_stock_id" IS NULL)),
  CONSTRAINT "reserve_line_alloc_qty_check" CHECK ("seq" >= 1 AND "pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)
    AND "settled_pcs" BETWEEN 0 AND "pcs" AND "settled_weight_ct" >= 0 AND "settled_weight_ct" <= "weight_ct")
);
CREATE UNIQUE INDEX "reserve_line_alloc_seq_key" ON "partner"."reserve_line_alloc" ("line_id", "seq");
CREATE UNIQUE INDEX "reserve_line_alloc_memo_stock_key" ON "partner"."reserve_line_alloc" ("line_id", "memo_stock_id");
CREATE UNIQUE INDEX "reserve_line_alloc_own_stock_key" ON "partner"."reserve_line_alloc" ("line_id", "own_stock_id");
CREATE INDEX "reserve_line_alloc_memo_stock_idx" ON "partner"."reserve_line_alloc" ("memo_stock_id");
CREATE INDEX "reserve_line_alloc_own_stock_idx" ON "partner"."reserve_line_alloc" ("own_stock_id");

CREATE TABLE "partner"."memo_out_line_alloc" (
  "id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "seq" SMALLINT NOT NULL,
  "memo_stock_id" UUID,
  "own_stock_id" UUID,
  "stock_id" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "settled_pcs" INTEGER NOT NULL DEFAULT 0,
  "settled_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  CONSTRAINT "memo_out_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memo_out_line_alloc_line_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_out_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "memo_out_line_alloc_memo_stock_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "memo_out_line_alloc_stock_check" CHECK (("memo_stock_id" IS NULL) <> ("own_stock_id" IS NULL)),
  CONSTRAINT "memo_out_line_alloc_qty_check" CHECK ("seq" >= 1 AND "pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)
    AND "settled_pcs" BETWEEN 0 AND "pcs" AND "settled_weight_ct" >= 0 AND "settled_weight_ct" <= "weight_ct")
);
CREATE UNIQUE INDEX "memo_out_line_alloc_seq_key" ON "partner"."memo_out_line_alloc" ("line_id", "seq");
CREATE UNIQUE INDEX "memo_out_line_alloc_memo_stock_key" ON "partner"."memo_out_line_alloc" ("line_id", "memo_stock_id");
CREATE UNIQUE INDEX "memo_out_line_alloc_own_stock_key" ON "partner"."memo_out_line_alloc" ("line_id", "own_stock_id");
CREATE INDEX "memo_out_line_alloc_memo_stock_idx" ON "partner"."memo_out_line_alloc" ("memo_stock_id");
CREATE INDEX "memo_out_line_alloc_own_stock_idx" ON "partner"."memo_out_line_alloc" ("own_stock_id");

CREATE TABLE "partner"."memo_return_line_alloc" (
  "id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "seq" SMALLINT NOT NULL,
  "memo_stock_id" UUID,
  "own_stock_id" UUID,
  "stock_id" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  "settled_pcs" INTEGER NOT NULL DEFAULT 0,
  "settled_weight_ct" DECIMAL(12,3) NOT NULL DEFAULT 0,
  CONSTRAINT "memo_return_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memo_return_line_alloc_line_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_return_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "memo_return_line_alloc_memo_stock_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "memo_return_line_alloc_stock_check" CHECK (("memo_stock_id" IS NULL) <> ("own_stock_id" IS NULL)),
  CONSTRAINT "memo_return_line_alloc_qty_check" CHECK ("seq" >= 1 AND "pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0)
    AND "settled_pcs" BETWEEN 0 AND "pcs" AND "settled_weight_ct" >= 0 AND "settled_weight_ct" <= "weight_ct")
);
CREATE UNIQUE INDEX "memo_return_line_alloc_seq_key" ON "partner"."memo_return_line_alloc" ("line_id", "seq");
CREATE UNIQUE INDEX "memo_return_line_alloc_memo_stock_key" ON "partner"."memo_return_line_alloc" ("line_id", "memo_stock_id");
CREATE UNIQUE INDEX "memo_return_line_alloc_own_stock_key" ON "partner"."memo_return_line_alloc" ("line_id", "own_stock_id");
CREATE INDEX "memo_return_line_alloc_memo_stock_idx" ON "partner"."memo_return_line_alloc" ("memo_stock_id");
CREATE INDEX "memo_return_line_alloc_own_stock_idx" ON "partner"."memo_return_line_alloc" ("own_stock_id");

CREATE TABLE "partner"."purchase_line_alloc" (
  "id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "seq" SMALLINT NOT NULL,
  "memo_stock_id" UUID NOT NULL,
  "stock_id" VARCHAR(10) NOT NULL,
  "part" VARCHAR(10) NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "purchase_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_line_alloc_line_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."purchase_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "purchase_line_alloc_memo_stock_fkey" FOREIGN KEY ("memo_stock_id") REFERENCES "partner"."memo_stock" ("id") ON DELETE RESTRICT,
  CONSTRAINT "purchase_line_alloc_qty_check" CHECK ("seq" >= 1 AND "part" IN ('SOLD', 'IN_STOCK') AND "pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0))
);
CREATE UNIQUE INDEX "purchase_line_alloc_seq_key" ON "partner"."purchase_line_alloc" ("line_id", "seq");
CREATE UNIQUE INDEX "purchase_line_alloc_memo_stock_key" ON "partner"."purchase_line_alloc" ("line_id", "memo_stock_id", "part");
CREATE INDEX "purchase_line_alloc_memo_stock_idx" ON "partner"."purchase_line_alloc" ("memo_stock_id");

CREATE TABLE "partner"."memo_out_return_line_alloc" (
  "id" UUID NOT NULL,
  "line_id" UUID NOT NULL,
  "memo_out_line_alloc_id" UUID NOT NULL,
  "pcs" INTEGER NOT NULL,
  "weight_ct" DECIMAL(12,3) NOT NULL,
  CONSTRAINT "memo_out_return_line_alloc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memo_out_return_line_alloc_line_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_out_return_line" ("id") ON DELETE CASCADE,
  CONSTRAINT "memo_out_return_line_alloc_source_fkey" FOREIGN KEY ("memo_out_line_alloc_id") REFERENCES "partner"."memo_out_line_alloc" ("id") ON DELETE RESTRICT,
  CONSTRAINT "memo_out_return_line_alloc_qty_check" CHECK ("pcs" >= 0 AND "weight_ct" >= 0 AND ("pcs" > 0 OR "weight_ct" > 0))
);
CREATE UNIQUE INDEX "memo_out_return_line_alloc_source_key" ON "partner"."memo_out_return_line_alloc" ("line_id", "memo_out_line_alloc_id");
CREATE INDEX "memo_out_return_line_alloc_source_idx" ON "partner"."memo_out_return_line_alloc" ("memo_out_line_alloc_id");

-- 4. Sale consumption per memo stock (a lot line or a lot Reserve line consumes several items).
DROP INDEX "partner"."sale_consumption_line_reserve_line_key";
ALTER TABLE "partner"."sale_consumption_line" DROP CONSTRAINT "sale_consumption_line_pkey";
ALTER TABLE "partner"."sale_consumption_line" ADD CONSTRAINT "sale_consumption_line_pkey" PRIMARY KEY ("sale_id", "line_id", "memo_stock_id");
ALTER TABLE "partner"."sale_consumption" DROP CONSTRAINT "sale_consumption_result_size_check";
ALTER TABLE "partner"."sale_consumption" ADD CONSTRAINT "sale_consumption_result_size_check" CHECK (octet_length("result"::text) <= 262144);

-- 5. Backfill: one allocation row (seq 1) per applied legacy stock line (D8). uuidv7() is built in on PostgreSQL 18.
INSERT INTO "partner"."reserve_line_alloc" ("id", "line_id", "seq", "memo_stock_id", "own_stock_id", "stock_id", "pcs", "weight_ct", "settled_pcs", "settled_weight_ct")
SELECT uuidv7(), l."id", 1, l."memo_stock_id", l."own_stock_id", l."stock_id", l."pcs", l."weight_ct", l."sold_pcs", l."sold_weight_ct"
FROM "partner"."reserve_line" l JOIN "partner"."reserve" h ON h."id" = l."reserve_id"
WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND (l."memo_stock_id" IS NOT NULL OR l."own_stock_id" IS NOT NULL) AND (l."pcs" > 0 OR l."weight_ct" > 0);

INSERT INTO "partner"."memo_out_line_alloc" ("id", "line_id", "seq", "memo_stock_id", "own_stock_id", "stock_id", "pcs", "weight_ct", "settled_pcs", "settled_weight_ct")
SELECT uuidv7(), l."id", 1, l."memo_stock_id", l."own_stock_id", l."stock_id", l."pcs", l."weight_ct", l."returned_pcs", l."returned_weight_ct"
FROM "partner"."memo_out_line" l JOIN "partner"."memo_out" h ON h."id" = l."memo_out_id"
WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND (l."memo_stock_id" IS NOT NULL OR l."own_stock_id" IS NOT NULL) AND (l."pcs" > 0 OR l."weight_ct" > 0);

INSERT INTO "partner"."memo_return_line_alloc" ("id", "line_id", "seq", "memo_stock_id", "stock_id", "pcs", "weight_ct")
SELECT uuidv7(), l."id", 1, l."memo_stock_id", l."stock_id", l."pcs", l."weight_ct"
FROM "partner"."memo_return_line" l JOIN "partner"."memo_return" h ON h."id" = l."memo_return_id"
WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND l."memo_stock_id" IS NOT NULL AND (l."pcs" > 0 OR l."weight_ct" > 0);

INSERT INTO "partner"."purchase_line_alloc" ("id", "line_id", "seq", "memo_stock_id", "stock_id", "part", "pcs", "weight_ct")
SELECT uuidv7(), p."id", p."seq", p."memo_stock_id", p."stock_id", p."part", p."pcs", p."weight_ct"
FROM (
  SELECT l."id", 1 AS "seq", l."memo_stock_id", l."stock_id", l."memo_group" AS "part", l."pcs", l."weight_ct"
  FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h."id" = l."purchase_id"
  WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND l."memo_stock_id" IS NOT NULL AND l."memo_group" IN ('SOLD', 'IN_STOCK')
  UNION ALL
  SELECT l."id", 1, l."memo_stock_id", l."stock_id", 'SOLD', l."sold_part_pcs", l."sold_part_weight_ct"
  FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h."id" = l."purchase_id"
  WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND l."memo_stock_id" IS NOT NULL AND l."memo_group" = 'MERGED'
  UNION ALL
  SELECT l."id", 2, l."memo_stock_id", l."stock_id", 'IN_STOCK', l."pcs" - l."sold_part_pcs", l."weight_ct" - l."sold_part_weight_ct"
  FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h."id" = l."purchase_id"
  WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND l."memo_stock_id" IS NOT NULL AND l."memo_group" = 'MERGED'
) p
WHERE p."pcs" > 0 OR p."weight_ct" > 0;

INSERT INTO "partner"."memo_out_return_line_alloc" ("id", "line_id", "memo_out_line_alloc_id", "pcs", "weight_ct")
SELECT uuidv7(), l."id", a."id", l."pcs", l."weight_ct"
FROM "partner"."memo_out_return_line" l
JOIN "partner"."memo_out_return" h ON h."id" = l."memo_out_return_id"
JOIN "partner"."memo_out_line_alloc" a ON a."line_id" = l."memo_out_line_id"
WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND (l."pcs" > 0 OR l."weight_ct" > 0);

-- 6. Verification (aborts the migration on any mismatch; the report queries are in the TODO, BE-LOT-001).
DO $$
DECLARE
  bad integer;
BEGIN
  -- Every applied stock line's allocation equals its quantity.
  SELECT count(*) INTO bad FROM (
    SELECT l."id", l."pcs", l."weight_ct", coalesce(sum(a."pcs"), 0) AS ap, coalesce(sum(a."weight_ct"), 0) AS aw
    FROM "partner"."reserve_line" l JOIN "partner"."reserve" h ON h."id" = l."reserve_id" LEFT JOIN "partner"."reserve_line_alloc" a ON a."line_id" = l."id"
    WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND (l."memo_stock_id" IS NOT NULL OR l."own_stock_id" IS NOT NULL) GROUP BY l."id"
    UNION ALL
    SELECT l."id", l."pcs", l."weight_ct", coalesce(sum(a."pcs"), 0), coalesce(sum(a."weight_ct"), 0)
    FROM "partner"."memo_out_line" l JOIN "partner"."memo_out" h ON h."id" = l."memo_out_id" LEFT JOIN "partner"."memo_out_line_alloc" a ON a."line_id" = l."id"
    WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND (l."memo_stock_id" IS NOT NULL OR l."own_stock_id" IS NOT NULL) GROUP BY l."id"
    UNION ALL
    SELECT l."id", l."pcs", l."weight_ct", coalesce(sum(a."pcs"), 0), coalesce(sum(a."weight_ct"), 0)
    FROM "partner"."memo_return_line" l JOIN "partner"."memo_return" h ON h."id" = l."memo_return_id" LEFT JOIN "partner"."memo_return_line_alloc" a ON a."line_id" = l."id"
    WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL GROUP BY l."id"
    UNION ALL
    SELECT l."id", l."pcs", l."weight_ct", coalesce(sum(a."pcs"), 0), coalesce(sum(a."weight_ct"), 0)
    FROM "partner"."purchase_line" l JOIN "partner"."purchase" h ON h."id" = l."purchase_id" LEFT JOIN "partner"."purchase_line_alloc" a ON a."line_id" = l."id"
    WHERE h."status" = 'APPROVED' AND h."deleted_at" IS NULL AND l."source" = 'STOCK' GROUP BY l."id"
  ) x WHERE x."pcs" <> x.ap OR x."weight_ct" <> x.aw;
  IF bad > 0 THEN
    RAISE EXCEPTION 'lot_based_stock: % applied stock line(s) whose allocation differs from the line quantity', bad;
  END IF;
  -- Reserve and Return buckets (the ones the allocations back) equal the allocations: abort on mismatch.
  SELECT count(*) INTO bad FROM "partner"."memo_stock" s
  LEFT JOIN (SELECT "memo_stock_id", sum("pcs" - "settled_pcs") p, sum("weight_ct" - "settled_weight_ct") w
    FROM "partner"."reserve_line_alloc" WHERE "memo_stock_id" IS NOT NULL GROUP BY 1) r ON r."memo_stock_id" = s."id"
  LEFT JOIN (SELECT "memo_stock_id", sum("pcs" - "settled_pcs") p, sum("weight_ct" - "settled_weight_ct") w
    FROM "partner"."memo_out_line_alloc" WHERE "memo_stock_id" IS NOT NULL GROUP BY 1) o ON o."memo_stock_id" = s."id"
  LEFT JOIN (SELECT "memo_stock_id", sum("pcs") p, sum("weight_ct") w FROM "partner"."memo_return_line_alloc" GROUP BY 1) m ON m."memo_stock_id" = s."id"
  WHERE s."reserved_pcs" <> coalesce(r.p, 0) + coalesce(o.p, 0) OR s."reserved_weight_ct" <> coalesce(r.w, 0) + coalesce(o.w, 0)
     OR s."returned_pcs" <> coalesce(m.p, 0) OR s."returned_weight_ct" <> coalesce(m.w, 0);
  IF bad > 0 THEN
    RAISE EXCEPTION 'lot_based_stock: % memo_stock row(s) whose reserved / returned buckets do not reconcile with the allocations', bad;
  END IF;
  -- Sold / purchased come from Sale consumptions and Purchases, which this migration does not change. Rows written
  -- outside the documents (e.g. seed data) are reported, not aborted on (report query: testing.md IT-LOT-12).
  SELECT count(*) INTO bad FROM "partner"."memo_stock" s
  LEFT JOIN (SELECT "memo_stock_id", sum("pcs") p, sum("weight_ct") w, sum(CASE WHEN "part" = 'IN_STOCK' THEN "pcs" ELSE 0 END) ip,
      sum(CASE WHEN "part" = 'IN_STOCK' THEN "weight_ct" ELSE 0 END) iw FROM "partner"."purchase_line_alloc" GROUP BY 1) pu ON pu."memo_stock_id" = s."id"
  LEFT JOIN (SELECT "memo_stock_id", sum("pcs") p, sum("weight_ct") w FROM "partner"."sale_consumption_line" GROUP BY 1) c ON c."memo_stock_id" = s."id"
  WHERE s."purchased_pcs" <> coalesce(pu.p, 0) OR s."purchased_weight_ct" <> coalesce(pu.w, 0)
     OR s."sold_pcs" <> coalesce(pu.ip, 0) + coalesce(c.p, 0) OR s."sold_weight_ct" <> coalesce(pu.iw, 0) + coalesce(c.w, 0);
  IF bad > 0 THEN
    RAISE WARNING 'lot_based_stock: % memo_stock row(s) whose sold / purchased buckets have no matching Sale or Purchase (pre-existing data)', bad;
  END IF;
END $$;
