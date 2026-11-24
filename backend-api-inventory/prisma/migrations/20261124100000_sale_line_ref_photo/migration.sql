-- Owner 2026-11-24 (option 2): a Sale line taken From Stock (Memo Stock lot) REFERENCES the photos of its Memo Receive line; no copy.
-- `file_id` is a master stored file id (no FK across services); it is accepted only after master confirmed it belongs to the line's Memo Stock / lot,
-- and served only through the Sale photo route with master's internal check. Own uploads stay in sale_line_photo. Additive only.
-- Rollback: prisma/rollback/20261124100000_sale_line_ref_photo.down.sql.
CREATE TABLE "inventory"."sale_line_ref_photo" (
  "line_id" UUID NOT NULL,
  "position" SMALLINT NOT NULL,
  "file_id" UUID NOT NULL,
  CONSTRAINT "sale_line_ref_photo_pkey" PRIMARY KEY ("line_id", "position"),
  CONSTRAINT "sale_line_ref_photo_position_check" CHECK ("position" BETWEEN 0 AND 4),
  CONSTRAINT "sale_line_ref_photo_line_fkey" FOREIGN KEY ("line_id") REFERENCES "inventory"."sale_line" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "sale_line_ref_photo_file_idx" ON "inventory"."sale_line_ref_photo" ("file_id");
