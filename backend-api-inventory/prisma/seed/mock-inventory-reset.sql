-- DEV-ONLY: removes the Load to Stock mock data (created_by = 'seed-mock') and gives the purchase quantities back on the
-- master side (load_allocation*, load_stock_id, purchase_line.loaded_*). Stock IDs stay retired (counter untouched).
-- Fails if a real document holds one of the mock stocks (stock_hold FK RESTRICT) — release it first.
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
SET LOCAL statement_timeout = 0;

CREATE TEMP TABLE seed_reset_load ON COMMIT DROP AS SELECT id FROM inventory.load_to_stock WHERE created_by = 'seed-mock';
CREATE UNIQUE INDEX ON seed_reset_load (id);

UPDATE partner.purchase_line l SET loaded_pcs = l.loaded_pcs - x.p, loaded_weight_ct = l.loaded_weight_ct - x.w
FROM (SELECT a.purchase_line_id id, sum(a.pcs) p, sum(a.weight_ct) w FROM partner.load_allocation_line a
      JOIN seed_reset_load r ON r.id = a.load_document_id GROUP BY 1) x
WHERE l.id = x.id;
DELETE FROM partner.load_stock_id s USING seed_reset_load r WHERE s.load_document_id = r.id;
DELETE FROM partner.load_allocation a USING seed_reset_load r WHERE a.load_document_id = r.id;

DELETE FROM inventory.stock_movement m USING inventory.stock s, seed_reset_load r WHERE m.stock_uuid = s.id AND s.load_id = r.id;
DELETE FROM inventory.stock_photo p USING inventory.stock s, seed_reset_load r WHERE p.stock_uuid = s.id AND s.load_id = r.id;
DELETE FROM inventory.stock s USING seed_reset_load r WHERE s.load_id = r.id;
DELETE FROM inventory.load_to_stock l USING seed_reset_load r WHERE l.id = r.id;

COMMIT;
\echo 'inventory: mock data removed'
