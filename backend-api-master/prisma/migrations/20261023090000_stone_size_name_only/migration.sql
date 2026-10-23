-- stone-master SA-SM-04 revision (owner 2026-10-23, "หน้า size มีเเค่ name อย่างเดียว ในหน้า stone code ก็นำ name ไปใช้เเทน"):
-- Size keeps only Name. The code column and its unique index are dropped; Name becomes unique and is what
-- an Auto stone code uses for the size part. Saved stone codes are snapshots (Q-SM-05) and are not rebuilt.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "stone"."stone_size" GROUP BY "name" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'stone_size has duplicate names; rename them before applying 20261023090000_stone_size_name_only';
  END IF;
END $$;

DROP INDEX "stone"."stone_size_code_key";

ALTER TABLE "stone"."stone_size" DROP COLUMN "code";

CREATE UNIQUE INDEX "stone_size_name_key" ON "stone"."stone_size"("name");
