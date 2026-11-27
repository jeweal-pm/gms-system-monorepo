-- Rollback of 20261124100000_sale_line_ref_photo: only the references are lost (the files belong to Memo Receive).
-- Afterwards: DELETE FROM "inventory"."_prisma_migrations" WHERE migration_name = '20261124100000_sale_line_ref_photo';
DROP TABLE "inventory"."sale_line_ref_photo";
