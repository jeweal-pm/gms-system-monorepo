-- =====================================================================================================================
-- DEV-ONLY mock data for backend-api-inventory (schema "inventory"). Never run against production.
-- Requires the master mock data (backend-api-master/prisma/seed/mock-master.sql) — run through docker/seed-mock.cjs.
--
--   :n_load Load to Stock documents (mode NONE: every row has exactly one source). A load takes one APPROVED mock
--   Purchase and loads one quarter of each of its first N loadable lines (MANUAL / PURCHASE_ORDER source), where N comes
--   from `lines_spec` ("load-to-stock=min-max", default 20-50) capped by the lines the purchase has. ≤ 3 loads per purchase,
--   so the 4th quarter of every line stays loadable.
--   APPROVED loads are applied exactly like the saga does (ADR-0052 D4/D5): a Stock ID per row, one `stock` per row (all on
--   hand), LOAD_IN `stock_movement`, and on the master side `load_allocation` (+ lines), `load_stock_id`,
--   `purchase_line.loaded_*` and the shared Stock ID counter. Other statuses hold nothing (approval is ON).
--
-- Rows are marked created_by = 'seed-mock'. Re-running is a no-op; use the runner's --reset to rebuild.
-- =====================================================================================================================
\set ON_ERROR_STOP on
\if :{?n_load}
\else
  \set n_load 100000
\endif
\if :{?lines_spec}
\else
  \set lines_spec ''
\endif

SELECT EXISTS (SELECT 1 FROM inventory.load_to_stock WHERE created_by = 'seed-mock') AS seeded,
       EXISTS (SELECT 1 FROM partner.purchase WHERE created_by = 'seed-mock') AS has_master \gset
\if :seeded
  \echo 'inventory: mock data already present - skipped (use --reset to rebuild)'
  \quit
\endif
\if :has_master
\else
  \echo 'inventory: no master mock purchases found - run the master seeder first'
  \quit 3
\endif

\set QUIET on
\pset tuples_only on
\echo 'inventory: seeding' :n_load 'load to stock documents ...'
\o /dev/null
BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL synchronous_commit = off;
SET LOCAL work_mem = '32MB';
SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('partner.memo_stock_id_counter.issue'))) l;

CREATE FUNCTION pg_temp.rnd(i bigint, salt int) RETURNS float8 LANGUAGE sql IMMUTABLE
  AS $$ SELECT (hashint8(i * 1000003 + salt) & 2147483647)::float8 / 2147483648.0 $$;
CREATE FUNCTION pg_temp.st(i bigint, salt int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN r < 70 THEN 'APPROVED' WHEN r < 82 THEN 'DRAFT' WHEN r < 90 THEN 'PENDING_APPROVAL'
              WHEN r < 94 THEN 'REJECTED' WHEN r < 98 THEN 'REVISION_REQUESTED' ELSE 'DELETED' END
  FROM (SELECT pg_temp.rnd(i, salt) * 100 AS r) x $$;
-- Rows per load from lines_spec ("load-to-stock=min-max"); default 20-50.
CREATE TEMP TABLE seed_lines AS
SELECT coalesce(max(split_part(split_part(e, '=', 2), '-', 1)::int), 20) AS lo,
       coalesce(max(coalesce(nullif(split_part(split_part(e, '=', 2), '-', 2), ''), split_part(split_part(e, '=', 2), '-', 1))::int), 50) AS hi
FROM unnest(string_to_array(nullif(:'lines_spec', ''), ',')) e
WHERE split_part(e, '=', 1) = 'load-to-stock';
DO $$ BEGIN
  IF NOT (SELECT lo BETWEEN 1 AND 200 AND hi BETWEEN lo AND 200 FROM seed_lines) THEN RAISE EXCEPTION 'load-to-stock lines must be 1..200 (min <= max)'; END IF;
END $$;

ANALYZE partner.purchase_line; ANALYZE partner.purchase;
CREATE TEMP TABLE seed_cfg AS
SELECT cp.currency_code::text AS cc, (extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::int % 100) AS y,
       coalesce((SELECT last_no FROM partner.memo_stock_id_counter WHERE year = (extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::int % 100)), 0) AS ctr0,
       n.id AS numbering_id, coalesce(n.prefix, '') AS prefix, coalesce(n.separator, '') AS sep,
       CASE WHEN n.id IS NULL THEN coalesce((SELECT max(running_no) FROM inventory.load_to_stock WHERE numbering_id IS NULL), 0)
            ELSE greatest(coalesce((SELECT max(running_no) FROM inventory.load_to_stock WHERE numbering_id = n.id), 0), n.start_no - 1) END AS base
FROM partner.company_profile cp
LEFT JOIN LATERAL (SELECT id, prefix, separator, start_no FROM partner.document_numbering
                   WHERE transaction_key = 'load-to-stock' ORDER BY effective_date LIMIT 1) n ON true
WHERE cp.id = 1;

-- Loadable purchase lines (Purchase APPROVED + live, source MANUAL / PURCHASE_ORDER, nothing loaded yet), numbered per
-- purchase (`pp_no`, `r`), with the company-currency unit cost the master batch API returns (net × PU rate, 4 dp half-up).
CREATE TEMP TABLE seed_pl AS
SELECT dense_rank() OVER (ORDER BY p.doc_date, p.running_no)::int AS pp_no,
       row_number() OVER (PARTITION BY p.id ORDER BY l.position)::int AS r,
       l.id AS line_id, p.id AS purchase_id, p.doc_no, p.doc_date, p.currency_code, p.vendor_id, p.vendor_code_snapshot, p.vendor_name_snapshot,
       CASE WHEN p.currency_code = c.cc OR p.exchange_rate IS NULL THEN 1::numeric ELSE p.exchange_rate END AS rate,
       l.price_unit, l.unit_price, l.pcs, l.weight_ct, l.location, l.stone_code_id, l.stone_code_snapshot, l.stone, l.shape, l.size, l.color,
       l.clarity, l.cutting, l.quality, l.lot, l.cer_type, l.cer_no, l.item_note,
       round(l.amount / (CASE WHEN l.price_unit = 'PER_CT' THEN l.weight_ct ELSE l.pcs END), 4) AS net_unit_price
FROM partner.purchase_line l
JOIN partner.purchase p ON p.id = l.purchase_id
CROSS JOIN seed_cfg c
WHERE p.created_by = 'seed-mock' AND p.status = 'APPROVED' AND p.deleted_at IS NULL
  AND l.source IN ('MANUAL', 'PURCHASE_ORDER') AND l.loaded_pcs = 0 AND l.pcs % 4 = 0 AND l.pcs > 0
  AND (CASE WHEN l.price_unit = 'PER_CT' THEN l.weight_ct ELSE l.pcs END) > 0;
ALTER TABLE seed_pl ADD COLUMN unit_cost numeric(18,4);
UPDATE seed_pl SET unit_cost = round(net_unit_price * rate, 4);
CREATE UNIQUE INDEX ON seed_pl (pp_no, r);
ANALYZE seed_pl;
CREATE TEMP TABLE seed_pp AS
SELECT pp_no, min(doc_date) AS doc_date, count(*)::int AS line_count FROM seed_pl GROUP BY pp_no;
CREATE UNIQUE INDEX ON seed_pp (pp_no);
ANALYZE seed_pp;

-- One load per (purchase, quarter q = 0..2); the load's doc date never precedes its purchase.
CREATE TEMP TABLE seed_load AS
WITH n AS MATERIALIZED (SELECT count(*)::int AS cnt FROM seed_pp)
SELECT i AS idx, uuidv7() AS id, 1 + (i - 1) % n.cnt AS pp_no, pg_temp.st(i, 901) AS st,
       least(pp.line_count, (SELECT lo + floor(pg_temp.rnd(i, 905) * (hi - lo + 1))::int FROM seed_lines)) AS nrows,
       greatest(DATE '2025-01-01' + ((i - 1)::bigint * (DATE '2026-11-18' - DATE '2025-01-01') / :n_load)::int, pp.doc_date) AS doc_date
FROM generate_series(1, :n_load) i
CROSS JOIN n
JOIN seed_pp pp ON pp.pp_no = 1 + (i - 1) % n.cnt
WHERE n.cnt > 0 AND (i - 1) / n.cnt < 3;
ALTER TABLE seed_load ADD COLUMN running_no int, ADD COLUMN doc_no text, ADD COLUMN status text, ADD COLUMN created_at timestamptz;
-- Running numbers follow the doc date so the list reads in order.
UPDATE seed_load s SET running_no = c.base + x.rn, doc_no = CASE WHEN c.numbering_id IS NULL THEN (c.base + x.rn)::text ELSE c.prefix || c.sep || (c.base + x.rn) END,
  status = CASE s.st WHEN 'DELETED' THEN 'DRAFT' ELSE s.st END,
  created_at = (s.doc_date + interval '10 hours' + (s.idx % 420) * interval '1 minute') AT TIME ZONE 'Asia/Bangkok'
FROM (SELECT idx, row_number() OVER (ORDER BY doc_date, idx)::int rn FROM seed_load) x, seed_cfg c
WHERE x.idx = s.idx;
CREATE UNIQUE INDEX ON seed_load (idx);
ANALYZE seed_load;

-- Rows: one per loaded line (position = the line's order in the purchase), each a quarter of that line.
CREATE TEMP TABLE seed_lrow AS
SELECT s.idx, s.id AS load_id, s.st, pl.r AS pos, pl.line_id, pl.purchase_id, uuidv7() AS row_id, uuidv7() AS source_id, uuidv7() AS stock_uuid,
       pl.pcs / 4 AS pcs, pl.weight_ct / 4 AS w,
       round((CASE WHEN pl.price_unit = 'PER_CT' THEN pl.weight_ct / 4 ELSE (pl.pcs / 4)::numeric END) * pl.unit_cost, 2) AS cost,
       pl.pp_no
FROM seed_load s JOIN seed_pl pl ON pl.pp_no = s.pp_no AND pl.r <= s.nrows;
ALTER TABLE seed_lrow ADD COLUMN row_unit_cost numeric(18,4), ADD COLUMN stock_id text;
UPDATE seed_lrow x SET row_unit_cost = round(x.cost / nullif(CASE WHEN pl.price_unit = 'PER_CT' THEN x.w ELSE x.pcs::numeric END, 0), 4)
FROM seed_pl pl WHERE pl.pp_no = x.pp_no AND pl.r = x.pos;
-- Stock IDs (shared counter with Memo Receive) for rows of APPROVED loads only, in running-number / row order.
UPDATE seed_lrow x SET stock_id = lpad((c.y * 10000 + c.ctr0 + o.rn)::text, greatest(6, length((c.y * 10000 + c.ctr0 + o.rn)::text)), '0')
FROM (SELECT x2.row_id, row_number() OVER (ORDER BY s.running_no, x2.pos)::int rn
      FROM seed_lrow x2 JOIN seed_load s ON s.idx = x2.idx WHERE x2.st = 'APPROVED') o, seed_cfg c
WHERE o.row_id = x.row_id;
CREATE INDEX ON seed_lrow (idx);
ANALYZE seed_lrow;

-- ---------------------------------------------------------------- inventory documents
INSERT INTO inventory.load_to_stock (id, numbering_id, running_no, doc_no, status, provisional, sync_state, applied_revision, doc_date, vendor_id,
  vendor_code_snapshot, vendor_name_snapshot, currency_code, ref, document_note, mode, row_count, total_pcs, total_weight_ct, total_cost_base,
  auto_approved, revision_count, submitted_at, submitted_by, submitted_by_name, review_action, review_note, reviewed_at, reviewed_by, reviewed_by_name,
  approved_at, approved_by, deleted_at, deleted_by, version, created_at, created_by, updated_at, updated_by)
SELECT s.id, c.numbering_id, s.running_no, s.doc_no, s.status, false, 'IDLE', CASE WHEN s.st = 'APPROVED' THEN 1 ELSE 0 END, s.doc_date, pl.vendor_id,
       pl.vendor_code_snapshot, pl.vendor_name_snapshot, c.cc, CASE WHEN pg_temp.rnd(s.idx, 902) < 0.5 THEN 'LS-REF-' || lpad(s.idx::text, greatest(6, length(s.idx::text)), '0') ELSE '' END,
       '', 'NONE', t.n, t.p, t.w, t.cost, false,
       CASE WHEN s.st = 'REVISION_REQUESTED' THEN 1 ELSE 0 END,
       CASE WHEN s.st IN ('DRAFT', 'DELETED') THEN NULL ELSE s.created_at + interval '1 hour' END,
       CASE WHEN s.st IN ('DRAFT', 'DELETED') THEN NULL ELSE 'seed-mock' END,
       CASE WHEN s.st IN ('DRAFT', 'DELETED') THEN NULL ELSE 'Mock Seeder' END,
       CASE s.st WHEN 'REJECTED' THEN 'REJECT' WHEN 'REVISION_REQUESTED' THEN 'REVISE' END,
       CASE s.st WHEN 'REJECTED' THEN 'Cost does not match the purchase' WHEN 'REVISION_REQUESTED' THEN 'Please check the location' END,
       CASE WHEN s.st IN ('REJECTED', 'REVISION_REQUESTED') THEN s.created_at + interval '2 hours' END,
       CASE WHEN s.st IN ('REJECTED', 'REVISION_REQUESTED') THEN 'seed-mock' END,
       CASE WHEN s.st IN ('REJECTED', 'REVISION_REQUESTED') THEN 'Mock Seeder' END,
       CASE WHEN s.st = 'APPROVED' THEN s.created_at + interval '3 hours' END,
       CASE WHEN s.st = 'APPROVED' THEN 'seed-mock' END,
       CASE WHEN s.st = 'DELETED' THEN s.created_at + interval '2 hours' END,
       CASE WHEN s.st = 'DELETED' THEN 'seed-mock' END,
       1, s.created_at, 'seed-mock', s.created_at + interval '3 hours', 'seed-mock'
FROM seed_load s CROSS JOIN seed_cfg c
JOIN seed_pl pl ON pl.pp_no = s.pp_no AND pl.r = 1
JOIN (SELECT idx, count(*)::int n, sum(pcs)::int p, sum(w) w, sum(cost) cost FROM seed_lrow GROUP BY idx) t ON t.idx = s.idx
ORDER BY s.running_no;
ANALYZE inventory.load_to_stock;

INSERT INTO inventory.load_to_stock_source (id, load_id, position, purchase_line_id, purchase_id, purchase_doc_no, purchase_doc_date, purchase_currency,
  exchange_rate, price_unit, unit_price, net_unit_price, unit_cost_base, line_pcs, line_weight_ct, location, stone_code_id, stone_code, stone, shape, size,
  color, clarity, cutting, quality, lot, cer_type, cer_no, item_note)
SELECT x.source_id, x.load_id, x.pos, pl.line_id, pl.purchase_id, pl.doc_no, pl.doc_date, pl.currency_code, pl.rate, pl.price_unit, pl.unit_price,
       pl.net_unit_price, pl.unit_cost, pl.pcs, pl.weight_ct, pl.location, pl.stone_code_id, pl.stone_code_snapshot, pl.stone, pl.shape, pl.size,
       pl.color, pl.clarity, pl.cutting, pl.quality, pl.lot, pl.cer_type, pl.cer_no, pl.item_note
FROM seed_lrow x JOIN seed_pl pl ON pl.pp_no = x.pp_no AND pl.r = x.pos;
ANALYZE inventory.load_to_stock_source;

INSERT INTO inventory.load_to_stock_row (id, load_id, position, location, parcel, stone_code_id, stone_code, stone, shape, size, color, clarity, cutting,
  quality, lot, cer_type, cer_no, price_unit, pcs, weight_ct, unit_cost_base, cost_amount_base, stock_price, sale_price, item_note, stock_id)
SELECT x.row_id, x.load_id, x.pos, pl.location, CASE WHEN pg_temp.rnd(x.idx * 1000 + x.pos, 903) < 0.3 THEN 'P-' || lpad(((x.idx * 7 + x.pos) % 1000)::text, 3, '0') ELSE '' END,
       pl.stone_code_id, pl.stone_code_snapshot, pl.stone, pl.shape, pl.size, pl.color, pl.clarity, pl.cutting, pl.quality, pl.lot, pl.cer_type, pl.cer_no,
       pl.price_unit, x.pcs, x.w, x.row_unit_cost, x.cost, round(x.row_unit_cost * 1.2, 2), round(x.row_unit_cost * 1.5, 2), pl.item_note, x.stock_id
FROM seed_lrow x JOIN seed_pl pl ON pl.pp_no = x.pp_no AND pl.r = x.pos;
ANALYZE inventory.load_to_stock_row;

INSERT INTO inventory.load_to_stock_row_source (row_id, source_id, pcs, weight_ct, cost_amount_base)
SELECT row_id, source_id, pcs, w, cost FROM seed_lrow;

-- Applied (APPROVED) loads: one stock per row, all on hand, plus the LOAD_IN ledger row.
INSERT INTO inventory.stock (id, stock_id, load_row_id, load_id, status, location, parcel, stone_code_id, stone_code, stone, shape, size, color, clarity,
  cutting, quality, lot, cer_type, cer_no, price_unit, pcs, weight_ct, on_hand_pcs, on_hand_weight_ct, unit_cost_base, cost_amount_base, stock_price,
  sale_price, currency_code, vendor_id, vendor_name_snapshot, item_note, ref_doc_date, ref_doc_no, version, created_at, updated_at)
SELECT x.stock_uuid, x.stock_id, r.id, s.id, 'ACTIVE', r.location, r.parcel, r.stone_code_id, r.stone_code, r.stone, r.shape, r.size, r.color, r.clarity,
       r.cutting, r.quality, r.lot, r.cer_type, r.cer_no, r.price_unit, r.pcs, r.weight_ct, r.pcs, r.weight_ct, r.unit_cost_base, r.cost_amount_base,
       r.stock_price, r.sale_price, c.cc, h.vendor_id, h.vendor_name_snapshot, r.item_note, s.doc_date, s.doc_no, 1,
       s.created_at + interval '3 hours', s.created_at + interval '3 hours'
FROM seed_lrow x JOIN seed_load s ON s.idx = x.idx CROSS JOIN seed_cfg c
JOIN inventory.load_to_stock h ON h.id = s.id JOIN inventory.load_to_stock_row r ON r.id = x.row_id
WHERE x.st = 'APPROVED';
ANALYZE inventory.stock;
INSERT INTO inventory.stock_movement (id, stock_uuid, kind, document_type, document_id, revision, pcs_delta, weight_delta, cost_delta_base, created_at, created_by)
SELECT uuidv7(), x.stock_uuid, 'LOAD_IN', 'load-to-stock', x.load_id, 1, x.pcs, x.w, x.cost, s.created_at + interval '3 hours', 'seed-mock'
FROM seed_lrow x JOIN seed_load s ON s.idx = x.idx WHERE x.st = 'APPROVED';

-- ---------------------------------------------------------------- master-side ledger of the applied loads
-- (allocation.ts: header with revision / request hash / packed result, lines, issued Stock IDs, purchase_line.loaded_*)
UPDATE partner.purchase_line l SET loaded_pcs = l.loaded_pcs + x.p, loaded_weight_ct = l.loaded_weight_ct + x.w
FROM (SELECT line_id, sum(pcs) p, sum(w) w FROM seed_lrow WHERE st = 'APPROVED' GROUP BY 1) x
WHERE l.id = x.line_id;

-- request_hash = sha256 of allocationHash()'s JSON {v: vendor, n: new Stock ID count, l: [[line, pcs, "weight"]] sorted by line id};
-- result = packResult(): {s: Stock IDs in row order, l: [[line, remaining pcs, "remaining weight"]] sorted by line id}.
INSERT INTO partner.load_allocation (load_document_id, vendor_id, applied_revision, request_hash, result, created_at, updated_at, updated_by)
SELECT s.id, h.vendor_id, 1,
       encode(sha256(convert_to(format('{"v":"%s","n":%s,"l":[%s]}', lower(h.vendor_id::text), a.n, a.hash_lines), 'UTF8')), 'hex'),
       jsonb_build_object('s', a.stock_ids, 'l', a.remaining),
       s.created_at + interval '3 hours', s.created_at + interval '3 hours', 'seed-mock'
FROM seed_load s
JOIN inventory.load_to_stock h ON h.id = s.id
JOIN (
  SELECT x.idx, count(*) AS n,
         string_agg(format('["%s",%s,"%s"]', lower(x.line_id::text), x.pcs, x.w::numeric(12,3)::text), ',' ORDER BY lower(x.line_id::text) COLLATE "C") AS hash_lines,
         jsonb_agg(x.stock_id ORDER BY x.pos) AS stock_ids,
         jsonb_agg(jsonb_build_array(x.line_id, l.pcs - l.loaded_pcs, (l.weight_ct - l.loaded_weight_ct)::numeric(12,3)::text) ORDER BY lower(x.line_id::text) COLLATE "C") AS remaining
  FROM seed_lrow x JOIN partner.purchase_line l ON l.id = x.line_id
  WHERE x.st = 'APPROVED' GROUP BY x.idx
) a ON a.idx = s.idx
WHERE s.st = 'APPROVED';
ANALYZE partner.load_allocation;
INSERT INTO partner.load_allocation_line (load_document_id, purchase_line_id, pcs, weight_ct)
SELECT load_id, line_id, pcs, w FROM seed_lrow WHERE st = 'APPROVED';
INSERT INTO partner.load_stock_id (stock_id, load_document_id, issued_revision, issued_at)
SELECT x.stock_id, x.load_id, 1, s.created_at + interval '3 hours' FROM seed_lrow x JOIN seed_load s ON s.idx = x.idx WHERE x.st = 'APPROVED';

INSERT INTO partner.memo_stock_id_counter (year, last_no)
SELECT y, ctr0 + (SELECT count(*) FROM seed_lrow WHERE st = 'APPROVED') FROM seed_cfg
ON CONFLICT (year) DO UPDATE SET last_no = greatest(partner.memo_stock_id_counter.last_no, EXCLUDED.last_no);
-- Document Setup locks a numbering row once an inventory document took a number from it (ADR-0052 D10).
UPDATE partner.document_numbering SET external_used_at = now()
WHERE id = (SELECT numbering_id FROM seed_cfg) AND external_used_at IS NULL;

COMMIT;
\o
\pset tuples_only off
\echo 'inventory: done'
SELECT 'load_to_stock' AS "table", count(*) AS mock_rows FROM inventory.load_to_stock WHERE created_by = 'seed-mock'
UNION ALL SELECT 'load_to_stock (APPROVED)', count(*) FROM inventory.load_to_stock WHERE created_by = 'seed-mock' AND status = 'APPROVED'
UNION ALL SELECT 'load_to_stock_row', count(*) FROM inventory.load_to_stock_row r JOIN inventory.load_to_stock l ON l.id = r.load_id WHERE l.created_by = 'seed-mock'
UNION ALL SELECT 'stock', count(*) FROM inventory.stock s JOIN inventory.load_to_stock l ON l.id = s.load_id WHERE l.created_by = 'seed-mock'
UNION ALL SELECT 'stock_movement', count(*) FROM inventory.stock_movement WHERE created_by = 'seed-mock'
UNION ALL SELECT 'partner.load_allocation', count(*) FROM partner.load_allocation WHERE updated_by = 'seed-mock';
