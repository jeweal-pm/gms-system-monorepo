-- stock-value SA rev 1 / ADR-0057 (BE-SV-001). Additive only; no data is rewritten except the generated columns.
--   * stock.item_key / sale_line.item_key: STORED GENERATED identity of a stone = the item part of stock.card_key (stone code,
--     or the seven stone attributes when the code is empty; trimmed, case-insensitive), WITHOUT location and lot. Written by
--     PostgreSQL only. Plain `||` on NOT NULL DEFAULT '' varchars keeps the expression immutable. `card_key` equal implies
--     `item_key` equal. The Stock Value report probes the latest Sale line of a stone through sale_line_item_key_idx.
-- Rollback: prisma/rollback/20261123110000_stock_value.down.sql (only the Stock Value report reads these objects).
ALTER TABLE "inventory"."stock" ADD COLUMN "item_key" VARCHAR(34) GENERATED ALWAYS AS (
  'SI' || md5(
    upper(btrim(CASE WHEN "stone_code" <> '' THEN "stone_code"
      ELSE "stone" || chr(31) || "shape" || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality" END)))
) STORED;

ALTER TABLE "inventory"."sale_line" ADD COLUMN "item_key" VARCHAR(34) GENERATED ALWAYS AS (
  'SI' || md5(
    upper(btrim(CASE WHEN "stone_code" <> '' THEN "stone_code"
      ELSE "stone" || chr(31) || "shape" || chr(31) || "size" || chr(31) || "color" || chr(31) || "clarity" || chr(31) || "cutting" || chr(31) || "quality" END)))
) STORED;

CREATE INDEX "sale_line_item_key_idx" ON "inventory"."sale_line" ("item_key");
-- Grants: unchanged (the app role already has SELECT on both tables; the migrator owns the DDL).
