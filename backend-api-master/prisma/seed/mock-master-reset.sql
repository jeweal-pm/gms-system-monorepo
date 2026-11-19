-- DEV-ONLY: removes the rows written by mock-master.sql (created_by = 'seed-mock'). Run the inventory reset first:
-- Load to Stock allocations hold Purchase lines (FK RESTRICT). Kept on purpose: company profile, Document Setup /
-- numbering rows and the Stock ID counter (Stock IDs are never reused).
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
SET LOCAL statement_timeout = 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM partner.load_allocation_line a JOIN partner.purchase_line l ON l.id = a.purchase_line_id
             JOIN partner.purchase p ON p.id = l.purchase_id WHERE p.created_by = 'seed-mock') THEN
    RAISE EXCEPTION 'Load to Stock still holds mock purchase lines - reset the inventory mock data first (node docker/seed-mock.cjs inventory --reset)';
  END IF;
END $$;

-- Documents (children cascade); order follows the RESTRICT references between them.
DELETE FROM partner.quotation WHERE created_by = 'seed-mock';
DELETE FROM partner.reserve WHERE created_by = 'seed-mock';
DELETE FROM partner.memo_out_return WHERE created_by = 'seed-mock';
DELETE FROM partner.memo_out WHERE created_by = 'seed-mock';
DELETE FROM partner.purchase WHERE created_by = 'seed-mock';
DELETE FROM partner.purchase_order WHERE created_by = 'seed-mock';
DELETE FROM partner.memo_return WHERE created_by = 'seed-mock';
DELETE FROM partner.memo_stock WHERE created_by = 'seed-mock';
DELETE FROM partner.memo_receive WHERE created_by = 'seed-mock';

-- Master data.
DELETE FROM stone.stone_code WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_name WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_shape WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_size WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_group WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_color WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_cutting WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_clarity WHERE created_by = 'seed-mock';
DELETE FROM stone.stone_quality WHERE created_by = 'seed-mock';
DELETE FROM partner.customer WHERE created_by = 'seed-mock';
DELETE FROM partner.vendor WHERE created_by = 'seed-mock';
DELETE FROM partner.location WHERE created_by = 'seed-mock';
DELETE FROM partner.currency WHERE created_by = 'seed-mock' AND code NOT IN (SELECT currency_code FROM partner.company_profile);

COMMIT;
\echo 'master: mock data removed'
