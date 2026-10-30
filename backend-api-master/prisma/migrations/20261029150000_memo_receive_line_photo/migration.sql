-- memo-receive SA revision 2 (SA-MR-14): up to 5 photos per Memo Receive line, the first is the main photo.
-- Additive. Rollback: DROP TABLE "partner"."memo_receive_line_photo" (photo bytes and stored_files rows stay, ADR-0030).

-- CreateTable
CREATE TABLE "partner"."memo_receive_line_photo" (
    "line_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "memo_receive_line_photo_pkey" PRIMARY KEY ("line_id","position")
);

-- CreateIndex
CREATE INDEX "memo_receive_line_photo_file_idx" ON "partner"."memo_receive_line_photo"("file_id");

-- AddForeignKey
ALTER TABLE "partner"."memo_receive_line_photo" ADD CONSTRAINT "memo_receive_line_photo_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "partner"."memo_receive_line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner"."memo_receive_line_photo" ADD CONSTRAINT "memo_receive_line_photo_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "partner"."stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value check (SA-MR-14).
ALTER TABLE "partner"."memo_receive_line_photo"
  ADD CONSTRAINT "memo_receive_line_photo_position_check" CHECK ("position" BETWEEN 1 AND 5);
