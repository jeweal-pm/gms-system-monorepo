import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** UT-CP-P30…P35: logo file storage (SA-CP-05, owner: one file, overwritten) and signature check (SA-CP-06). */

type Storage = typeof import("../../src/company-profile/logo-storage");

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);

let originalCwd: string;
let workDir: string;
let storage: Storage;

beforeAll(async () => {
  // The storage folder is resolved from the working directory when the module loads.
  originalCwd = process.cwd();
  workDir = await mkdtemp(path.join(os.tmpdir(), "partner-logo-"));
  process.chdir(workDir);
  vi.resetModules();
  storage = await import("../../src/company-profile/logo-storage");
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(workDir, { recursive: true, force: true });
});

const folder = () => path.join(workDir, "storage", "company-profile");

describe("logo file storage", () => {
  it("UT-CP-P30 returns null when no logo file exists", async () => {
    expect(await storage.readLogoFile()).toBeNull();
  });

  it("UT-CP-P31 writes the logo into storage/company-profile/logo", async () => {
    await storage.replaceLogoFile(png);
    expect(await storage.readLogoFile()).toEqual(png);
    expect(await readdir(folder())).toEqual(["logo"]);
  });

  it("UT-CP-P32 overwrites the previous logo and leaves no temp file", async () => {
    await storage.replaceLogoFile(jpeg);
    expect(await storage.readLogoFile()).toEqual(jpeg);
    expect(await readdir(folder())).toEqual(["logo"]);
  });

  it("UT-CP-P33 removes the file, and removing again is harmless", async () => {
    await storage.removeLogoFile();
    expect(await storage.readLogoFile()).toBeNull();
    await expect(storage.removeLogoFile()).resolves.toBeUndefined();
  });
});

describe("signatureMatches", () => {
  it("UT-CP-P34 accepts bytes that match the declared type", () => {
    expect(storage.signatureMatches("image/png", png)).toBe(true);
    expect(storage.signatureMatches("image/jpeg", jpeg)).toBe(true);
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
    expect(storage.signatureMatches(type, data)).toBe(false);
  });
});
