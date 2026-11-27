-- merge-split SA rev 1 / ADR-0060 (merge-split) D7, SA-MS-07 (BE-MS-002), owner approval 2026-11-27. Merge/Split takes its Stock IDs
-- through the EXISTING per-document issue (`PUT /internal/v1/inventory/stock-id-issues/{documentType}/{documentId}`, table
-- partner.stock_id_issue from 20261124120000_stock_id_issue): same shared counter (`issueStockIds`), idempotent per
-- (document type, document id, revision = merge_split.apply_seq). No second issue table is created; this migration only adds the
-- document type 'merge-split' to the allow-list CHECK. Additive (a wider CHECK, no row rewritten).
-- Rollback: prisma/rollback/20261127100000_inventory_stock_id_issue.down.sql.
ALTER TABLE "partner"."stock_id_issue" DROP CONSTRAINT "stock_id_issue_type_check";
ALTER TABLE "partner"."stock_id_issue" ADD CONSTRAINT "stock_id_issue_type_check" CHECK ("document_type" IN ('stock-transfer-location', 'merge-split'));
