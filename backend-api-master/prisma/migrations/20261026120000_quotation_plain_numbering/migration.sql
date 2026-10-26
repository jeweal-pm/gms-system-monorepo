-- quotation SA-QT-04 amendment (owner 2026-10-26, "ถ้าใน document setup ไม่ได้ set อะไรไว้ เลขรันนิ่งขอเป็น 1 2 3 ธรรมดาเลย"):
-- with no Document Setup row in effect, a quotation gets a plain running number (1, 2, 3 …) and no numbering row.
-- Rollback: only possible while no quotation has a NULL numbering_id.
ALTER TABLE "partner"."quotation" ALTER COLUMN "numbering_id" DROP NOT NULL;

CREATE UNIQUE INDEX "quotation_plain_running_no_key" ON "partner"."quotation"("running_no") WHERE ("numbering_id" IS NULL);
