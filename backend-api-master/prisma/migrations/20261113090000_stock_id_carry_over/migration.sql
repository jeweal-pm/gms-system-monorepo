-- INV-20261029-002 / owner Q-MR-09 (2026-11-13): "ถ้าเลขมันถึง 269999 ให้ขึ้นเป็น 270000 เลย".
-- The Stock ID running number no longer stops at 9,999 per year: it carries into the next prefix
-- (Stock ID = year * 10000 + last_no, at least 6 digits). Constraint relax only; no column, index or row change.
-- Rollback (only while no Stock ID above 9,999 in its year exists): restore the three CHECKs of
-- 20261029090000_memo_receive ('^[0-9]{6}$' on memo_receive_line / memo_stock, last_no BETWEEN 0 AND 9999).

ALTER TABLE "partner"."memo_stock_id_counter"
  DROP CONSTRAINT "memo_stock_id_counter_values_check",
  ADD CONSTRAINT "memo_stock_id_counter_values_check" CHECK ("year" BETWEEN 0 AND 99 AND "last_no" BETWEEN 0 AND 2000000000);

ALTER TABLE "partner"."memo_receive_line"
  DROP CONSTRAINT "memo_receive_line_stock_id_check",
  ADD CONSTRAINT "memo_receive_line_stock_id_check" CHECK ("stock_id" ~ '^[0-9]{6,10}$');

ALTER TABLE "partner"."memo_stock"
  DROP CONSTRAINT "memo_stock_stock_id_check",
  ADD CONSTRAINT "memo_stock_stock_id_check" CHECK ("stock_id" ~ '^[0-9]{6,10}$');
