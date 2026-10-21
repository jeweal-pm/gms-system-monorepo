import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { buildKey, createStorage } from "@gms/storage";
import { LOGO_MAX_BYTES, type LogoContentType } from "./company-profile.schemas";

/** Keep the current named-volume location until the separately approved bulk cutover. */
export function storageRoot(): string {
  return process.env.GMS_STORAGE_ROOT ?? path.resolve(process.cwd(), "storage");
}

const storage = createStorage(storageRoot(), "partner");

export interface StoredLogo {
  key: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Uploads each logo under a fresh immutable key. Previously published user uploads must never be
 * overwritten or physically deleted; database metadata controls which version is currently shown.
 */
export async function storeLogoFile(data: Buffer, contentType: LogoContentType): Promise<StoredLogo> {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const extension = contentType === "image/png" ? "png" : "jpg";
  const key = buildKey({ service: "partner", entity: "company-profile", ext: extension });
  const stored = await storage.put("files", key, data, {
    contentType,
    contentLength: data.length,
    sha256,
  });
  return { key: stored.key, sizeBytes: stored.size, sha256: stored.sha256 };
}

/** Read the current logo through the storage contract and enforce the approved logo size bound. */
export async function readLogoFile(key: string): Promise<Buffer | null> {
  const info = await storage.head("files", key);
  if (!info) return null;
  if (info.size <= 0 || info.size > LOGO_MAX_BYTES) throw new Error("Stored company logo size is invalid");
  const stream = await storage.get("files", key);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as Readable) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > LOGO_MAX_BYTES) {
      stream.destroy();
      throw new Error("Stored company logo exceeds the approved size limit");
    }
    chunks.push(bytes);
  }
  if (size !== info.size) throw new Error("Stored company logo size changed while reading");
  return Buffer.concat(chunks, size);
}

/**
 * Read-only compatibility access for the old named-volume logo. This object is copied into the
 * immutable bucket on replacement/removal; the legacy source is never renamed or unlinked here.
 */
export async function readLegacyLogoFile(): Promise<Buffer | null> {
  const legacyPath = path.join(storageRoot(), "company-profile", "logo");
  try {
    const beforeOpen = await lstat(legacyPath);
    if (beforeOpen.isSymbolicLink() || !beforeOpen.isFile() || beforeOpen.size > LOGO_MAX_BYTES) {
      throw new Error("Legacy company logo is not a bounded regular file");
    }
    const handle = await open(legacyPath, "r");
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > LOGO_MAX_BYTES) throw new Error("Legacy company logo is not a bounded regular file");
      const data = await handle.readFile();
      if (data.length > LOGO_MAX_BYTES) throw new Error("Legacy company logo exceeds the approved size limit");
      return data;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** File signature must match the declared type (SA-CP-06). */
export function signatureMatches(contentType: string, data: Buffer): boolean {
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}
