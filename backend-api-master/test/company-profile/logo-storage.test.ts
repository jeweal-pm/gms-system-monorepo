import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStorage } from "@gms/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** UT-CP-P30…P35: immutable partner logo keys, permanent byte retention and signature validation. */

type LogoStorage = typeof import("../../src/company-profile/logo-storage");

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

let workDir: string;
let priorRoot: string | undefined;
let logoStorage: LogoStorage;
let driver: ReturnType<typeof createStorage>;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "partner-logo-"));
  priorRoot = process.env.GMS_STORAGE_ROOT;
  process.env.GMS_STORAGE_ROOT = workDir;
  vi.resetModules();
  logoStorage = await import("../../src/company-profile/logo-storage");
  driver = createStorage(workDir, { writePrefixes: ["company-profile", "partner"], readPrefixes: ["company-profile", "partner"] });
});

afterAll(async () => {
  if (priorRoot === undefined) delete process.env.GMS_STORAGE_ROOT;
  else process.env.GMS_STORAGE_ROOT = priorRoot;
  await rm(workDir, { recursive: true, force: true });
});

describe("logo file storage", () => {
  it("UT-CP-P30 returns null for a missing immutable key", async () => {
    expect(await logoStorage.readLogoFile("company-profile/missing.png")).toBeNull();
  });

  it("UT-CP-P31 writes and reads a logo through the files storage contract", async () => {
    const stored = await logoStorage.storeLogoFile(png, "image/png");
    expect(stored).toMatchObject({ sizeBytes: png.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(stored.key).toMatch(/^company-profile\/[0-9a-f-]+\.png$/);
    expect(await logoStorage.readLogoFile(stored.key)).toEqual(png);
  });

  it("UT-CP-P36 continues reading a historical service-prefixed logo", async () => {
    const legacyKey = "partner/company-profile/2026/10/legacy.png";
    await driver.put("files", legacyKey, png, { contentType: "image/png" });
    await expect(logoStorage.readLogoFile(legacyKey)).resolves.toEqual(png);
  });

  it("UT-CP-P37 lets the company-profile module supply a safe filename", async () => {
    const stored = await logoStorage.storeLogoFile(png, "image/png", "brand-mark-v2.png");
    expect(stored.key).toBe("company-profile/brand-mark-v2.png");
    await expect(logoStorage.readLogoFile(stored.key)).resolves.toEqual(png);
  });

  it("UT-CP-P38 rejects a supplied filename with a mismatched image extension", async () => {
    await expect(logoStorage.storeLogoFile(png, "image/png", "brand-mark.jpg"))
      .rejects.toThrow("filename extension does not match");
  });

  it("UT-CP-P32 replaces the current pointer with a fresh key while retaining both byte objects", async () => {
    const oldLogo = await logoStorage.storeLogoFile(png, "image/png");
    const newLogo = await logoStorage.storeLogoFile(jpeg, "image/jpeg");
    expect(newLogo.key).not.toBe(oldLogo.key);
    expect(await logoStorage.readLogoFile(newLogo.key)).toEqual(jpeg);
    expect(await logoStorage.readLogoFile(oldLogo.key)).toEqual(png);
    await expect(driver.delete("files", oldLogo.key)).rejects.toThrow(/permanently retained/i);
    expect(await logoStorage.readLogoFile(oldLogo.key)).toEqual(png);
  });
});

describe("signatureMatches", () => {
  it("UT-CP-P34 accepts bytes that match the declared type", () => {
    expect(logoStorage.signatureMatches("image/png", png)).toBe(true);
    expect(logoStorage.signatureMatches("image/jpeg", jpeg)).toBe(true);
  });

  it.each([
    ["PNG bytes declared as JPEG", "image/jpeg", png],
    ["JPEG bytes declared as PNG", "image/png", jpeg],
    ["GIF bytes declared as PNG", "image/png", Buffer.from("GIF89a....")],
    ["bytes that only start with 0xFF declared as JPEG", "image/jpeg", Buffer.from([0xff, 0x00, 0x00, 0x00])],
    ["a PNG signature with one wrong byte", "image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x00])],
    ["a too-short buffer", "image/png", Buffer.from([0x89, 0x50])],
    ["an unsupported type", "image/gif", Buffer.from("GIF89a")],
  ])("UT-CP-P35 rejects %s", (_label, type, data) => {
    expect(logoStorage.signatureMatches(type, data)).toBe(false);
  });
});
