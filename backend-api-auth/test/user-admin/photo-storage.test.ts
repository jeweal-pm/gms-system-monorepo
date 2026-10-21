import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** UT-PH-U01…U05: immutable GMS key, reads, legacy fallback/archive, validation helpers. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
let root = "";
let serviceCwd = "";
let storage: typeof import("../../src/user-admin/photo-storage");

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "auth-gms-photo-"));
  serviceCwd = process.cwd();
  process.env.GMS_STORAGE_ROOT = path.join(root, "gms");
  process.chdir(root);
  storage = await import("../../src/user-admin/photo-storage");
});

afterAll(async () => {
  process.chdir(serviceCwd);
  delete process.env.GMS_STORAGE_ROOT;
  await rm(root, { recursive: true, force: true });
});

describe("auth user-photo GMS storage adapter", () => {
  it("UT-PH-U01 creates unique service-scoped immutable keys and reads both object versions", async () => {
    const first = await storage.putPhotoObject("user-1", "image/jpeg", JPEG);
    const second = await storage.putPhotoObject("user-1", "image/png", PNG);
    expect(first.key).toMatch(/^auth\/user-photo\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(second.key).toMatch(/^auth\/user-photo\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    expect(first.key).not.toBe(second.key);
    expect(await storage.readPhotoObject(first.key)).toEqual(JPEG);
    expect(await storage.readPhotoObject(second.key)).toEqual(PNG);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("UT-PH-U02 returns null for a missing object", async () => {
    await expect(storage.readPhotoObject("auth/user-photo/2026/10/00000000-0000-7000-8000-000000000001.jpg"))
      .resolves.toBeNull();
  });

  it("UT-PH-U03 archives legacy bytes under an immutable key and leaves the source untouched", async () => {
    const legacyDir = path.join(root, "storage", "user-photos");
    await mkdir(legacyDir, { recursive: true });
    const legacyPath = path.join(legacyDir, "legacy-user");
    await writeFile(legacyPath, JPEG);
    const legacy = await storage.readLegacyPhotoFile("legacy-user");
    expect(legacy).toEqual(JPEG);
    const archived = await storage.archiveLegacyPhotoFile("legacy-user", legacy!, "image/jpeg");
    expect(await storage.readPhotoObject(archived.key)).toEqual(JPEG);
    expect(await readFile(legacyPath)).toEqual(JPEG);
  });

  it("UT-PH-U04 rejects unsafe legacy identifiers", async () => {
    await expect(storage.readLegacyPhotoFile("../escape")).rejects.toThrow("Unsafe user id");
    await expect(storage.putPhotoObject("../escape", "image/jpeg", JPEG)).rejects.toThrow("Unsafe user id");
  });

  it("UT-PH-U05 rejects keys owned by another service", async () => {
    await expect(storage.readPhotoObject("partner/user-photo/2026/10/00000000-0000-7000-8000-000000000001.jpg"))
      .rejects.toThrow("outside the auth user-photo prefix");
  });

  it("UT-PH-U06 validates JPEG and PNG types and signatures", () => {
    expect(storage.isPhotoType("image/jpeg")).toBe(true);
    expect(storage.isPhotoType("image/svg+xml")).toBe(false);
    expect(storage.signatureMatches("image/jpeg", JPEG)).toBe(true);
    expect(storage.signatureMatches("image/png", PNG)).toBe(true);
    expect(storage.signatureMatches("image/png", JPEG)).toBe(false);
  });
});
