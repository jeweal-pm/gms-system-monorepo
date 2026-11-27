import { Readable } from "node:stream";
import { buildKey, createStorage, uuidV7, type StorageDriver } from "@gms/storage";
import { AppError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import { PHOTO_MAX_BYTES, PHOTO_MODULE as LOAD_PHOTO_MODULE, sizeGuard, sniffType, type Limiter } from "../load-to-stock/photos";

/**
 * Merge/Split result photos (SA-MS-15, ADR-0048 rules, ADR-0030): JPEG / PNG ≤ 5 MiB checked by signature, written only under
 * `files/merge-split/` through `@gms/storage`, metadata in `inventory.stored_file` (`source_type` `merge-split.result-photo`).
 * A result may also RELINK a picked source stock's photos (stock_photo file ids; no byte copy), so reads also allow the
 * `load-to-stock/` prefix where own-stock photos live. No delete API (bytes kept). Shares the process limiters of the Load to
 * Stock photos (≤ 3 uploads, ≤ 6 downloads).
 */
export const MS_PHOTO_MODULE = "merge-split";
export const MS_PHOTO_SOURCE = "merge-split.result-photo";

export class MergeSplitPhotoService {
  private readonly storage: StorageDriver;

  constructor(private readonly db: Db, storageRoot: string, readonly writes: Limiter, readonly reads: Limiter) {
    this.storage = createStorage(storageRoot, { writePrefixes: [MS_PHOTO_MODULE], readPrefixes: [MS_PHOTO_MODULE, LOAD_PHOTO_MODULE] });
  }

  /** `POST /merge-split/photos` (multipart `file`); the caller holds a `writes` slot from before the body is parsed. */
  async uploadHeld(actorId: string, file: File | null): Promise<{ fileId: string }> {
    if (!file || typeof file.stream !== "function") throw new AppError(400, "BAD_REQUEST");
    if (file.size === 0 || file.size > PHOTO_MAX_BYTES) throw new AppError(413, "PAYLOAD_TOO_LARGE");
    const type = sniffType(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (!type) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE");
    const id = uuidV7();
    const key = buildKey({ module: MS_PHOTO_MODULE, ext: type === "image/png" ? "png" : "jpg" });
    const body = Readable.fromWeb(file.stream() as unknown as import("node:stream/web").ReadableStream).pipe(sizeGuard(PHOTO_MAX_BYTES));
    const stored = await this.storage.putStream("files", key, body, { contentType: type, contentLength: file.size });
    await this.db.stored_file.create({ data: {
      id, bucket: "files", object_key: stored.key, filename: key.split("/").pop()!, content_type: type, size_bytes: BigInt(stored.size), sha256: stored.sha256,
      status: "ready", source_type: MS_PHOTO_SOURCE, source_id: id, created_by: actorId, ready_at: new Date(),
    } });
    return { fileId: id };
  }

  /**
   * `GET /merge-split/photos/{fileId}`: a READY file linked to a Merge/Split result or to an own stock (`stock_photo`), or the
   * caller's own unlinked Merge/Split upload (preview before Save). Anything else → 404. One statement, then the stream.
   */
  async open(actorId: string, id: string): Promise<{ contentType: string; size: number; stream: Readable }> {
    const [file] = await this.db.$queryRaw<{ object_key: string; content_type: string; size_bytes: bigint }[]>`
      SELECT f."object_key", f."content_type", f."size_bytes" FROM "inventory"."stored_file" f
      WHERE f."id" = ${id}::uuid AND f."status" = 'ready' AND f."bucket" = 'files'
        AND (EXISTS (SELECT 1 FROM "inventory"."merge_split_result_photo" p WHERE p."file_id" = f."id")
          OR EXISTS (SELECT 1 FROM "inventory"."stock_photo" p WHERE p."file_id" = f."id")
          OR (f."source_type" = ${MS_PHOTO_SOURCE} AND f."created_by" = ${actorId}))
      LIMIT 1`;
    if (!file || !(file.object_key.startsWith(`${MS_PHOTO_MODULE}/`) || file.object_key.startsWith(`${LOAD_PHOTO_MODULE}/`))) throw new AppError(404, "PHOTO_NOT_FOUND");
    const size = Number(file.size_bytes);
    let stream: Readable;
    try { stream = await this.storage.get("files", file.object_key); } catch { throw new AppError(404, "PHOTO_NOT_FOUND"); }
    return { contentType: file.content_type, size, stream: stream.pipe(sizeGuard(size)) };
  }
}
