import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

/**
 * Company logo file (company-profile SA-CP-05, owner): one file `storage/company-profile/logo` under
 * the partner working directory, used by this module only. Production mounts the named volume
 * `partner-storage` at `storage/` (infra bundle backend-api-partner/2); dev writes into the git-ignored
 * repo folder. A new upload replaces the file atomically (temp file in the same folder + rename).
 */
const STORAGE_DIR = path.resolve(process.cwd(), "storage", "company-profile");
const LOGO_FILE = path.join(STORAGE_DIR, "logo");

export async function replaceLogoFile(data: Buffer): Promise<void> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const temp = path.join(STORAGE_DIR, `.logo-${randomUUID()}.tmp`);
  try {
    const handle = await open(temp, "wx", 0o640);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, LOGO_FILE);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

/** The stored bytes, or null when the file does not exist. */
export async function readLogoFile(): Promise<Buffer | null> {
  try {
    return await readFile(LOGO_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function removeLogoFile(): Promise<void> {
  await rm(LOGO_FILE, { force: true });
}

/** File signature must match the declared type (SA-CP-06). */
export function signatureMatches(contentType: string, data: Buffer): boolean {
  if (contentType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}
