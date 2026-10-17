import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

/** JPEG or PNG, at most 5 MB (user-photo.md PH-05, Q-PH-1 default). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"] as const;

/**
 * User photo files (user-photo.md PH-01/02): one file `storage/user-photos/<userId>` under the auth
 * working directory, used by the user-admin module only. Production mounts the named volume
 * `auth-storage` at `storage/` (PH-10); dev writes into the git-ignored repo folder. A new upload
 * replaces the file atomically (temp file in the same folder + rename).
 */
const STORAGE_DIR = path.resolve(process.cwd(), "storage", "user-photos");
/** User ids become file names, so only a safe character set is accepted (no `/`, `.`, `..`). */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function photoFile(userId: string): string {
  if (!SAFE_ID.test(userId)) throw new Error("Unsafe user id for a photo file");
  return path.join(STORAGE_DIR, userId);
}

export async function replacePhotoFile(userId: string, data: Buffer): Promise<void> {
  const target = photoFile(userId);
  await mkdir(STORAGE_DIR, { recursive: true });
  const temp = path.join(STORAGE_DIR, `.photo-${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o640);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** The stored bytes, or null when the file does not exist. */
export async function readPhotoFile(userId: string): Promise<Buffer | null> {
  try {
    return await readFile(photoFile(userId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function removePhotoFile(userId: string): Promise<void> {
  await rm(photoFile(userId), { force: true });
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
