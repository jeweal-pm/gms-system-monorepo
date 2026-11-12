-- ADR-0048 (owner 2026-11-11): line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase.
-- Expand only: 5 new tables in schema partner, shaped like purchase_order_line_photo; no existing row changes.
-- Rollback: DROP the five *_line_photo tables. Photo bytes and stored_files rows stay (ADR-0030).

-- CreateTable
CREATE TABLE "partner"."reserve_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "reserve_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "reserve_line_photo_file_idx" ON "partner"."reserve_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."reserve_line_photo" ADD CONSTRAINT "reserve_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."reserve_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."reserve_line_photo" ADD CONSTRAINT "reserve_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner"."reserve_line_photo"
  ADD CONSTRAINT "reserve_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);

-- CreateTable
CREATE TABLE "partner"."memo_return_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "memo_return_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "memo_return_line_photo_file_idx" ON "partner"."memo_return_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_return_line_photo" ADD CONSTRAINT "memo_return_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_return_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_return_line_photo" ADD CONSTRAINT "memo_return_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner"."memo_return_line_photo"
  ADD CONSTRAINT "memo_return_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);

-- CreateTable
CREATE TABLE "partner"."memo_out_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "memo_out_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "memo_out_line_photo_file_idx" ON "partner"."memo_out_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_out_line_photo" ADD CONSTRAINT "memo_out_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_out_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_line_photo" ADD CONSTRAINT "memo_out_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner"."memo_out_line_photo"
  ADD CONSTRAINT "memo_out_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);

-- CreateTable
CREATE TABLE "partner"."memo_out_return_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "memo_out_return_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "memo_out_return_line_photo_file_idx" ON "partner"."memo_out_return_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return_line_photo" ADD CONSTRAINT "memo_out_return_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_out_return_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_out_return_line_photo" ADD CONSTRAINT "memo_out_return_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner"."memo_out_return_line_photo"
  ADD CONSTRAINT "memo_out_return_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);

-- CreateTable
CREATE TABLE "partner"."purchase_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "purchase_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "purchase_line_photo_file_idx" ON "partner"."purchase_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."purchase_line_photo" ADD CONSTRAINT "purchase_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."purchase_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."purchase_line_photo" ADD CONSTRAINT "purchase_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "partner"."purchase_line_photo"
  ADD CONSTRAINT "purchase_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);
