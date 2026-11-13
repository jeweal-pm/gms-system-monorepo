-- ADR-0051 (owner 2026-11-13, amends ADR-0042 SA-PU-10): Purchase MANUAL / PURCHASE_ORDER lines carry no Stock ID until
-- Load to Stock issues one; only STOCK lines keep their Memo Stock item's Stock ID.
-- - stock_id becomes nullable and the Stock IDs already issued to MANUAL / PURCHASE_ORDER lines are cleared (Q-PU-36).
--   memo_stock_id_counter is NOT rewound, so the cleared numbers are never issued again.
-- - CHECK purchase_line_stock_id_source_check: a line has a Stock ID exactly when it is a STOCK line.
-- - The partial unique index purchase_line_issued_stock_id_key is dropped: no issued ids remain on purchase lines.
-- Rollback (restores the rows' shape, not the cleared numbers): issue new ids from memo_stock_id_counter for every
-- purchase_line with stock_id IS NULL (the issueStockIds pattern, one counter update per year), then
--   ALTER TABLE "partner"."purchase_line" DROP CONSTRAINT "purchase_line_stock_id_source_check";
--   ALTER TABLE "partner"."purchase_line" ALTER COLUMN "stock_id" SET NOT NULL;
--   CREATE UNIQUE INDEX "purchase_line_issued_stock_id_key" ON "partner"."purchase_line"("stock_id") WHERE ("source" <> 'STOCK');

DROP INDEX "partner"."purchase_line_issued_stock_id_key";

ALTER TABLE "partner"."purchase_line" ALTER COLUMN "stock_id" DROP NOT NULL;

UPDATE "partner"."purchase_line" SET "stock_id" = NULL WHERE "source" <> 'STOCK' AND "stock_id" IS NOT NULL;

ALTER TABLE "partner"."purchase_line"
  ADD CONSTRAINT "purchase_line_stock_id_source_check" CHECK (("source" = 'STOCK') = ("stock_id" IS NOT NULL));
