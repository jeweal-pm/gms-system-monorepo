-- stock-card SA rev 1 / ADR-0056 (BE-SC-001). Additive only; no data is rewritten except the generated column on `stock`.
--   * stock.card_key: STORED GENERATED identity of a Stock Card = (stone code, location, lot), trimmed and case-insensitive;
--     when the stone code is empty the seven stone attributes stand in for it. Written by PostgreSQL only. It is NOT the
--     ADR-0055 lot_key. Plain `||` on NOT NULL DEFAULT '' varchars keeps the expression immutable.
--   * stock_hold_document.doc_date / party_id / party_name: document date and account (customer) of a hold document, sent by
--     api-master (additive, optional) and backfilled by master's `stock-card:backfill` script. No cross-service FK.
-- Rollback: prisma/rollback/20261123090000_stock_card.down.sql (the report is read-only; nothing but the report reads these).
ALTER TABLE "inventory"."stock" ADD COLUMN "card_key" VARCHAR(34) GENERATED ALWAYS AS (
  'SC' || md5(
    upper(btrim(CASE WHEN "stone_code" <> '' THEN "stone_code"
      ELSE "stone" || chr(31) || "shape" || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality" END))
    || chr(31) || upper(btrim("location")) || chr(31) || upper(btrim("lot")))
) STORED;
CREATE INDEX "stock_card_key_idx" ON "inventory"."stock" ("card_key");

ALTER TABLE "inventory"."stock_hold_document"
  ADD COLUMN "doc_date" DATE,
  ADD COLUMN "party_id" UUID,
  ADD COLUMN "party_name" VARCHAR(200) NOT NULL DEFAULT '',
  ADD CONSTRAINT "stock_hold_document_party_name_check" CHECK (char_length("party_name") <= 200);
-- Grants: unchanged (the app role already has DML on stock_hold_document through the migrator's default privileges;
-- stock_movement stays INSERT / SELECT only).
