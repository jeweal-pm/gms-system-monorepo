-- Rollback of 20261123110000_stock_value (stock-value SA rev 1 database-diagram.md "Migration, backfill and rollback").
-- Run manually as gms_inventory_migrator after removing the /stock-value route registration. Only the Stock Value report reads
-- these objects, so no business data is lost. The Stock Card migration is unaffected.
-- Afterwards remove the migration row: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261123110000_stock_value';
DROP INDEX "inventory"."sale_line_item_key_idx";
ALTER TABLE "inventory"."sale_line" DROP COLUMN "item_key";
ALTER TABLE "inventory"."stock" DROP COLUMN "item_key";
