import { Transform, type Readable } from "node:stream";
import { buildKey, createStorage } from "@gms/storage";
import { storageRoot, signatureMatches } from "../company-profile/logo-storage";

/** SA-QT-10: JPEG/PNG line photos ≤ 5 MB under the `quotation-photo` module; kept permanently (ADR-0030). */
export const QUOTATION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const QUOTATION_PHOTO_TYPES = ["image/jpeg", "image/png"] as const;
export type QuotationPhotoType = (typeof QUOTATION_PHOTO_TYPES)[number];
/** `stored_files.source_type` of quotation photos; `source_id` is the photo id itself (uploader = created_by). */
export const QUOTATION_PHOTO_SOURCE = "quotation.line-photo";

const storage = createStorage(storageRoot(), { writePrefixes: ["quotation-photo"], readPrefixes: ["quotation-photo"] });

export function isQuotationPhotoType(value: string): value is QuotationPhotoType {
  return (QUOTATION_PHOTO_TYPES as readonly string[]).includes(value);
}

export { signatureMatches };

/** Writes one immutable object under a fresh key; bytes are never overwritten or deleted. */
export async function storeQuotationPhoto(data: Buffer, contentType: QuotationPhotoType) {
  const key = buildKey({ module: "quotation-photo", ext: contentType === "image/png" ? "png" : "jpg" });
  const stored = await storage.put("files", key, data, { contentType, contentLength: data.length });
  return { key: stored.key, sizeBytes: stored.size, sha256: stored.sha256 };
}

/**
 * Opens one photo for streaming (INV-20261026-001: no whole-file copy in memory); `null` when missing.
 * The caller pipes it through `sizeGuard(size)` so a file that grew since `head` can't stream unbounded.
 */
export async function openQuotationPhoto(key: string): Promise<{ size: number; stream: Readable } | null> {
  if (!key.startsWith("quotation-photo/")) throw new Error("Stored key is outside the quotation photo prefix");
  const info = await storage.head("files", key);
  if (!info) return null;
  if (info.size <= 0 || info.size > QUOTATION_PHOTO_MAX_BYTES) throw new Error("Stored quotation photo size is invalid");
  return { size: info.size, stream: (await storage.get("files", key)) as Readable };
}

/** Passes bytes through and fails once more than `limit` bytes arrive. */
export function sizeGuard(limit: number): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      callback(seen > limit ? new Error("Stored quotation photo exceeds its recorded size") : null, chunk);
    },
  });
}
