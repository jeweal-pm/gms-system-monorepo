-- Rollback of 20261123090000_stock_card (stock-card SA rev 1 database-diagram.md "Migration, backfill and rollback").
-- Run manually as gms_inventory_migrator after disabling the /stock-card routes. Only the Stock Card report reads these
-- objects, so no business data is lost. Deploy order is inventory -> master; roll master back FIRST (an older inventory
-- rejects docDate / party in the hold PUT body).
-- Afterwards remove the migration row: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261123090000_stock_card';
DROP INDEX "inventory"."stock_card_key_idx";
ALTER TABLE "inventory"."stock" DROP COLUMN "card_key";
ALTER TABLE "inventory"."stock_hold_document"
  DROP CONSTRAINT "stock_hold_document_party_name_check",
  DROP COLUMN "doc_date",
  DROP COLUMN "party_id",
  DROP COLUMN "party_name";
