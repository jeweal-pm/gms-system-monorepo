-- =====================================================================================================================
-- DEV-ONLY mock data for backend-api-master (schemas "partner" + "stone"). Never run against production.
--
--   master data  : :n_master rows each — customer (+invoice/shipping address), vendor (+address), currency, location,
--                  stone group / size / color / cutting / clarity / quality / name / shape, stone code
--   lines        : 20-50 per document by default (random); `lines_spec` ("type=min-max,…") sets them per type (≤ 200)
--   documents    : :n_doc documents each — Quotation, Reserve, Memo Receive, Memo Return, Memo Out, Memo Out Return,
--                  Purchase Order, Purchase (Memo Outstanding / Purchase Outstanding are views over these)
--
-- Relations follow the services' approval effects, so every bucket the UI reads is consistent:
--   approved Memo Receive line → memo_stock item (received = 10 slices of `a` pcs / `ws` ct)
--   slices 0-1 Memo Return · 2-3 Reserve (From Stock) · 4-5 Memo Out (From Stock) · 6-7 Purchase (IN_STOCK) ·
--   8 Quotation (From Stock, holds nothing) · 9 stays pending → buckets recomputed from APPROVED documents only
--   Memo Out Return returns half of an approved Memo Out's lines (≤ 2 returns per memo out)
--   Purchase lines come from an approved PO (half of each PO line), from Memo Stock, or are manual
--
-- Every row is marked created_by = 'seed-mock'. Re-running is a no-op; use the runner's --reset to rebuild.
-- Run through docker/seed-mock.cjs (psql variables n_master, n_doc).
-- =====================================================================================================================
\set ON_ERROR_STOP on
\if :{?n_master}
\else
  \set n_master 1000
\endif
\if :{?n_doc}
\else
  \set n_doc 100000
\endif
-- Lines per document: "type=min-max,…" (types: quotation reserve memo-receive memo-return memo-out memo-out-return
-- purchase-order purchase load-to-stock); a missing type keeps the default 20-50.
\if :{?lines_spec}
\else
  \set lines_spec ''
\endif

SELECT EXISTS (SELECT 1 FROM partner.customer WHERE created_by = 'seed-mock') AS seeded \gset
\if :seeded
  \echo 'master: mock data already present - skipped (use --reset to rebuild)'
  \quit
\endif

\set QUIET on
\pset tuples_only on
\echo 'master: seeding' :n_master 'master rows,' :n_doc 'documents per module ...'
\o /dev/null
BEGIN;
SET LOCAL statement_timeout = 0;
SET LOCAL synchronous_commit = off;
SET LOCAL work_mem = '32MB';
-- Same advisory lock the services take before issuing Stock IDs (memo-receive.service.ts STOCK_ID_LOCK_KEY).
SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext('partner.memo_stock_id_counter.issue'))) l;

-- ---------------------------------------------------------------- helpers (session-local, dropped at disconnect)
CREATE FUNCTION pg_temp.rnd(i bigint, salt int) RETURNS float8 LANGUAGE sql IMMUTABLE
  AS $$ SELECT (hashint8(i * 1000003 + salt) & 2147483647)::float8 / 2147483648.0 $$;
CREATE FUNCTION pg_temp.pick(i bigint, salt int, n int) RETURNS int LANGUAGE sql IMMUTABLE
  AS $$ SELECT 1 + floor(pg_temp.rnd(i, salt) * greatest(n, 1))::int $$;
-- Document status mix; DELETED = a soft-deleted DRAFT, CANCELLED only where the table allows it (quotation).
CREATE FUNCTION pg_temp.st(i bigint, salt int, cancel bool) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN r < 60 THEN 'APPROVED' WHEN r < 75 THEN 'DRAFT' WHEN r < 85 THEN 'PENDING_APPROVAL'
              WHEN r < 90 THEN 'REJECTED' WHEN r < 95 THEN 'REVISION_REQUESTED' WHEN r < 98 THEN 'DELETED'
              WHEN cancel THEN 'CANCELLED' ELSE 'APPROVED' END
  FROM (SELECT pg_temp.rnd(i, salt) * 100 AS r) x $$;
CREATE TEMP TABLE seed_lines (dtype text PRIMARY KEY, lo int NOT NULL, hi int NOT NULL, CHECK (lo BETWEEN 1 AND 200 AND hi BETWEEN lo AND 200));
INSERT INTO seed_lines
SELECT t, 20, 50 FROM unnest(ARRAY['quotation','reserve','memo-receive','memo-return','memo-out','memo-out-return','purchase-order','purchase','load-to-stock']) t;
UPDATE seed_lines l SET lo = x.lo, hi = x.hi
FROM (SELECT split_part(e, '=', 1) AS t, split_part(split_part(e, '=', 2), '-', 1)::int AS lo,
             coalesce(nullif(split_part(split_part(e, '=', 2), '-', 2), ''), split_part(split_part(e, '=', 2), '-', 1))::int AS hi
      FROM unnest(string_to_array(nullif(:'lines_spec', ''), ',')) e) x
WHERE l.dtype = x.t;
-- Number of lines of document i of a type (fixed when min = max).
CREATE FUNCTION pg_temp.nl(p_dtype text, i bigint, salt int) RETURNS int LANGUAGE sql STABLE
  AS $$ SELECT lo + floor(pg_temp.rnd(i, salt) * (hi - lo + 1))::int FROM seed_lines WHERE dtype = p_dtype $$;
CREATE FUNCTION pg_temp.basis(pu text, pcs int, w numeric) RETURNS numeric LANGUAGE sql IMMUTABLE
  AS $$ SELECT CASE WHEN pu = 'PER_CT' THEN w ELSE pcs::numeric END $$;

-- ---------------------------------------------------------------- base settings
INSERT INTO partner.company_profile (id, name, tax_id, contact_name, phone_country, phone_e164, email, address, country_code, state, city, postcode, currency_code, updated_by)
VALUES (1, 'GMS Demo Jewelry Co., Ltd.', '0105561234567', 'Demo Admin', 'TH', '+6621234567', 'info@gms-demo.example.com', '99 Silom Road', 'TH', 'Bangkok', 'Bang Rak', '10500', 'THB', 'seed-mock')
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE seed_cfg AS
SELECT cp.currency_code::text AS base,
       CASE WHEN cp.currency_code = 'USD' THEN 'THB' ELSE 'USD' END AS second,
       35.000000::numeric(18,6) AS second_rate,
       (extract(year FROM now() AT TIME ZONE 'Asia/Bangkok')::int % 100) AS y,
       0 AS nc, 0 AS nv, 0 AS nsc, 0 AS nloc, 0 AS ctr0
FROM partner.company_profile cp WHERE cp.id = 1;

-- Base and second currency must exist (documents use only these two).
INSERT INTO partner.currency (id, code, name, created_by, updated_by)
SELECT uuidv7(), base, base, 'seed-mock', 'seed-mock' FROM seed_cfg ON CONFLICT (code) DO NOTHING;
INSERT INTO partner.currency (id, code, name, selling_rate, buying_rate, created_by, updated_by)
SELECT uuidv7(), second, CASE second WHEN 'USD' THEN 'US Dollar' ELSE 'Thai Baht' END, 35, 34.5, 'seed-mock', 'seed-mock' FROM seed_cfg
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------- master data
-- Currency: 3-letter codes from the Q/X/J/Z ranges (not real trading currencies), skipping existing codes.
INSERT INTO partner.currency (id, code, name, description, selling_rate, buying_rate, active, created_by, updated_by)
SELECT uuidv7(), code, 'Mock Currency ' || code, 'Generated mock currency', r, round(r * 0.98, 4), true, 'seed-mock', 'seed-mock'
FROM (
  SELECT chr(l) || chr(65 + g / 26) || chr(65 + g % 26) AS code, ord, g,
         round((0.5 + pg_temp.rnd(ord * 1000 + g, 1) * 49.5)::numeric, 4) AS r
  FROM unnest(ARRAY[81, 88, 74, 90]) WITH ORDINALITY u(l, ord), generate_series(0, 675) g
) c
WHERE NOT EXISTS (SELECT 1 FROM partner.currency x WHERE x.code = c.code)
ORDER BY ord, g LIMIT :n_master;

-- Customer
CREATE TEMP TABLE seed_customer AS
SELECT row_number() OVER (ORDER BY i)::int AS idx, uuidv7() AS id, 'MC' || lpad(i::text, greatest(5, length(i::text)), '0') AS code
FROM generate_series(1, :n_master * 2) i
WHERE NOT EXISTS (SELECT 1 FROM partner.customer c WHERE c.code_key = lower('MC' || lpad(i::text, greatest(5, length(i::text)), '0')))
ORDER BY i LIMIT :n_master;
ALTER TABLE seed_customer ADD COLUMN name text, ADD COLUMN currency text, ADD COLUMN first_name text, ADD COLUMN last_name text,
  ADD COLUMN inv_addr_id uuid, ADD COLUMN inv_snap text, ADD COLUMN ship_addr_id uuid, ADD COLUMN ship_snap text,
  ADD COLUMN street text, ADD COLUMN state text, ADD COLUMN city text, ADD COLUMN postcode text;
UPDATE seed_customer s SET
  name = (ARRAY['Siam','Golden','Royal','Lanna','Andaman','Chao Phraya','Mekong','Emerald','Sapphire','Ruby','Pearl','Lotus','Orchid','Crown','Star','Oriental','Bangkok','Phuket','Chiang Mai','Pattaya'])[1 + (idx - 1) % 20]
      || ' ' || (ARRAY['Jewelry','Gems','Trading','Diamond','Gold','Precious Stones','Jewels','Gem House','Collection','Atelier'])[1 + ((idx - 1) / 20) % 10]
      || ' ' || (ARRAY['Co., Ltd.','Ltd.','Group','International','Partners'])[1 + ((idx - 1) / 200) % 5]
      || CASE WHEN idx > 1000 THEN ' ' || idx ELSE '' END,
  currency = CASE WHEN pg_temp.rnd(idx, 2) < 0.8 THEN c.base ELSE c.second END,
  first_name = (ARRAY['Somchai','Suda','Anan','Kanya','Prasert','Malee','Niran','Ploy','Arthit','Nok','James','Emma','Raj','Mei','Hiro','Sofia','Omar','Lena','David','Anna','Chai','Fah','Ton','Mint','Beam'])[pg_temp.pick(idx, 3, 25)],
  last_name = (ARRAY['Srisuk','Wongsa','Charoen','Boonmee','Thongdee','Rattana','Kittisak','Saetang','Smith','Patel','Tanaka','Cohen','Rossi','Muller','Chen','Kumar','Lee','Garcia','Nguyen','Silva'])[pg_temp.pick(idx, 4, 20)],
  street = pg_temp.pick(idx, 5, 999) || ' ' || (ARRAY['Silom Road','Sukhumvit Road','Charoen Krung Road','Rama IV Road','Sathorn Road','Phahonyothin Road','Ratchadaphisek Road','Si Phraya Road'])[pg_temp.pick(idx, 6, 8)],
  state = (ARRAY['Bangkok','Chanthaburi','Chiang Mai','Phuket','Chon Buri','Nonthaburi','Songkhla','Khon Kaen'])[pg_temp.pick(idx, 7, 8)],
  city = (ARRAY['Bang Rak','Pathum Wan','Mueang','Khlong Toei','Sathon','Chatuchak','Huai Khwang','Watthana'])[pg_temp.pick(idx, 8, 8)],
  postcode = (10000 + pg_temp.pick(idx, 9, 90000) - 1)::text,
  inv_addr_id = uuidv7(), ship_addr_id = uuidv7()
FROM seed_cfg c;
UPDATE seed_customer SET
  inv_snap = name || E'\n' || street || E'\n' || city || ', ' || state || ' ' || postcode || E'\nTH',
  ship_snap = name || ' (Shipping)' || E'\n' || street || E'\n' || city || ', ' || state || ' ' || postcode || E'\nTH';
INSERT INTO partner.customer (id, name, name_key, code, code_key, currency_code, active, first_name, last_name, phone_e164, phone_country, email, created_at, updated_at, created_by, updated_by)
SELECT id, name, lower(name), code, lower(code), currency, pg_temp.rnd(idx, 10) < 0.97, first_name, last_name,
       '+668' || lpad((10000000 + idx * 7919 % 89999999)::text, 8, '0'), 'TH', lower(code) || '@customer.mock.example.com',
       now() - interval '700 days', now() - interval '700 days', 'seed-mock', 'seed-mock'
FROM seed_customer;
INSERT INTO partner.customer_address (id, customer_id, type, position, name, tax_id, address, country_code, state, city, postcode, is_default)
SELECT inv_addr_id, id, 'INVOICE'::partner.address_type, 1, name, lpad((105500000000 + idx)::text, 13, '0'), street, 'TH', state, city, postcode, true FROM seed_customer
UNION ALL
SELECT ship_addr_id, id, 'SHIPPING'::partner.address_type, 1, name || ' (Shipping)', NULL, street, 'TH', state, city, postcode, true FROM seed_customer;
ANALYZE partner.customer; ANALYZE partner.customer_address; ANALYZE seed_customer;

-- Vendor
CREATE TEMP TABLE seed_vendor AS
SELECT row_number() OVER (ORDER BY i)::int AS idx, uuidv7() AS id, 'MV' || lpad(i::text, greatest(5, length(i::text)), '0') AS code
FROM generate_series(1, :n_master * 2) i
WHERE NOT EXISTS (SELECT 1 FROM partner.vendor v WHERE v.code_key = lower('MV' || lpad(i::text, greatest(5, length(i::text)), '0')))
ORDER BY i LIMIT :n_master;
ALTER TABLE seed_vendor ADD COLUMN name text, ADD COLUMN currency text, ADD COLUMN addr_id uuid, ADD COLUMN addr_snap text,
  ADD COLUMN street text, ADD COLUMN country text, ADD COLUMN city text, ADD COLUMN postcode text;
UPDATE seed_vendor s SET
  name = (ARRAY['Jaipur','Antwerp','Colombo','Mogok','Ratnapura','Chanthaburi','Hong Kong','Tel Aviv','Mumbai','Surat','Bangkok','Geneva','Dubai','Tokyo','New York','Madagascar','Tanzania','Mozambique','Kashmir','Ceylon'])[1 + (idx - 1) % 20]
      || ' ' || (ARRAY['Gem Supply','Rough Trading','Stone Cutters','Diamond Exchange','Mining','Lapidary','Gem Source','Precious Imports','Colored Stones','Bullion'])[1 + ((idx - 1) / 20) % 10]
      || ' ' || (ARRAY['Co., Ltd.','Ltd.','LLC','Pvt. Ltd.','B.V.'])[1 + ((idx - 1) / 200) % 5]
      || CASE WHEN idx > 1000 THEN ' ' || idx ELSE '' END,
  currency = CASE WHEN pg_temp.rnd(idx, 21) < 0.8 THEN c.base ELSE c.second END,
  street = pg_temp.pick(idx, 22, 999) || ' ' || (ARRAY['Gem Street','Diamond Lane','Johari Bazaar','Hoveniersstraat','Galle Road','Nathan Road','Opera House Road','Market Street'])[pg_temp.pick(idx, 23, 8)],
  country = (ARRAY['TH','IN','BE','LK','MM','HK','IL','AE'])[pg_temp.pick(idx, 24, 8)],
  city = (ARRAY['Bangkok','Jaipur','Antwerp','Colombo','Yangon','Hong Kong','Ramat Gan','Dubai'])[pg_temp.pick(idx, 25, 8)],
  postcode = (10000 + pg_temp.pick(idx, 26, 89999))::text,
  addr_id = uuidv7()
FROM seed_cfg c;
UPDATE seed_vendor SET addr_snap = name || E'\n' || street || E'\n' || city || ' ' || postcode || E'\n' || country;
INSERT INTO partner.vendor (id, name, name_key, code, code_key, currency_code, active, first_name, last_name, phone_e164, phone_country, email, created_at, updated_at, created_by, updated_by)
SELECT id, name, lower(name), code, lower(code), currency, pg_temp.rnd(idx, 27) < 0.97,
       (ARRAY['Arun','Pieter','Nimal','Kyaw','Wing','Avi','Rahul','Yusuf','Kenji','Maria'])[pg_temp.pick(idx, 28, 10)],
       (ARRAY['Shah','Janssens','Perera','Aung','Wong','Levi','Mehta','Hassan','Sato','Lopez'])[pg_temp.pick(idx, 29, 10)],
       '+668' || lpad((20000000 + idx * 7907 % 79999999)::text, 8, '0'), 'TH', lower(code) || '@vendor.mock.example.com',
       now() - interval '700 days', now() - interval '700 days', 'seed-mock', 'seed-mock'
FROM seed_vendor;
INSERT INTO partner.vendor_address (id, vendor_id, position, name, tax_id, address, country_code, state, city, postcode, is_default)
SELECT addr_id, id, 1, name, NULL, street, country, city, city, postcode, true FROM seed_vendor;
ANALYZE partner.vendor; ANALYZE partner.vendor_address; ANALYZE seed_vendor;

-- Location
CREATE TEMP TABLE seed_location AS
SELECT row_number() OVER (ORDER BY i)::int AS idx, uuidv7() AS id,
       (ARRAY['Vault','Safe','Showroom','Workshop','Office','Branch','Display','Cabinet'])[1 + (i - 1) % 8] || ' ' || chr(65 + ((i - 1) / 8) % 26) || '-' || lpad(i::text, greatest(5, length(i::text)), '0') AS name
FROM generate_series(1, :n_master * 2) i
WHERE NOT EXISTS (SELECT 1 FROM partner.location l
                  WHERE lower(l.name) = lower((ARRAY['Vault','Safe','Showroom','Workshop','Office','Branch','Display','Cabinet'])[1 + (i - 1) % 8] || ' ' || chr(65 + ((i - 1) / 8) % 26) || '-' || lpad(i::text, greatest(5, length(i::text)), '0')))
ORDER BY i LIMIT :n_master;
INSERT INTO partner.location (id, name, active, created_by, updated_by)
SELECT id, name, true, 'seed-mock', 'seed-mock' FROM seed_location;

-- Stone lookups (codes UPPERCASE ^[A-Z0-9./-]{1,20}$), skipping codes that already exist.
CREATE TEMP TABLE seed_lookup (kind text, idx int, id uuid, code text, name text, PRIMARY KEY (kind, idx));
INSERT INTO seed_lookup
SELECT k.kind, row_number() OVER (PARTITION BY k.kind ORDER BY i)::int, uuidv7(), k.prefix || lpad(i::text, greatest(5, length(i::text)), '0'),
       k.names[1 + (i - 1) % cardinality(k.names)] || ' ' || i
FROM (VALUES
  ('group',   'MSG', ARRAY['Diamond','Corundum','Beryl','Garnet','Quartz','Tourmaline','Spinel','Topaz','Chrysoberyl','Feldspar']),
  ('color',   'MCO', ARRAY['D','E','F','G','H','Pigeon Blood','Royal Blue','Cornflower','Vivid Green','Pink','Padparadscha','Yellow','Teal','Purple','Orange']),
  ('cutting', 'MCU', ARRAY['Excellent','Very Good','Good','Fair','Brilliant','Step','Mixed','Rose','Precision','Native']),
  ('clarity', 'MCL', ARRAY['FL','IF','VVS1','VVS2','VS1','VS2','SI1','SI2','I1','Eye Clean']),
  ('quality', 'MQA', ARRAY['AAA','AA','A','B','Commercial','Fine','Top','Collector']),
  ('name',    'MSN', ARRAY['Diamond','Ruby','Sapphire','Emerald','Spinel','Tourmaline','Tanzanite','Aquamarine','Garnet','Topaz','Peridot','Amethyst','Citrine','Opal','Morganite','Zircon','Alexandrite','Tsavorite','Paraiba','Moonstone']),
  ('shape',   'MSH', ARRAY['Round','Oval','Cushion','Emerald Cut','Pear','Marquise','Heart','Princess','Radiant','Asscher','Trillion','Baguette','Cabochon'])
) k(kind, prefix, names)
CROSS JOIN generate_series(1, :n_master * 2) i
WHERE NOT EXISTS (
  SELECT 1 FROM (
    SELECT 'group' kind, code FROM stone.stone_group UNION ALL SELECT 'color', code FROM stone.stone_color
    UNION ALL SELECT 'cutting', code FROM stone.stone_cutting UNION ALL SELECT 'clarity', code FROM stone.stone_clarity
    UNION ALL SELECT 'quality', code FROM stone.stone_quality UNION ALL SELECT 'name', code FROM stone.stone_name
    UNION ALL SELECT 'shape', code FROM stone.stone_shape) e
  WHERE e.kind = k.kind AND e.code = k.prefix || lpad(i::text, greatest(5, length(i::text)), '0'));
DELETE FROM seed_lookup WHERE idx > :n_master;
-- Sizes have a unique name only.
INSERT INTO seed_lookup
SELECT 'size', row_number() OVER (ORDER BY i)::int, uuidv7(), NULL, to_char(0.10 + i * 0.05, 'FM990.00') || ' mm'
FROM generate_series(1, :n_master * 2) i
WHERE NOT EXISTS (SELECT 1 FROM stone.stone_size s WHERE s.name = to_char(0.10 + i * 0.05, 'FM990.00') || ' mm')
ORDER BY i LIMIT :n_master;

INSERT INTO stone.stone_group (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'group';
INSERT INTO stone.stone_color (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'color';
INSERT INTO stone.stone_cutting (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'cutting';
INSERT INTO stone.stone_clarity (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'clarity';
INSERT INTO stone.stone_quality (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'quality';
INSERT INTO stone.stone_shape (id, code, name, created_by, updated_by) SELECT id, code, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'shape';
INSERT INTO stone.stone_size (id, name, created_by, updated_by) SELECT id, name, 'seed-mock', 'seed-mock' FROM seed_lookup WHERE kind = 'size';
ANALYZE stone.stone_group; ANALYZE stone.stone_color; ANALYZE stone.stone_cutting; ANALYZE stone.stone_clarity; ANALYZE stone.stone_quality; ANALYZE stone.stone_shape; ANALYZE stone.stone_size; ANALYZE seed_lookup;
INSERT INTO stone.stone_name (id, code, name, group_id, hsn, created_by, updated_by)
SELECT n.id, n.code, n.name, g.id, CASE WHEN pg_temp.rnd(n.idx, 31) < 0.6 THEN '7103' || lpad((n.idx % 100)::text, 2, '0') END, 'seed-mock', 'seed-mock'
FROM seed_lookup n
JOIN seed_lookup g ON g.kind = 'group' AND g.idx = 1 + (n.idx - 1) % (SELECT count(*) FROM seed_lookup WHERE kind = 'group')
WHERE n.kind = 'name';
ANALYZE stone.stone_name;
-- Each shape offers three sizes.
INSERT INTO stone.stone_shape_size (shape_id, size_id)
SELECT DISTINCT sh.id, sz.id
FROM seed_lookup sh CROSS JOIN generate_series(0, 2) o
JOIN seed_lookup sz ON sz.kind = 'size' AND sz.idx = 1 + (sh.idx * 3 + o) % (SELECT count(*) FROM seed_lookup WHERE kind = 'size')
WHERE sh.kind = 'shape';

-- Stone code: every part set, MANUAL mode, default part order.
CREATE TEMP TABLE seed_sc AS
WITH cnt AS (SELECT kind, count(*)::int AS n FROM seed_lookup GROUP BY kind)
SELECT i AS idx, uuidv7() AS id, 'MSC' || lpad(i::text, greatest(6, length(i::text)), '0') AS code,
       nm.id AS name_id, sz.id AS size_id, sh.id AS shape_id, co.id AS color_id, cu.id AS cutting_id, cl.id AS clarity_id, qu.id AS quality_id,
       regexp_replace(nm.name, ' [0-9]+$', '') AS stone, regexp_replace(sh.name, ' [0-9]+$', '') AS shape, sz.name AS size,
       regexp_replace(co.name, ' [0-9]+$', '') AS color, regexp_replace(cl.name, ' [0-9]+$', '') AS clarity,
       regexp_replace(cu.name, ' [0-9]+$', '') AS cutting, regexp_replace(qu.name, ' [0-9]+$', '') AS quality
FROM generate_series(1, :n_master) i
JOIN seed_lookup nm ON nm.kind = 'name'    AND nm.idx = 1 + (i - 1)      % (SELECT n FROM cnt WHERE kind = 'name')
JOIN seed_lookup sz ON sz.kind = 'size'    AND sz.idx = 1 + (i * 7)      % (SELECT n FROM cnt WHERE kind = 'size')
JOIN seed_lookup sh ON sh.kind = 'shape'   AND sh.idx = 1 + (i * 11)     % (SELECT n FROM cnt WHERE kind = 'shape')
JOIN seed_lookup co ON co.kind = 'color'   AND co.idx = 1 + (i * 13)     % (SELECT n FROM cnt WHERE kind = 'color')
JOIN seed_lookup cu ON cu.kind = 'cutting' AND cu.idx = 1 + (i * 17)     % (SELECT n FROM cnt WHERE kind = 'cutting')
JOIN seed_lookup cl ON cl.kind = 'clarity' AND cl.idx = 1 + (i * 19)     % (SELECT n FROM cnt WHERE kind = 'clarity')
JOIN seed_lookup qu ON qu.kind = 'quality' AND qu.idx = 1 + (i * 23)     % (SELECT n FROM cnt WHERE kind = 'quality')
WHERE NOT EXISTS (SELECT 1 FROM stone.stone_code c WHERE c.code = 'MSC' || lpad(i::text, greatest(6, length(i::text)), '0'));
INSERT INTO stone.stone_code (id, code, mode, stone_name_id, size_id, shape_id, color_id, cutting_id, clarity_id, quality_id, part_order, active, created_by, updated_by)
SELECT id, code, 'MANUAL'::stone.stone_code_mode, name_id, size_id, shape_id, color_id, cutting_id, clarity_id, quality_id,
       ARRAY['name','size','shape','color','cutting','clarity','quality'], true, 'seed-mock', 'seed-mock'
FROM seed_sc;
-- Re-number densely so `pick(…, nsc)` always hits a row.
CREATE TEMP TABLE seed_sc2 AS SELECT row_number() OVER (ORDER BY idx)::int AS idx, id, code, stone, shape, size, color, clarity, cutting, quality FROM seed_sc;
DROP TABLE seed_sc; ALTER TABLE seed_sc2 RENAME TO seed_sc;
CREATE UNIQUE INDEX ON seed_sc (idx);
ANALYZE stone.stone_code;

UPDATE seed_cfg SET nc = (SELECT count(*) FROM seed_customer), nv = (SELECT count(*) FROM seed_vendor),
                    nsc = (SELECT count(*) FROM seed_sc), nloc = (SELECT count(*) FROM seed_location);
CREATE UNIQUE INDEX ON seed_customer (idx);
CREATE UNIQUE INDEX ON seed_vendor (idx);
CREATE UNIQUE INDEX ON seed_location (idx);

-- ---------------------------------------------------------------- Document Setup + one numbering row per type
INSERT INTO partner.document_setup (transaction_key, name, code, start_from, updated_by)
VALUES ('quotation', 'Quotation', 'QT', 1, 'seed-mock'), ('reserve', 'Reserve', 'RS', 1, 'seed-mock'),
       ('memo-receive', 'Memo Receive', 'MR', 1, 'seed-mock'), ('memo-return', 'Memo Return', 'MRT', 1, 'seed-mock'),
       ('memo-out', 'Memo Out', 'MO', 1, 'seed-mock'), ('memo-out-return', 'Memo Out Return', 'MOR', 1, 'seed-mock'),
       ('purchase-order', 'Purchase Order', 'PO', 1, 'seed-mock'), ('purchase', 'Purchase', 'PU', 1, 'seed-mock'),
       ('load-to-stock', 'Load to Stock', 'LS', 1, 'seed-mock')
ON CONFLICT DO NOTHING;
INSERT INTO partner.document_numbering (id, transaction_key, effective_date, prefix, separator, start_no)
SELECT uuidv7(), d.transaction_key, DATE '2024-01-01', d.code, '-', d.start_from FROM partner.document_setup d
WHERE d.transaction_key IN ('quotation','reserve','memo-receive','memo-return','memo-out','memo-out-return','purchase-order','purchase','load-to-stock')
ON CONFLICT (transaction_key, effective_date) DO NOTHING;

CREATE TEMP TABLE seed_num (dtype text PRIMARY KEY, id uuid, prefix text, sep text, base int);
INSERT INTO seed_num
SELECT n.transaction_key, n.id, n.prefix, n.separator, 0
FROM partner.document_numbering n
WHERE n.effective_date = DATE '2024-01-01'
  AND n.transaction_key IN ('quotation','reserve','memo-receive','memo-return','memo-out','memo-out-return','purchase-order','purchase');
-- Running numbers continue after anything already issued from that row.
UPDATE seed_num s SET base = greatest(x.m, (SELECT start_no - 1 FROM partner.document_numbering WHERE id = s.id))
FROM (
  SELECT 'quotation' t, (SELECT coalesce(max(running_no), 0) FROM partner.quotation q JOIN seed_num n ON n.dtype = 'quotation' AND q.numbering_id = n.id) m
  UNION ALL SELECT 'reserve', (SELECT coalesce(max(running_no), 0) FROM partner.reserve q JOIN seed_num n ON n.dtype = 'reserve' AND q.numbering_id = n.id)
  UNION ALL SELECT 'memo-receive', (SELECT coalesce(max(running_no), 0) FROM partner.memo_receive q JOIN seed_num n ON n.dtype = 'memo-receive' AND q.numbering_id = n.id)
  UNION ALL SELECT 'memo-return', (SELECT coalesce(max(running_no), 0) FROM partner.memo_return q JOIN seed_num n ON n.dtype = 'memo-return' AND q.numbering_id = n.id)
  UNION ALL SELECT 'memo-out', (SELECT coalesce(max(running_no), 0) FROM partner.memo_out q JOIN seed_num n ON n.dtype = 'memo-out' AND q.numbering_id = n.id)
  UNION ALL SELECT 'memo-out-return', (SELECT coalesce(max(running_no), 0) FROM partner.memo_out_return q JOIN seed_num n ON n.dtype = 'memo-out-return' AND q.numbering_id = n.id)
  UNION ALL SELECT 'purchase-order', (SELECT coalesce(max(running_no), 0) FROM partner.purchase_order q JOIN seed_num n ON n.dtype = 'purchase-order' AND q.numbering_id = n.id)
  UNION ALL SELECT 'purchase', (SELECT coalesce(max(running_no), 0) FROM partner.purchase q JOIN seed_num n ON n.dtype = 'purchase' AND q.numbering_id = n.id)
) x WHERE x.t = s.dtype;

-- ---------------------------------------------------------------- staging tables
CREATE TEMP TABLE seed_hdr (
  dtype text, idx int, id uuid, st text, status text, doc_date date, due_date date, party int, currency text, rate numeric(18,6),
  disc_type text, disc_val numeric(18,4), tax_en bool, tax_rate numeric(9,4), charge numeric(18,2), ref text, kind text, src int, slot int,
  numbering_id uuid, running_no int, doc_no text, created_at timestamp,
  sub_at timestamp, sub_by text, sub_name text, appr_at timestamp, appr_by text, del_at timestamp, del_by text,
  rv_action text, rv_note text, rv_at timestamp, rv_by text, rv_name text, rev_count int, status_reason text,
  PRIMARY KEY (dtype, idx)
);
CREATE INDEX ON seed_hdr (dtype, id);

CREATE TEMP TABLE seed_line (
  doc_id uuid, pos int, id uuid, source text, sc_id uuid, sc_code text, stone text, shape text, size text, color text, clarity text,
  cutting text, quality text, lot text, loc text, cer_type text, cer_no text, item_note text,
  pcs int, w numeric(12,3), pu text, up numeric(18,2), amt numeric(18,2),
  ms_id uuid, stock_id text, sp_pcs int, sp_w numeric(12,3), memo_group text, po_line_id uuid, mol_id uuid, out_pcs int, out_w numeric(12,3),
  slice_a int, slice_w numeric(12,3)
);

-- Base header rows for a type: dates rise with the running number over 2025-01-01 … 2026-11-18.
CREATE FUNCTION pg_temp.gen_headers(p_dtype text, p_n int, p_salt int, p_cancel bool, p_party text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO seed_hdr (dtype, idx, id, st, doc_date, party, disc_type, disc_val, tax_en, tax_rate, charge, ref)
  SELECT p_dtype, i, uuidv7(), pg_temp.st(i, p_salt, p_cancel),
         DATE '2025-01-01' + ((i - 1)::bigint * (DATE '2026-11-18' - DATE '2025-01-01') / greatest(p_n, 1))::int,
         pg_temp.pick(i, p_salt + 1, CASE p_party WHEN 'customer' THEN c.nc ELSE c.nv END),
         CASE WHEN pg_temp.rnd(i, p_salt + 2) < 0.3 THEN 'PERCENT' ELSE 'NONE' END,
         CASE WHEN pg_temp.rnd(i, p_salt + 2) < 0.3 THEN 5 ELSE 0 END,
         pg_temp.rnd(i, p_salt + 3) < 0.5,
         CASE WHEN pg_temp.rnd(i, p_salt + 3) < 0.5 THEN 7 ELSE 0 END,
         CASE WHEN pg_temp.rnd(i, p_salt + 4) < 0.3 THEN 500 ELSE 0 END,
         CASE WHEN pg_temp.rnd(i, p_salt + 5) < 0.5 THEN 'REF-' || lpad(i::text, greatest(6, length(i::text)), '0') ELSE '' END
  FROM generate_series(1, p_n) i CROSS JOIN seed_cfg c;
  IF p_party = 'customer' THEN
    UPDATE seed_hdr h SET currency = s.currency FROM seed_customer s WHERE h.dtype = p_dtype AND s.idx = h.party;
  ELSE
    UPDATE seed_hdr h SET currency = s.currency FROM seed_vendor s WHERE h.dtype = p_dtype AND s.idx = h.party;
  END IF;
  ANALYZE seed_hdr;
END $$;

-- Numbering, rate, timestamps and the status-dependent audit columns (CHECKs: submitted / approved / review / deleted).
CREATE FUNCTION pg_temp.finish_headers(p_dtype text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE seed_hdr h SET
    numbering_id = n.id, running_no = n.base + h.idx, doc_no = n.prefix || n.sep || (n.base + h.idx),
    due_date = h.doc_date + 30,
    rate = CASE WHEN h.currency = c.base THEN NULL ELSE c.second_rate END,
    created_at = h.doc_date + interval '9 hours' + (h.idx % 480) * interval '1 minute',
    status = CASE h.st WHEN 'DELETED' THEN 'DRAFT' ELSE h.st END,
    rev_count = CASE WHEN h.st = 'REVISION_REQUESTED' THEN 1 ELSE 0 END,
    status_reason = CASE WHEN h.st = 'CANCELLED' THEN 'Cancelled by customer' END
  FROM seed_num n, seed_cfg c
  WHERE h.dtype = p_dtype AND n.dtype = p_dtype;
  UPDATE seed_hdr h SET
    sub_at = CASE WHEN h.st IN ('DRAFT', 'DELETED') THEN NULL ELSE h.created_at + interval '1 hour' END,
    sub_by = CASE WHEN h.st IN ('DRAFT', 'DELETED') THEN NULL ELSE 'seed-mock' END,
    sub_name = CASE WHEN h.st IN ('DRAFT', 'DELETED') THEN NULL ELSE 'Mock Seeder' END,
    appr_at = CASE WHEN h.st IN ('APPROVED', 'CANCELLED') THEN h.created_at + interval '3 hours' END,
    appr_by = CASE WHEN h.st IN ('APPROVED', 'CANCELLED') THEN 'seed-mock' END,
    del_at = CASE WHEN h.st = 'DELETED' THEN h.created_at + interval '2 hours' END,
    del_by = CASE WHEN h.st = 'DELETED' THEN 'seed-mock' END,
    rv_action = CASE h.st WHEN 'REJECTED' THEN 'REJECT' WHEN 'REVISION_REQUESTED' THEN 'REVISE' END,
    rv_note = CASE h.st WHEN 'REJECTED' THEN 'Price is not acceptable' WHEN 'REVISION_REQUESTED' THEN 'Please correct the quantity' END,
    rv_at = CASE WHEN h.st IN ('REJECTED', 'REVISION_REQUESTED') THEN h.created_at + interval '2 hours' END,
    rv_by = CASE WHEN h.st IN ('REJECTED', 'REVISION_REQUESTED') THEN 'seed-mock' END,
    rv_name = CASE WHEN h.st IN ('REJECTED', 'REVISION_REQUESTED') THEN 'Mock Seeder' END
  WHERE h.dtype = p_dtype;
END $$;

-- Writes the staged headers of a type into its table (party columns differ for customer / vendor documents).
CREATE FUNCTION pg_temp.insert_headers(p_dtype text, p_table text, p_party text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE party_cols text; party_vals text; party_join text; extra_cols text := ''; extra_vals text := '';
BEGIN
  IF p_party = 'customer' THEN
    party_cols := 'customer_id, customer_code_snapshot, customer_name_snapshot, shipping_address_id, shipping_address_snapshot, invoice_address_id, invoice_address_snapshot';
    party_vals := 'p.id, p.code, p.name, p.ship_addr_id, p.ship_snap, p.inv_addr_id, p.inv_snap';
    party_join := 'JOIN seed_customer p ON p.idx = h.party';
  ELSE
    party_cols := 'vendor_id, vendor_code_snapshot, vendor_name_snapshot, address_id, address_snapshot';
    party_vals := 'p.id, p.code, p.name, p.addr_id, p.addr_snap';
    party_join := 'JOIN seed_vendor p ON p.idx = h.party';
  END IF;
  IF p_dtype = 'quotation' THEN extra_cols := ', status_reason'; extra_vals := ', h.status_reason'; END IF;
  EXECUTE format($sql$
    INSERT INTO partner.%I (id, numbering_id, running_no, doc_no, status, doc_date, due_date, %s, currency_code, exchange_rate, ref,
      document_note, discount_type, discount_value, tax_enabled, tax_rate, tax_included, subtotal, discount_amount, price_before_tax,
      tax_amount, charges_amount, labor_amount, grand_total, version, created_at, created_by, updated_at, updated_by, approved_at,
      approved_by, deleted_at, deleted_by, submitted_at, submitted_by, submitted_by_name, review_action, review_note, reviewed_at,
      reviewed_by, reviewed_by_name, line_count, total_pcs, total_weight_ct, auto_approved, revision_count %s)
    SELECT h.id, h.numbering_id, h.running_no, h.doc_no, h.status, h.doc_date, h.due_date, %s, h.currency, h.rate, h.ref,
      '', h.disc_type, h.disc_val, h.tax_en, h.tax_rate, false, 0, 0, 0, 0, 0, 0, 0, 1, h.created_at, 'seed-mock',
      coalesce(h.appr_at, h.rv_at, h.del_at, h.sub_at, h.created_at), 'seed-mock', h.appr_at, h.appr_by, h.del_at, h.del_by,
      h.sub_at, h.sub_by, h.sub_name, h.rv_action, h.rv_note, h.rv_at, h.rv_by, h.rv_name, 0, 0, 0, false, h.rev_count %s
    FROM seed_hdr h %s WHERE h.dtype = %L ORDER BY h.idx$sql$,
    p_table, party_cols, extra_cols, party_vals, extra_vals, party_join, p_dtype);
  EXECUTE format('ANALYZE partner.%I', p_table);
  ANALYZE seed_hdr;
  EXECUTE format($sql$INSERT INTO partner.%I (%I, charge_type, amount) SELECT id, 'SHIPPING', charge FROM seed_hdr WHERE dtype = %L AND charge > 0$sql$,
    p_table || '_charge', p_table || '_id', p_dtype);
END $$;

-- Manual lines (1-3 per document, 1-2 after a From Stock line). `p_mult` keeps quantities divisible: 2 → halvable for
-- Memo Out Return, 4/8 → loadable in quarters. Purchase documents of kind STOCK / PO get no manual lines.
CREATE FUNCTION pg_temp.manual_lines(p_dtype text, p_salt int, p_first_pos int, p_mult int, p_with_loc bool) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO seed_line (doc_id, pos, id, source, sc_id, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, loc,
                         cer_type, cer_no, item_note, pcs, w, pu, up)
  SELECT h.id, p_first_pos + g - 1, uuidv7(), 'MANUAL', s.id, s.code, s.stone, s.shape, s.size, s.color, s.clarity, s.cutting, s.quality,
         'LOT-' || lpad(pg_temp.pick(h.idx * 1000 + g, p_salt + 1, 9999)::text, 4, '0'),
         CASE WHEN p_with_loc THEN l.name ELSE '' END,
         CASE WHEN pg_temp.rnd(h.idx * 1000 + g, p_salt + 2) < 0.3 THEN 'GIA' ELSE '' END,
         CASE WHEN pg_temp.rnd(h.idx * 1000 + g, p_salt + 2) < 0.3 THEN (2100000000::bigint + h.idx * 1000 + g)::text ELSE '' END,
         '',
         p_mult * pg_temp.pick(h.idx * 1000 + g, p_salt + 3, 5),
         (p_mult * pg_temp.pick(h.idx * 1000 + g, p_salt + 4, 400))::numeric / 1000,
         CASE WHEN pg_temp.rnd(h.idx * 1000 + g, p_salt + 5) < 0.75 THEN 'PER_CT' ELSE 'PER_PCS' END,
         CASE WHEN pg_temp.rnd(h.idx * 1000 + g, p_salt + 5) < 0.75 THEN 100 * pg_temp.pick(h.idx * 1000 + g, p_salt + 6, 800)
              ELSE 50 * pg_temp.pick(h.idx * 1000 + g, p_salt + 6, 400) END
  FROM seed_hdr h
  CROSS JOIN seed_cfg c
  CROSS JOIN LATERAL generate_series(1, pg_temp.nl(p_dtype, h.idx, p_salt) - CASE WHEN h.kind = 'STOCK' THEN 1 ELSE 0 END) g
  JOIN seed_sc s ON s.idx = pg_temp.pick(h.idx * 1000 + g, p_salt + 7, c.nsc)
  JOIN seed_location l ON l.idx = pg_temp.pick(h.idx * 1000 + g, p_salt + 8, c.nloc)
  WHERE h.dtype = p_dtype AND (h.kind IS NULL OR h.kind = 'MANUAL' OR (h.kind = 'STOCK' AND p_dtype IN ('quotation', 'reserve', 'memo-out')));
END $$;

CREATE FUNCTION pg_temp.price_lines() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE seed_line SET amt = round(pg_temp.basis(pu, pcs, w) * up, 2) WHERE amt IS NULL;
  ANALYZE seed_line;
END $$;

-- Header quantity / money totals from the stored lines and charges (quotation.calculate.ts formula, no labor).
CREATE FUNCTION pg_temp.fill_totals(p_table text, p_line text, p_fk text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ANALYZE partner.%I, partner.%I, partner.%I', p_table, p_line, p_table || '_charge');
  EXECUTE format($sql$
    UPDATE partner.%1$I h SET line_count = t.n, total_pcs = t.p, total_weight_ct = t.w, subtotal = t.s, discount_amount = t.d,
      price_before_tax = t.s - t.d, tax_amount = t.tax, charges_amount = t.ch, labor_amount = 0, grand_total = t.s - t.d + t.tax + t.ch
    FROM (
      SELECT x.*, CASE WHEN x.tax_enabled THEN round((x.s - x.d) * x.tax_rate / 100, 2) ELSE 0 END AS tax
      FROM (
        SELECT h2.id, h2.tax_enabled, h2.tax_rate, a.n, a.p, a.w, a.s,
               CASE WHEN h2.discount_type = 'PERCENT' THEN round(a.s * h2.discount_value / 100, 2) ELSE 0 END AS d,
               coalesce(c.ch, 0) AS ch
        FROM partner.%1$I h2
        JOIN (SELECT %3$I AS id, count(*)::int n, sum(pcs)::int p, sum(weight_ct) w, sum(amount) s FROM partner.%2$I GROUP BY 1) a ON a.id = h2.id
        LEFT JOIN (SELECT %3$I AS id, sum(amount) ch FROM partner.%4$I GROUP BY 1) c ON c.id = h2.id
        WHERE h2.created_by = 'seed-mock'
      ) x
    ) t WHERE h.id = t.id$sql$, p_table, p_line, p_fk, p_table || '_charge');
END $$;

\echo 'master: master data done; documents ...'

-- ================================================================ 1. MEMO RECEIVE (vendor) → Memo Stock
SELECT pg_temp.gen_headers('memo-receive', :n_doc, 100, false, 'vendor');
SELECT pg_temp.finish_headers('memo-receive');
SELECT pg_temp.insert_headers('memo-receive', 'memo_receive', 'vendor');

-- Lines: received = 10 slices of a pcs / ws ct (a even, ws in even thousandths → every half is exact).
INSERT INTO seed_line (doc_id, pos, id, source, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, cer_type, cer_no, item_note,
                       slice_a, slice_w, pcs, w, pu, up)
SELECT h.id, g, uuidv7(), 'MANUAL', s.code, s.stone, s.shape, s.size, s.color, s.clarity, s.cutting, s.quality,
       'LOT-' || lpad(pg_temp.pick(h.idx * 1000 + g, 111, 9999)::text, 4, '0'),
       CASE WHEN pg_temp.rnd(h.idx * 1000 + g, 112) < 0.3 THEN 'GIA' ELSE '' END,
       CASE WHEN pg_temp.rnd(h.idx * 1000 + g, 112) < 0.3 THEN (2200000000::bigint + h.idx * 1000 + g)::text ELSE '' END, '',
       2 * pg_temp.pick(h.idx * 1000 + g, 113, 5), (2 * pg_temp.pick(h.idx * 1000 + g, 114, 400))::numeric / 1000,
       20 * pg_temp.pick(h.idx * 1000 + g, 113, 5), (20 * pg_temp.pick(h.idx * 1000 + g, 114, 400))::numeric / 1000,
       CASE WHEN pg_temp.rnd(h.idx * 1000 + g, 115) < 0.75 THEN 'PER_CT' ELSE 'PER_PCS' END,
       CASE WHEN pg_temp.rnd(h.idx * 1000 + g, 115) < 0.75 THEN 100 * pg_temp.pick(h.idx * 1000 + g, 116, 800) ELSE 50 * pg_temp.pick(h.idx * 1000 + g, 116, 400) END
FROM seed_hdr h CROSS JOIN seed_cfg c
CROSS JOIN LATERAL generate_series(1, pg_temp.nl('memo-receive', h.idx, 110)) g
JOIN seed_sc s ON s.idx = pg_temp.pick(h.idx * 1000 + g, 117, c.nsc)
WHERE h.dtype = 'memo-receive';
SELECT pg_temp.price_lines();

-- Stock IDs from the shared counter (year × 10,000 + n, ≥ 6 digits), in document / line order.
UPDATE seed_cfg SET ctr0 = coalesce((SELECT last_no FROM partner.memo_stock_id_counter WHERE year = seed_cfg.y), 0);
UPDATE seed_line l SET stock_id = lpad((c.y * 10000 + c.ctr0 + x.rn)::text, greatest(6, length((c.y * 10000 + c.ctr0 + x.rn)::text)), '0')
FROM (SELECT l2.id, row_number() OVER (ORDER BY h.idx, l2.pos) AS rn FROM seed_line l2 JOIN seed_hdr h ON h.dtype = 'memo-receive' AND h.id = l2.doc_id) x, seed_cfg c
WHERE l.id = x.id;
INSERT INTO partner.memo_stock_id_counter (year, last_no)
SELECT y, ctr0 + (SELECT count(*) FROM seed_line) FROM seed_cfg
ON CONFLICT (year) DO UPDATE SET last_no = greatest(partner.memo_stock_id_counter.last_no, EXCLUDED.last_no);

INSERT INTO partner.memo_receive_line (id, memo_receive_id, position, stock_id, source, stone_code_snapshot, stone, shape, size, color, clarity, cutting,
  quality, lot, cer_type, cer_no, pcs, weight_ct, price_unit, unit_price, amount, item_note)
SELECT id, doc_id, pos, stock_id, source, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, cer_type, cer_no, pcs, w, pu, up, amt, item_note
FROM seed_line;
ANALYZE partner.memo_receive_line;

-- Approval copies each line of an APPROVED (live) receive to Memo Stock; `seed_item` numbers those items.
CREATE TEMP TABLE seed_ar AS
SELECT row_number() OVER (ORDER BY h.idx)::int AS ar_no, h.id, h.party, h.currency, h.doc_date, h.doc_no
FROM seed_hdr h WHERE h.dtype = 'memo-receive' AND h.status = 'APPROVED' AND h.del_at IS NULL;
CREATE UNIQUE INDEX ON seed_ar (ar_no);
CREATE TEMP TABLE seed_item AS
SELECT row_number() OVER (ORDER BY a.ar_no, l.pos)::int AS item_no, a.ar_no, uuidv7() AS ms_id, l.id AS line_id, l.pos,
       a.id AS receive_id, a.party, a.currency, l.stock_id, l.slice_a AS a, l.slice_w AS ws, l.pu, l.up, l.amt,
       l.stone, l.shape, l.size, l.color, l.clarity, l.cutting, l.quality, l.lot, l.cer_type, l.cer_no
FROM seed_ar a JOIN seed_line l ON l.doc_id = a.id;
CREATE UNIQUE INDEX ON seed_item (item_no);
CREATE INDEX ON seed_item (ar_no);
INSERT INTO partner.memo_stock (id, stock_id, memo_receive_id, memo_receive_line_id, received_doc_no, received_doc_date, due_date, vendor_id,
  vendor_code_snapshot, vendor_name_snapshot, location, stone, shape, size, color, clarity, cutting, quality, lot, cer_type, cer_no, item_note,
  received_pcs, received_weight_ct, pending_pcs, pending_weight_ct, price_unit, unit_price, line_amount, net_unit_price, currency_code,
  created_at, created_by, updated_at)
SELECT i.ms_id, i.stock_id, i.receive_id, i.line_id, h.doc_no, h.doc_date, h.due_date, v.id, v.code, v.name, 'Memo',
       i.stone, i.shape, i.size, i.color, i.clarity, i.cutting, i.quality, i.lot, i.cer_type, i.cer_no, '',
       10 * i.a, 10 * i.ws, 10 * i.a, 10 * i.ws, i.pu, i.up, i.amt,
       round(i.amt / nullif(pg_temp.basis(i.pu, 10 * i.a, 10 * i.ws), 0), 4), i.currency, h.appr_at, 'seed-mock', h.appr_at
FROM seed_item i JOIN seed_hdr h ON h.dtype = 'memo-receive' AND h.id = i.receive_id JOIN seed_vendor v ON v.idx = i.party;
ANALYZE partner.memo_stock; ANALYZE seed_item; ANALYZE seed_ar;
TRUNCATE seed_line;
\echo 'master: memo receive done'

-- ================================================================ 2. PURCHASE ORDER (vendor; lines even multiples of 4 → half is loadable in quarters)
SELECT pg_temp.gen_headers('purchase-order', :n_doc, 200, false, 'vendor');
SELECT pg_temp.finish_headers('purchase-order');
SELECT pg_temp.insert_headers('purchase-order', 'purchase_order', 'vendor');
SELECT pg_temp.manual_lines('purchase-order', 210, 1, 8, true);
SELECT pg_temp.price_lines();
INSERT INTO partner.purchase_order_line (id, purchase_order_id, position, source, stone_code_id, stone_code_snapshot, stone, shape, size, color, clarity,
  cutting, quality, lot, location, cer_type, cer_no, pcs, weight_ct, price_unit, unit_price, amount, item_note)
SELECT id, doc_id, pos, 'MANUAL', sc_id, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no, pcs, w, pu, up, amt, item_note
FROM seed_line;
CREATE TEMP TABLE seed_apo AS
SELECT row_number() OVER (ORDER BY h.idx)::int AS apo_no, h.id, h.party, h.currency, h.doc_date
FROM seed_hdr h WHERE h.dtype = 'purchase-order' AND h.status = 'APPROVED' AND h.del_at IS NULL;
CREATE UNIQUE INDEX ON seed_apo (apo_no);
CREATE TEMP TABLE seed_po_line AS SELECT * FROM seed_line;
CREATE INDEX ON seed_po_line (doc_id);
ANALYZE partner.purchase_order_line; ANALYZE seed_po_line; ANALYZE seed_apo;
TRUNCATE seed_line;
\echo 'master: purchase order done'

-- ================================================================ 3. MEMO RETURN (vendor; returns slice 0/1 of every item of one approved receive)
SELECT pg_temp.gen_headers('memo-return', :n_doc, 300, false, 'vendor');
UPDATE seed_hdr h SET src = 1 + (h.idx - 1) % (SELECT count(*)::int FROM seed_ar), slot = ((h.idx - 1) / (SELECT count(*)::int FROM seed_ar)) % 2
WHERE h.dtype = 'memo-return';
UPDATE seed_hdr h SET party = a.party, currency = a.currency, doc_date = greatest(h.doc_date, a.doc_date)
FROM seed_ar a WHERE h.dtype = 'memo-return' AND a.ar_no = h.src;
SELECT pg_temp.finish_headers('memo-return');
SELECT pg_temp.insert_headers('memo-return', 'memo_return', 'vendor');
INSERT INTO seed_line (doc_id, pos, id, source, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no, item_note,
                       pcs, w, pu, up, ms_id, stock_id, out_pcs, out_w)
SELECT h.id, i.pos, uuidv7(), 'STOCK', i.stone, i.shape, i.size, i.color, i.clarity, i.cutting, i.quality, i.lot, 'Memo', i.cer_type, i.cer_no, '',
       i.a, i.ws, i.pu, i.up, i.ms_id, i.stock_id, (10 - h.slot) * i.a, (10 - h.slot) * i.ws
FROM seed_hdr h JOIN seed_item i ON i.ar_no = h.src WHERE h.dtype = 'memo-return' AND i.pos <= pg_temp.nl('memo-return', h.idx, 310);
SELECT pg_temp.price_lines();
INSERT INTO partner.memo_return_line (id, memo_return_id, position, memo_stock_id, stock_id, outstanding_pcs, outstanding_weight_ct, source, stone,
  shape, size, color, clarity, cutting, quality, lot, location, cer_type, cer_no, pcs, weight_ct, price_unit, unit_price, amount, item_note)
SELECT id, doc_id, pos, ms_id, stock_id, out_pcs, out_w, source, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no,
       pcs, w, pu, up, amt, item_note
FROM seed_line;
ANALYZE partner.memo_return_line;
TRUNCATE seed_line;
\echo 'master: memo return done'

-- ================================================================ 4/5/8. customer documents with optional From Stock line (slice 2|4|8)
-- One STOCK line at position 1 (when picked) + manual lines after it. Quotation holds nothing; Reserve / Memo Out
-- move the slice into `reserved` when APPROVED (recomputed below).
CREATE FUNCTION pg_temp.customer_doc(p_dtype text, p_n int, p_table text, p_line_table text, p_fk text, p_salt int, p_stock_share float8,
                                    p_slot int, p_slots int, p_cancel bool) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n_item int := (SELECT count(*) FROM seed_item);
BEGIN
  PERFORM pg_temp.gen_headers(p_dtype, p_n, p_salt, p_cancel, 'customer');
  -- `kind` = STOCK marks documents that carry one From Stock line; `src` = its item, `slot` = its slice.
  UPDATE seed_hdr h SET kind = 'STOCK', src = 1 + (x.q - 1) % n_item, slot = p_slot + ((x.q - 1) / n_item) % p_slots
  FROM (SELECT idx, row_number() OVER (ORDER BY idx)::int q FROM seed_hdr WHERE dtype = p_dtype AND pg_temp.rnd(idx, p_salt + 50) < p_stock_share) x
  WHERE h.dtype = p_dtype AND h.idx = x.idx AND n_item > 0;
  PERFORM pg_temp.finish_headers(p_dtype);
  PERFORM pg_temp.insert_headers(p_dtype, p_table, 'customer');
  INSERT INTO seed_line (doc_id, pos, id, source, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no, item_note,
                         pcs, w, pu, up, ms_id, stock_id, sp_pcs, sp_w)
  SELECT h.id, 1, uuidv7(), 'STOCK', i.stone, i.shape, i.size, i.color, i.clarity, i.cutting, i.quality, i.lot, 'Memo', i.cer_type, i.cer_no, '',
         i.a, i.ws, i.pu, round(i.up * 1.3, 2), i.ms_id, i.stock_id, (10 - h.slot) * i.a, (10 - h.slot) * i.ws
  FROM seed_hdr h JOIN seed_item i ON i.item_no = h.src WHERE h.dtype = p_dtype AND h.kind = 'STOCK';
  -- Manual lines for every document (after the stock line when there is one): even pcs/weight so a return can take half.
  PERFORM pg_temp.manual_lines(p_dtype, p_salt + 10, 1, 2, false);
  UPDATE seed_line l SET pos = l.pos + 1
  FROM seed_hdr h WHERE l.source = 'MANUAL' AND h.dtype = p_dtype AND h.id = l.doc_id AND h.kind = 'STOCK';
  PERFORM pg_temp.price_lines();
  EXECUTE format($sql$
    INSERT INTO partner.%I (id, %I, position, source, stone_code_id, stone_code_snapshot, stone, shape, size, color, clarity, cutting, quality,
      lot, location, cer_type, cer_no, pcs, weight_ct, price_unit, unit_price, amount, item_note, memo_stock_id, stock_id, stock_pending_pcs,
      stock_pending_weight_ct)
    SELECT id, doc_id, pos, source, sc_id, coalesce(sc_code, ''), stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no,
      pcs, w, pu, up, amt, item_note, ms_id, stock_id, sp_pcs, sp_w FROM seed_line$sql$, p_line_table, p_fk);
  EXECUTE format('ANALYZE partner.%I', p_line_table);
END $$;
SELECT pg_temp.customer_doc('reserve', :n_doc, 'reserve', 'reserve_line', 'reserve_id', 400, 0.4, 2, 2, false);
TRUNCATE seed_line;
\echo 'master: reserve done'
SELECT pg_temp.customer_doc('memo-out', :n_doc, 'memo_out', 'memo_out_line', 'memo_out_id', 500, 0.4, 4, 2, false);
-- Keep the memo-out lines for Memo Out Return.
CREATE TEMP TABLE seed_mo_line AS SELECT * FROM seed_line;
CREATE INDEX ON seed_mo_line (doc_id);
TRUNCATE seed_line;
CREATE TEMP TABLE seed_amo AS
SELECT row_number() OVER (ORDER BY h.idx)::int AS amo_no, h.id, h.party, h.currency, h.doc_date
FROM seed_hdr h WHERE h.dtype = 'memo-out' AND h.status = 'APPROVED' AND h.del_at IS NULL;
CREATE UNIQUE INDEX ON seed_amo (amo_no);
ANALYZE partner.memo_out_line; ANALYZE seed_mo_line; ANALYZE seed_amo;
\echo 'master: memo out done'
SELECT pg_temp.customer_doc('quotation', :n_doc, 'quotation', 'quotation_line', 'quotation_id', 800, 0.25, 8, 1, true);
TRUNCATE seed_line;
\echo 'master: quotation done'

-- ================================================================ 6. MEMO OUT RETURN (returns half of each line of one approved memo out)
SELECT pg_temp.gen_headers('memo-out-return', :n_doc, 600, false, 'customer');
UPDATE seed_hdr h SET src = 1 + (h.idx - 1) % (SELECT count(*)::int FROM seed_amo), slot = ((h.idx - 1) / (SELECT count(*)::int FROM seed_amo)) % 2
WHERE h.dtype = 'memo-out-return';
UPDATE seed_hdr h SET party = a.party, currency = a.currency, doc_date = greatest(h.doc_date, a.doc_date)
FROM seed_amo a WHERE h.dtype = 'memo-out-return' AND a.amo_no = h.src;
SELECT pg_temp.finish_headers('memo-out-return');
SELECT pg_temp.insert_headers('memo-out-return', 'memo_out_return', 'customer');
INSERT INTO seed_line (doc_id, pos, id, source, sc_id, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no,
                       item_note, pcs, w, pu, up, mol_id, out_pcs, out_w)
SELECT h.id, m.pos, uuidv7(), m.source, m.sc_id, m.sc_code, m.stone, m.shape, m.size, m.color, m.clarity, m.cutting, m.quality, m.lot, m.loc,
       m.cer_type, m.cer_no, '', m.pcs / 2, m.w / 2, m.pu, m.up, m.id, m.pcs - h.slot * (m.pcs / 2), m.w - h.slot * (m.w / 2)
FROM seed_hdr h JOIN seed_amo a ON a.amo_no = h.src JOIN seed_mo_line m ON m.doc_id = a.id AND m.pos <= pg_temp.nl('memo-out-return', h.idx, 610)
WHERE h.dtype = 'memo-out-return';
SELECT pg_temp.price_lines();
INSERT INTO partner.memo_out_return_line (id, memo_out_return_id, position, source, stone_code_id, stone_code_snapshot, stone, shape, size, color,
  clarity, cutting, quality, lot, location, cer_type, cer_no, pcs, weight_ct, price_unit, unit_price, amount, item_note, outstanding_pcs,
  outstanding_weight_ct, memo_out_line_id)
SELECT id, doc_id, pos, source, sc_id, coalesce(sc_code, ''), stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no,
       pcs, w, pu, up, amt, item_note, out_pcs, out_w, mol_id
FROM seed_line;
ANALYZE partner.memo_out_return_line;
TRUNCATE seed_line;
\echo 'master: memo out return done'

-- ================================================================ 7. PURCHASE (vendor): 30% Memo Stock (IN_STOCK slice 6/7), 40% from PO, 30% manual
SELECT pg_temp.gen_headers('purchase', :n_doc, 700, false, 'vendor');
UPDATE seed_hdr SET kind = CASE WHEN pg_temp.rnd(idx, 750) < 0.3 THEN 'STOCK' WHEN pg_temp.rnd(idx, 750) < 0.7 THEN 'PO' ELSE 'MANUAL' END
WHERE dtype = 'purchase';
ANALYZE seed_hdr;
UPDATE seed_hdr h SET src = 1 + (x.q - 1) % (SELECT count(*)::int FROM seed_ar), slot = 6 + ((x.q - 1) / (SELECT count(*)::int FROM seed_ar)) % 2
FROM (SELECT idx, row_number() OVER (ORDER BY idx)::int q FROM seed_hdr WHERE dtype = 'purchase' AND kind = 'STOCK') x
WHERE h.dtype = 'purchase' AND h.idx = x.idx;
UPDATE seed_hdr h SET party = a.party, currency = a.currency, doc_date = greatest(h.doc_date, a.doc_date)
FROM seed_ar a WHERE h.dtype = 'purchase' AND h.kind = 'STOCK' AND a.ar_no = h.src;
UPDATE seed_hdr h SET src = 1 + (x.q - 1) % (SELECT count(*)::int FROM seed_apo), slot = ((x.q - 1) / (SELECT count(*)::int FROM seed_apo)) % 2
FROM (SELECT idx, row_number() OVER (ORDER BY idx)::int q FROM seed_hdr WHERE dtype = 'purchase' AND kind = 'PO') x
WHERE h.dtype = 'purchase' AND h.idx = x.idx;
UPDATE seed_hdr h SET party = a.party, currency = a.currency, doc_date = greatest(h.doc_date, a.doc_date)
FROM seed_apo a WHERE h.dtype = 'purchase' AND h.kind = 'PO' AND a.apo_no = h.src;
SELECT pg_temp.finish_headers('purchase');
SELECT pg_temp.insert_headers('purchase', 'purchase', 'vendor');
-- STOCK lines: one IN_STOCK slice of every item of the receive.
INSERT INTO seed_line (doc_id, pos, id, source, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no, item_note,
                       pcs, w, pu, up, ms_id, stock_id, memo_group)
SELECT h.id, i.pos, uuidv7(), 'STOCK', i.stone, i.shape, i.size, i.color, i.clarity, i.cutting, i.quality, i.lot, 'Memo', i.cer_type, i.cer_no, '',
       i.a, i.ws, i.pu, i.up, i.ms_id, i.stock_id, 'IN_STOCK'
FROM seed_hdr h JOIN seed_item i ON i.ar_no = h.src WHERE h.dtype = 'purchase' AND h.kind = 'STOCK' AND i.pos <= pg_temp.nl('purchase', h.idx, 710);
-- PO lines: half of every line of the approved PO (two purchases at most per PO).
INSERT INTO seed_line (doc_id, pos, id, source, sc_id, sc_code, stone, shape, size, color, clarity, cutting, quality, lot, loc, cer_type, cer_no,
                       item_note, pcs, w, pu, up, po_line_id)
SELECT h.id, p.pos, uuidv7(), 'PURCHASE_ORDER', p.sc_id, p.sc_code, p.stone, p.shape, p.size, p.color, p.clarity, p.cutting, p.quality, p.lot,
       p.loc, p.cer_type, p.cer_no, '', p.pcs / 2, p.w / 2, p.pu, p.up, p.id
FROM seed_hdr h JOIN seed_apo a ON a.apo_no = h.src JOIN seed_po_line p ON p.doc_id = a.id AND p.pos <= pg_temp.nl('purchase', h.idx, 710)
WHERE h.dtype = 'purchase' AND h.kind = 'PO';
-- Manual lines: multiples of 4 so a load can take quarters.
SELECT pg_temp.manual_lines('purchase', 760, 1, 4, true);
SELECT pg_temp.price_lines();
INSERT INTO partner.purchase_line (id, purchase_id, position, source, memo_stock_id, memo_group, purchase_order_line_id, stock_id, stone_code_id,
  stone_code_snapshot, stone, shape, size, color, clarity, cutting, quality, lot, location, cer_type, cer_no, pcs, weight_ct, price_unit,
  unit_price, amount, item_note)
SELECT id, doc_id, pos, source, ms_id, memo_group, po_line_id, stock_id, sc_id, coalesce(sc_code, ''), stone, shape, size, color, clarity, cutting,
       quality, lot, loc, cer_type, cer_no, pcs, w, pu, up, amt, item_note
FROM seed_line;
ANALYZE partner.purchase_line;
TRUNCATE seed_line;
\echo 'master: purchase done'

-- ================================================================ effects of APPROVED documents
-- Fresh statistics: the tables may still carry stats of an earlier (smaller) seed, which leads to row-by-row plans.
ANALYZE partner.memo_return_line, partner.reserve_line, partner.memo_out_line, partner.memo_out_return_line, partner.purchase_line,
        partner.purchase_order_line, partner.quotation_line, partner.memo_stock, partner.memo_return, partner.reserve, partner.memo_out,
        partner.memo_out_return, partner.purchase, partner.purchase_order, partner.quotation;
-- Memo Stock buckets: returned (Memo Return), reserved (Reserve + Memo Out − Memo Out Return), sold = purchased (Purchase IN_STOCK).
WITH ret AS (
  SELECT l.memo_stock_id id, sum(l.pcs) p, sum(l.weight_ct) w FROM partner.memo_return_line l
  JOIN partner.memo_return h ON h.id = l.memo_return_id
  WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL GROUP BY 1
), res AS (
  SELECT id, sum(p) p, sum(w) w FROM (
    SELECT l.memo_stock_id id, l.pcs p, l.weight_ct w FROM partner.reserve_line l JOIN partner.reserve h ON h.id = l.reserve_id
    WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL AND l.memo_stock_id IS NOT NULL
    UNION ALL
    SELECT l.memo_stock_id, l.pcs, l.weight_ct FROM partner.memo_out_line l JOIN partner.memo_out h ON h.id = l.memo_out_id
    WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL AND l.memo_stock_id IS NOT NULL
    UNION ALL
    SELECT m.memo_stock_id, -r.pcs, -r.weight_ct FROM partner.memo_out_return_line r
    JOIN partner.memo_out_return h ON h.id = r.memo_out_return_id
    JOIN partner.memo_out_line m ON m.id = r.memo_out_line_id
    WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL AND m.memo_stock_id IS NOT NULL
  ) u GROUP BY id
), sold AS (
  SELECT l.memo_stock_id id, sum(l.pcs) p, sum(l.weight_ct) w FROM partner.purchase_line l JOIN partner.purchase h ON h.id = l.purchase_id
  WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL AND l.source = 'STOCK' GROUP BY 1
)
UPDATE partner.memo_stock s SET
  returned_pcs = coalesce(ret.p, 0), returned_weight_ct = coalesce(ret.w, 0),
  reserved_pcs = coalesce(res.p, 0), reserved_weight_ct = coalesce(res.w, 0),
  sold_pcs = coalesce(sold.p, 0), sold_weight_ct = coalesce(sold.w, 0),
  purchased_pcs = coalesce(sold.p, 0), purchased_weight_ct = coalesce(sold.w, 0),
  pending_pcs = s.received_pcs - coalesce(ret.p, 0) - coalesce(res.p, 0) - coalesce(sold.p, 0),
  pending_weight_ct = s.received_weight_ct - coalesce(ret.w, 0) - coalesce(res.w, 0) - coalesce(sold.w, 0)
FROM partner.memo_stock s2
LEFT JOIN ret ON ret.id = s2.id LEFT JOIN res ON res.id = s2.id LEFT JOIN sold ON sold.id = s2.id
WHERE s.id = s2.id AND s.created_by = 'seed-mock';

-- Memo Out lines: returned by approved Memo Out Returns.
UPDATE partner.memo_out_line m SET returned_pcs = r.p, returned_weight_ct = r.w
FROM (SELECT r.memo_out_line_id id, sum(r.pcs) p, sum(r.weight_ct) w FROM partner.memo_out_return_line r
      JOIN partner.memo_out_return h ON h.id = r.memo_out_return_id
      WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL GROUP BY 1) r
WHERE m.id = r.id;

-- PO lines: purchased by approved Purchases (Purchase Outstanding = ordered − purchased).
UPDATE partner.purchase_order_line o SET purchased_pcs = r.p, purchased_weight_ct = r.w
FROM (SELECT l.purchase_order_line_id id, sum(l.pcs) p, sum(l.weight_ct) w FROM partner.purchase_line l JOIN partner.purchase h ON h.id = l.purchase_id
      WHERE h.created_by = 'seed-mock' AND h.status = 'APPROVED' AND h.deleted_at IS NULL AND l.source = 'PURCHASE_ORDER' GROUP BY 1) r
WHERE o.id = r.id;

-- Header totals.
SELECT pg_temp.fill_totals('memo_receive', 'memo_receive_line', 'memo_receive_id');
SELECT pg_temp.fill_totals('purchase_order', 'purchase_order_line', 'purchase_order_id');
SELECT pg_temp.fill_totals('memo_return', 'memo_return_line', 'memo_return_id');
SELECT pg_temp.fill_totals('reserve', 'reserve_line', 'reserve_id');
SELECT pg_temp.fill_totals('memo_out', 'memo_out_line', 'memo_out_id');
SELECT pg_temp.fill_totals('memo_out_return', 'memo_out_return_line', 'memo_out_return_id');
SELECT pg_temp.fill_totals('purchase', 'purchase_line', 'purchase_id');
SELECT pg_temp.fill_totals('quotation', 'quotation_line', 'quotation_id');

COMMIT;
\o
\pset tuples_only off
\echo 'master: done'
SELECT 'customer' AS "table", count(*) AS mock_rows FROM partner.customer WHERE created_by = 'seed-mock'
UNION ALL SELECT 'vendor', count(*) FROM partner.vendor WHERE created_by = 'seed-mock'
UNION ALL SELECT 'currency', count(*) FROM partner.currency WHERE created_by = 'seed-mock'
UNION ALL SELECT 'location', count(*) FROM partner.location WHERE created_by = 'seed-mock'
UNION ALL SELECT 'stone_code', count(*) FROM stone.stone_code WHERE created_by = 'seed-mock'
UNION ALL SELECT 'quotation', count(*) FROM partner.quotation WHERE created_by = 'seed-mock'
UNION ALL SELECT 'reserve', count(*) FROM partner.reserve WHERE created_by = 'seed-mock'
UNION ALL SELECT 'memo_receive', count(*) FROM partner.memo_receive WHERE created_by = 'seed-mock'
UNION ALL SELECT 'memo_return', count(*) FROM partner.memo_return WHERE created_by = 'seed-mock'
UNION ALL SELECT 'memo_out', count(*) FROM partner.memo_out WHERE created_by = 'seed-mock'
UNION ALL SELECT 'memo_out_return', count(*) FROM partner.memo_out_return WHERE created_by = 'seed-mock'
UNION ALL SELECT 'purchase_order', count(*) FROM partner.purchase_order WHERE created_by = 'seed-mock'
UNION ALL SELECT 'purchase', count(*) FROM partner.purchase WHERE created_by = 'seed-mock'
UNION ALL SELECT 'memo_stock', count(*) FROM partner.memo_stock WHERE created_by = 'seed-mock';
