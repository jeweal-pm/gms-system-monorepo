import { Transform, type Readable } from "node:stream";
import { buildKey, createStorage } from "@gms/storage";
import { storageRoot, signatureMatches } from "../company-profile/logo-storage";

/**
 * Line photo storage shared by Quotation (SA-QT-10) and Memo Receive (SA-MR-15): JPEG/PNG ≤ 5 MB, one storage
 * module (key prefix) per document type, kept permanently (ADR-0030).
 */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

/** SA-QT-10: JPEG/PNG line photos ≤ 5 MB under the `quotation-photo` module; kept permanently (ADR-0030). */
export const QUOTATION_PHOTO_MAX_BYTES = PHOTO_MAX_BYTES;
export const QUOTATION_PHOTO_TYPES = PHOTO_TYPES;
export type QuotationPhotoType = PhotoType;
/** `stored_files.source_type` of quotation photos; `source_id` is the photo id itself (uploader = created_by). */
export const QUOTATION_PHOTO_SOURCE = "quotation.line-photo";

export function isPhotoType(value: string): value is PhotoType {
  return (PHOTO_TYPES as readonly string[]).includes(value);
}
export const isQuotationPhotoType = isPhotoType;

export { signatureMatches };

export type StoredPhoto = { key: string; sizeBytes: number; sha256: string };
export type PhotoStore = {
  /** Writes one immutable object under a fresh key; bytes are never overwritten or deleted. */
  store(data: Buffer, contentType: PhotoType): Promise<StoredPhoto>;
  /**
   * Opens one photo for streaming (INV-20261026-001: no whole-file copy in memory); `null` when missing. The caller
   * pipes it through `sizeGuard(size)` so a file that grew since `head` can't stream unbounded.
   */
  open(key: string): Promise<{ size: number; stream: Readable } | null>;
};

/** A photo store confined to one storage module (`files/{module}/…`): it can't write or read another module's keys. */
export function createPhotoStore(module: string): PhotoStore {
  const storage = createStorage(storageRoot(), { writePrefixes: [module], readPrefixes: [module] });
  return {
    async store(data, contentType) {
      const key = buildKey({ module, ext: contentType === "image/png" ? "png" : "jpg" });
      const stored = await storage.put("files", key, data, { contentType, contentLength: data.length });
      return { key: stored.key, sizeBytes: stored.size, sha256: stored.sha256 };
    },
    async open(key) {
      if (!key.startsWith(`${module}/`)) throw new Error(`Stored key is outside the ${module} prefix`);
      const info = await storage.head("files", key);
      if (!info) return null;
      if (info.size <= 0 || info.size > PHOTO_MAX_BYTES) throw new Error(`Stored ${module} size is invalid`);
      return { size: info.size, stream: (await storage.get("files", key)) as Readable };
    },
  };
}

const quotationPhotos = createPhotoStore("quotation-photo");

/** Writes one immutable quotation photo under a fresh key; bytes are never overwritten or deleted. */
export function storeQuotationPhoto(data: Buffer, contentType: QuotationPhotoType) {
  return quotationPhotos.store(data, contentType);
}

/** Opens one quotation photo for streaming; `null` when missing. */
export function openQuotationPhoto(key: string): Promise<{ size: number; stream: Readable } | null> {
  return quotationPhotos.open(key);
}

/** Passes bytes through and fails once more than `limit` bytes arrive. */
export function sizeGuard(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      callback(seen > limit ? new Error("Stored photo exceeds its recorded size") : null, chunk);
    },
  });
}
