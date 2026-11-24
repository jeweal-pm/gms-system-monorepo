import { Readable } from "node:stream";
import { buildKey, createStorage, uuidV7, type StorageDriver } from "@gms/storage";
import { AppError } from "../../platform/errors";
import type { MasterApi } from "../../platform/master-api";
import type { Db } from "../../platform/db";
import { PHOTO_MAX_BYTES, sizeGuard, sniffType, type Limiter } from "../load-to-stock/photos";
import { SALE_PHOTO_SOURCE } from "./repository";

/**
 * Sale line photos (ADR-0054 D9, ADR-0048 rules, ADR-0030; BE-SL-007): JPEG / PNG ≤ 5 MiB checked by signature, written
 * only under `files/sale/` through `@gms/storage` (the inventory storage root, shared key builder), metadata in
 * `inventory.stored_file` (`source_type` `sale-line`, owned by the Sale module). No delete API: removing a photo,
 * editing or deleting the Sale only unlinks it (`sale_line_photo`); bytes and metadata are kept. Transfers share the
 * process limiters of the Load to Stock photos (≤ 3 uploads, ≤ 6 downloads per process).
 */
export const SALE_PHOTO_MODULE = "sale";

export class SalePhotoService {
  private readonly storage: StorageDriver;

  constructor(private readonly db: Db, storageRoot: string, readonly writes: Limiter, readonly reads: Limiter) {
    this.storage = createStorage(storageRoot, { writePrefixes: [SALE_PHOTO_MODULE], readPrefixes: [SALE_PHOTO_MODULE] });
  }

  /**
   * `POST /sale/photos` (multipart `file`). The caller holds a `writes` slot from BEFORE the multipart body is parsed, so
   * at most 3 bodies are buffered per process. The type is sniffed from the first bytes; the file is streamed to storage.
   */
  async uploadHeld(actorId: string, file: File | null): Promise<{ id: string }> {
    if (!file || typeof file.stream !== "function") throw new AppError(400, "BAD_REQUEST");
    if (file.size === 0 || file.size > PHOTO_MAX_BYTES) throw new AppError(413, "PHOTO_TOO_LARGE");
    const type = sniffType(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (!type) throw new AppError(415, "PHOTO_TYPE_INVALID");
    const id = uuidV7();
    const key = buildKey({ module: SALE_PHOTO_MODULE, ext: type === "image/png" ? "png" : "jpg" });
    const body = Readable.fromWeb(file.stream() as unknown as import("node:stream/web").ReadableStream).pipe(sizeGuard(PHOTO_MAX_BYTES));
    const stored = await this.storage.putStream("files", key, body, { contentType: type, contentLength: file.size });
    await this.db.stored_file.create({ data: {
      id, bucket: "files", object_key: stored.key, filename: key.split("/").pop()!, content_type: type, size_bytes: BigInt(stored.size), sha256: stored.sha256,
      status: "ready", source_type: SALE_PHOTO_SOURCE, source_id: id, created_by: actorId, ready_at: new Date(),
    } });
    return { id };
  }

  /**
   * `GET /sale/photos/{id}`: a READY sale-line photo linked from a Sale line, or the caller's own unlinked upload; anything
   * else → 404 (never reveals another user's unlinked file). One statement, then the stream.
   */
  async open(actorId: string, id: string): Promise<{ contentType: string; size: number; stream: Readable }> {
    const [file] = await this.db.$queryRaw<{ object_key: string; content_type: string; size_bytes: bigint }[]>`
      SELECT f."object_key", f."content_type", f."size_bytes" FROM "inventory"."stored_file" f
      WHERE f."id" = ${id}::uuid AND f."status" = 'ready' AND f."source_type" = ${SALE_PHOTO_SOURCE} AND f."bucket" = 'files'
        AND (EXISTS (SELECT 1 FROM "inventory"."sale_line_photo" p WHERE p."file_id" = f."id")
          OR (f."created_by" = ${actorId} AND NOT EXISTS (SELECT 1 FROM "inventory"."sale_line_photo" p WHERE p."file_id" = f."id")))
      LIMIT 1`;
    if (!file || !file.object_key.startsWith(`${SALE_PHOTO_MODULE}/`)) throw new AppError(404, "PHOTO_NOT_FOUND");
    const size = Number(file.size_bytes);
    let stream: Readable;
    try { stream = await this.storage.get("files", file.object_key); } catch { throw new AppError(404, "PHOTO_NOT_FOUND"); }
    return { contentType: file.content_type, size, stream: stream.pipe(sizeGuard(size)) };
  }
}

/**
 * Owner 2026-11-24: `GET /sale/photos/{id}` for a Memo Receive photo a Sale line REFERENCES. Inventory cannot see master files, so it
 * asks master's internal endpoint, naming the Memo Stock / lot of the referencing line; master serves the file only when it belongs
 * to that stock. Streamed (never buffered), image types only, <= 5 MiB, bounded by the master client timeout.
 */
/** Picker preview: `?lotKey=M…` / `?memoStockId=` of a row not saved yet; master still checks the file belongs to that lot / stock. */
export function previewRefFromQuery(query: Record<string, string | undefined>): { memoStockId: string | null; lotKey: string | null } | undefined {
  const memoStockId = query.memoStockId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.memoStockId) ? query.memoStockId.toLowerCase() : null;
  const lotKey = query.lotKey && /^M[LS][0-9a-f-]{32,36}$/.test(query.lotKey) ? query.lotKey : null;
  return memoStockId || lotKey ? { memoStockId, lotKey } : undefined;
}

export async function openReferencedMemoPhoto(db: Db, master: MasterApi, id: string, requestId: string, preview?: { memoStockId: string | null; lotKey: string | null }): Promise<{ contentType: string; size: number; stream: Readable }> {
  const [linked] = await db.$queryRaw<{ memo_stock_id: string | null; lot_key: string | null }[]>`
    SELECT l."memo_stock_id", l."lot_key" FROM "inventory"."sale_line_ref_photo" r
    JOIN "inventory"."sale_line" l ON l."id" = r."line_id" JOIN "inventory"."sale" s ON s."id" = l."sale_id"
    WHERE r."file_id" = ${id}::uuid AND NOT s."provisional" LIMIT 1`;
  const ref = linked ?? (preview ? { memo_stock_id: preview.memoStockId, lot_key: preview.lotKey } : undefined);
  if (!ref || (!ref.memo_stock_id && !ref.lot_key)) throw new AppError(404, "PHOTO_NOT_FOUND");
  let answer;
  try {
    answer = await master.saleMemoPhoto(id, { memoStockId: ref.memo_stock_id, lotKey: ref.lot_key }, { requestId });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "MASTER_UNAVAILABLE", undefined, { "Retry-After": "5" });
  }
  const contentType = String(answer.headers["content-type"] ?? "");
  const size = Number(answer.headers["content-length"] ?? 0);
  if (answer.status !== 200 || !/^image\/(jpeg|png)$/.test(contentType) || !Number.isInteger(size) || size <= 0 || size > PHOTO_MAX_BYTES) {
    answer.body.resume();
    throw new AppError(404, "PHOTO_NOT_FOUND");
  }
  return { contentType, size, stream: answer.body.pipe(sizeGuard(size)) };
}
