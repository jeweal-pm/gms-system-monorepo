import type { Tx } from "../common/persistence";
import { Prisma } from "../generated/prisma/client";

/**
 * sale-own-stock follow-up (owner 2026-11-24, option 2): a document line may REFERENCE the photos of the Memo Receive line behind
 * the Memo Stock it picked (no copy). Security rule: a memo-receive photo file is accepted on a line ONLY when it is a photo of
 * the memo receive line of the Memo Stock the line names (`memoStockId`, or any stock of its `lotKey`); any other file id sent
 * by the client is refused, whatever its source. The document's own uploads keep working unchanged.
 */
export const MEMO_RECEIVE_PHOTO_FILE_SOURCE = "memo_receive.line-photo";

export type PhotoLine = { photoIds: readonly string[]; memoStockId?: string | null; lotKey?: string | null };

/** `memoStockId` / `lotKey` of a Memo Stock line (`M…` lot keys only); an own-stock or manual line references nothing. */
const memoRef = (line: PhotoLine) => ({ memoStockId: line.memoStockId ?? null, lotKey: line.lotKey && line.lotKey.startsWith("M") ? line.lotKey : null });

/**
 * The first bad photo of the lines as `{ line, position }`, or null when every id is a ready file of `ownSource` or a referenced
 * photo of the line's own Memo Stock. At most 2 statements for any number of lines (files by id, then the reference check).
 */
export async function findInvalidPhoto(tx: Tx, ownSource: string, lines: readonly PhotoLine[]): Promise<{ line: number; position: number } | null> {
  const ids = [...new Set(lines.flatMap((line) => line.photoIds))];
  if (ids.length === 0) return null;
  const files = await tx.storedFile.findMany({ where: { id: { in: ids }, sourceType: { in: [ownSource, MEMO_RECEIVE_PHOTO_FILE_SOURCE] }, status: "ready" }, select: { id: true, sourceType: true } });
  const kind = new Map(files.map((file) => [file.id, file.sourceType]));
  const pairs: { index: number; fileId: string; memoStockId: string | null; lotKey: string | null }[] = [];
  let bad: { line: number; position: number } | null = null;
  lines.forEach((line, index) => {
    line.photoIds.forEach((fileId, position) => {
      const source = kind.get(fileId);
      if (!source) {
        bad ??= { line: index, position };
        return;
      }
      if (source === MEMO_RECEIVE_PHOTO_FILE_SOURCE) pairs.push({ index, fileId, ...memoRef(line) });
    });
  });
  if (bad) return bad;
  if (pairs.length === 0) return null;
  const values = pairs.map((pair) => Prisma.sql`(${pair.index}::int, ${pair.fileId}::uuid, ${pair.memoStockId}::uuid, ${pair.lotKey}::varchar)`);
  const ok = await tx.$queryRaw<{ idx: number; file_id: string }[]>(Prisma.sql`
    SELECT v.idx, v.file_id::text AS file_id FROM (VALUES ${Prisma.join(values)}) AS v(idx, file_id, ms, lk)
    WHERE EXISTS (
      SELECT 1 FROM "partner"."memo_receive_line_photo" p JOIN "partner"."memo_stock" s ON s."memo_receive_line_id" = p."line_id"
      WHERE p."file_id" = v.file_id AND ((v.ms IS NOT NULL AND s."id" = v.ms) OR (v.lk IS NOT NULL AND s."lot_key" = v.lk)))`);
  const good = new Set(ok.map((row) => `${row.idx}|${row.file_id}`));
  const missing = pairs.find((pair) => !good.has(`${pair.index}|${pair.fileId}`));
  if (!missing) return null;
  return { line: missing.index, position: lines[missing.index].photoIds.indexOf(missing.fileId) };
}
