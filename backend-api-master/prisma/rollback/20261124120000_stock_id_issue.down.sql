-- Rollback of 20261124120000_stock_id_issue (ADR-0060 D6). Refuses once a Stock ID was issued through it: issued ids are
-- recorded forever (never reused), so the table is forward-fix only after first use.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "partner"."stock_id_issue") THEN RAISE EXCEPTION 'stock_id_issue rollback refused: Stock IDs were issued through it'; END IF;
END $$;
DROP TABLE "partner"."stock_id_issue";
-- Then: DELETE FROM "partner"."_prisma_migrations" WHERE migration_name = '20261124120000_stock_id_issue';
