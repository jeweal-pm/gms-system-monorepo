import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildKey, createStorage, type StoredObject } from "@gms/storage";

/** JPEG or PNG, at most 5 MB (user-photo.md PH-05, Q-PH-1 default). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

// In local development, keep the GMS storage tree below the service's ignored storage folder.
// Production supplies the shared `/srv/gms/storage` root through GMS_STORAGE_ROOT.
const STORAGE_ROOT = process.env.GMS_STORAGE_ROOT ?? path.resolve(process.cwd(), "storage");
const LEGACY_STORAGE_DIR = path.resolve(process.cwd(), "storage", "user-photos");
const storage = createStorage(STORAGE_ROOT, "auth");
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type PhotoObject = Pick<StoredObject, "key" | "size" | "sha256">;

function extensionFor(contentType: string): "jpg" | "png" {
  return contentType === "image/png" ? "png" : "jpg";
}

function legacyPhotoFile(userId: string): string {
  if (!SAFE_ID.test(userId)) throw new Error("Unsafe user id for a photo file");
  return path.join(LEGACY_STORAGE_DIR, userId);
}

/**
 * Write a new immutable user-photo object. Each request gets a distinct key; the storage
 * driver's `files` bucket refuses physical deletion, so replacement cannot destroy history.
 */
export async function putPhotoObject(userId: string, contentType: string, data: Buffer): Promise<PhotoObject> {
  if (!SAFE_ID.test(userId)) throw new Error("Unsafe user id for a photo file");
  const key = buildKey({ service: "auth", entity: "user-photo", ext: extensionFor(contentType) });
  const stored = await storage.put("files", key, data, { contentType, contentLength: data.length });
  return { key: stored.key, size: stored.size, sha256: stored.sha256 };
}

/** Read a new GMS object with a strict bound matching the existing photo upload limit. */
export async function readPhotoObject(key: string): Promise<Buffer | null> {
  if (!key.startsWith("auth/user-photo/")) throw new Error("Stored photo key is outside the auth user-photo prefix");
  const info = await storage.head("files", key, "application/octet-stream");
  if (!info) return null;
  if (info.size < 1 || info.size > PHOTO_MAX_BYTES) throw new Error("Stored user photo exceeds the supported size");
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of await storage.get("files", key)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > PHOTO_MAX_BYTES) throw new Error("Stored user photo exceeds the supported size");
      chunks.push(bytes);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (size !== info.size) throw new Error("Stored user photo size changed while reading");
  return Buffer.concat(chunks, size);
}

/** Read-only fallback for files written by the pre-GMS implementation. Never removes them. */
export async function readLegacyPhotoFile(userId: string): Promise<Buffer | null> {
  try {
    return await readFile(legacyPhotoFile(userId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Copy a legacy photo into a new immutable object before its old UserPhoto association is
 * removed or replaced. The original legacy bytes are deliberately left in place for rollback.
 */
export async function archiveLegacyPhotoFile(userId: string, data: Buffer, contentType: string): Promise<PhotoObject> {
  return putPhotoObject(userId, contentType, data);
}

export function sha256Photo(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function isPhotoType(value: string): value is (typeof PHOTO_TYPES)[number] {
  return (PHOTO_TYPES as readonly string[]).includes(value);
}

/** File signature must match the declared type (PH-05). */
export function signatureMatches(contentType: string, data: Buffer): boolean {
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}
