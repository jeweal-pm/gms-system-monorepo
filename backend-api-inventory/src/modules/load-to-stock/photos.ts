import { Readable, Transform } from "node:stream";
import { buildKey, createStorage, uuidV7, type StorageDriver } from "@gms/storage";
import { AppError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { MasterUnavailable } from "../../platform/master-client";

/**
 * Load to Stock photos (ADR-0052 D13, ADR-0048 rules, ADR-0030): JPEG / PNG ≤ 5 MiB checked by signature, written only
 * under `files/load-to-stock/` through `@gms/storage` (own storage root), metadata in `inventory.stored_file`
 * (`source_type` `load-to-stock.row-photo`). PU line photos are copied once per master file (dedupe on
 * `origin_service = 'master'` + `origin_file_id`) and streamed with a SHA-256 check. No delete API: removing a photo in
 * the UI only unlinks it; bytes and metadata are kept. ≤ 3 concurrent uploads / copies and ≤ 6 downloads per process.
 */
export const PHOTO_MODULE = "load-to-stock";
export const PHOTO_SOURCE = "load-to-stock.row-photo";
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

export function signatureMatches(contentType: string, data: Uint8Array): boolean {
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.length >= 8 && Buffer.from(data.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

/** Sniffs the type from the bytes (the declared type is not trusted). */
export function sniffType(data: Uint8Array): "image/jpeg" | "image/png" | null {
  return signatureMatches("image/jpeg", data) ? "image/jpeg" : signatureMatches("image/png", data) ? "image/png" : null;
}

/** A small counting semaphore; a full limiter refuses at once (429) instead of queueing unbounded work. */
export class Limiter {
  private active = 0;
  constructor(readonly max: number) {}
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) throw new AppError(429, "RATE_LIMITED", undefined, { "Retry-After": "2" });
    this.active += 1;
    try { return await work(); } finally { this.active -= 1; }
  }
  get inFlight() { return this.active; }
}

export function sizeGuard(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      callback(seen > limit ? new Error("photo exceeds its size") : null, chunk);
    },
  });
}

export class PhotoService {
  private readonly storage: StorageDriver;
  readonly writes = new Limiter(3);
  readonly reads = new Limiter(6);

  constructor(private readonly db: Db, private readonly master: MasterApi, storageRoot: string) {
    this.storage = createStorage(storageRoot, { writePrefixes: [PHOTO_MODULE], readPrefixes: [PHOTO_MODULE] });
  }

  /**
   * `POST /photos` (multipart `file`). INV-20261117-003 F1: the caller holds a `writes` slot from BEFORE the multipart
   * body is parsed (app.ts), so at most 3 bodies (≤ 5 MiB + overhead each) are buffered per process. The bytes are not
   * copied again: the type is sniffed from the first 8 bytes and the file is streamed into storage.
   */
  async uploadHeld(actorId: string, file: File | null): Promise<{ id: string }> {
    if (!file || typeof file.stream !== "function") throw new AppError(400, "BAD_REQUEST");
    if (file.size === 0 || file.size > PHOTO_MAX_BYTES) throw new AppError(413, "PHOTO_TOO_LARGE");
    const type = sniffType(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
    if (!type) throw new AppError(415, "PHOTO_TYPE_INVALID");
    const id = uuidV7();
    const key = buildKey({ module: PHOTO_MODULE, ext: type === "image/png" ? "png" : "jpg" });
    const body = Readable.fromWeb(file.stream() as unknown as import("node:stream/web").ReadableStream).pipe(sizeGuard(PHOTO_MAX_BYTES));
    const stored = await this.storage.putStream("files", key, body, { contentType: type, contentLength: file.size });
    await this.db.stored_file.create({ data: {
      id, bucket: "files", object_key: stored.key, filename: key.split("/").pop()!, content_type: type, size_bytes: BigInt(stored.size), sha256: stored.sha256,
      status: "ready", source_type: PHOTO_SOURCE, source_id: id, created_by: actorId, ready_at: new Date(),
    } });
    return { id };
  }

  /**
   * `POST /photos/from-purchase-line`: the line must be loadable (OPEN); its PU photos (≤ 5, PU order) are copied once
   * per master file and reused afterwards. Statements: 1 lookup of copies + 1 insert per NEW file (≤ 5, NP-LS-06).
   */
  async fromPurchaseLine(actorId: string, purchaseLineId: string, requestId: string): Promise<{ ids: string[] }> {
    const [line] = (await this.master.batch([purchaseLineId], undefined, { requestId })).items;
    if (!line || line.status !== "OPEN") throw new AppError(422, "LOAD_TO_STOCK_LINE_UNAVAILABLE", { purchaseLineIds: [purchaseLineId], rowPaths: [] });
    const photos = (await this.master.linePhotos(purchaseLineId, { requestId })).items.slice(0, 5);
    if (photos.length === 0) return { ids: [] };
    const existing = await this.db.stored_file.findMany({ where: { origin_service: "master", origin_file_id: { in: photos.map((photo) => photo.fileId) } }, select: { id: true, origin_file_id: true } });
    const copied = new Map(existing.map((row) => [row.origin_file_id!, row.id]));
    const ids: string[] = [];
    for (const photo of photos) {
      const known = copied.get(photo.fileId);
      if (known) { ids.push(known); continue; }
      ids.push(await this.writes.run(() => this.copy(actorId, photo, requestId)));
    }
    return { ids };
  }

  private async copy(actorId: string, photo: { fileId: string; contentType: string; sizeBytes: number; sha256: string }, requestId: string): Promise<string> {
    if (!(PHOTO_TYPES as readonly string[]).includes(photo.contentType) || photo.sizeBytes <= 0 || photo.sizeBytes > PHOTO_MAX_BYTES || !/^[a-f0-9]{64}$/.test(photo.sha256)) {
      throw new AppError(422, "LOAD_TO_STOCK_PHOTO_INVALID");
    }
    let response;
    try { response = await this.master.fileContent(photo.fileId, { requestId }); } catch (error) {
      if (error instanceof MasterUnavailable) throw new AppError(503, "MASTER_UNAVAILABLE", undefined, { "Retry-After": "5" });
      throw error;
    }
    if (response.status !== 200) { response.body.resume(); throw new AppError(422, "LOAD_TO_STOCK_PHOTO_INVALID"); }
    const key = buildKey({ module: PHOTO_MODULE, ext: photo.contentType === "image/png" ? "png" : "jpg" });
    let stored;
    try {
      stored = await this.storage.putStream("files", key, response.body.pipe(sizeGuard(PHOTO_MAX_BYTES)), { contentType: photo.contentType, contentLength: photo.sizeBytes, sha256: photo.sha256 });
    } catch {
      throw new AppError(503, "MASTER_UNAVAILABLE", undefined, { "Retry-After": "5" });
    }
    const id = uuidV7();
    // A concurrent copy of the same master file may win the unique (origin) index: reuse its row; the extra immutable
    // object stays on disk (never deleted, ADR-0030).
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      INSERT INTO "inventory"."stored_file" ("id", "bucket", "object_key", "filename", "content_type", "size_bytes", "sha256", "status", "source_type", "source_id", "origin_service", "origin_file_id", "created_by", "ready_at")
      VALUES (${id}::uuid, 'files', ${stored.key}, ${key.split("/").pop()!}, ${photo.contentType}, ${stored.size}, ${stored.sha256}, 'ready', ${PHOTO_SOURCE}, ${id}, 'master', ${photo.fileId}::uuid, ${actorId}, now())
      ON CONFLICT ("origin_service", "origin_file_id") WHERE "origin_file_id" IS NOT NULL DO UPDATE SET "origin_service" = EXCLUDED."origin_service"
      RETURNING "id"`;
    return rows[0].id;
  }

  /** `GET /photos/{id}`: a READY load-to-stock photo, streamed with its stored type. */
  async open(id: string): Promise<{ contentType: string; size: number; stream: Readable }> {
    const file = await this.db.stored_file.findFirst({ where: { id, status: "ready", source_type: PHOTO_SOURCE, bucket: "files" }, select: { object_key: true, content_type: true, size_bytes: true } });
    if (!file || !file.object_key.startsWith(`${PHOTO_MODULE}/`)) throw new AppError(404, "PHOTO_NOT_FOUND");
    const size = Number(file.size_bytes);
    let stream: Readable;
    try { stream = await this.storage.get("files", file.object_key); } catch { throw new AppError(404, "PHOTO_NOT_FOUND"); }
    return { contentType: file.content_type, size, stream: stream.pipe(sizeGuard(size)) };
  }
}
