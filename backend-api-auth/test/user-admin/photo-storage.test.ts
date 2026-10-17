import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** UT-PH-01…05: photo files under storage/user-photos (user-photo.md PH-01/02/05). Runs in a temp working directory. */

const originalCwd = process.cwd();
let workDir = "";
let storage: typeof import("../../src/user-admin/photo-storage");

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "auth-photo-"));
  process.chdir(workDir);
  storage = await import("../../src/user-admin/photo-storage");
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(workDir, { recursive: true, force: true });
});

describe("photo storage", () => {
  it("UT-PH-01 a new upload overwrites the previous file; no temp files remain", async () => {
    await storage.replacePhotoFile("user-1", JPEG);
    await storage.replacePhotoFile("user-1", PNG);
    expect(await storage.readPhotoFile("user-1")).toEqual(PNG);
    expect(await readdir(path.join(workDir, "storage", "user-photos"))).toEqual(["user-1"]);
  });

  it("UT-PH-02 remove deletes the file and is idempotent; a missing file reads as null", async () => {
    await storage.replacePhotoFile("user-2", JPEG);
    await storage.removePhotoFile("user-2");
    await storage.removePhotoFile("user-2");
    expect(await storage.readPhotoFile("user-2")).toBeNull();
  });

  it("UT-PH-03 user ids that could leave the folder are rejected", async () => {
    for (const id of ["../escape", "a/b", "..", "a.b", ""]) {
      await expect(storage.replacePhotoFile(id, JPEG)).rejects.toThrow("Unsafe user id");
      await expect(storage.readPhotoFile(id)).rejects.toThrow("Unsafe user id");
    }
  });

  it("UT-PH-04 signature must match the declared type", () => {
    expect(storage.signatureMatches("image/jpeg", JPEG)).toBe(true);
    expect(storage.signatureMatches("image/png", PNG)).toBe(true);
    expect(storage.signatureMatches("image/png", JPEG)).toBe(false);
    expect(storage.signatureMatches("image/jpeg", Buffer.from("<svg/>"))).toBe(false);
    expect(storage.signatureMatches("image/gif", JPEG)).toBe(false);
  });

  it("UT-PH-05 only JPEG and PNG, at most 5 MB", () => {
    expect(storage.isPhotoType("image/jpeg")).toBe(true);
    expect(storage.isPhotoType("image/svg+xml")).toBe(false);
    expect(storage.PHOTO_MAX_BYTES).toBe(5_242_880);
  });
});
