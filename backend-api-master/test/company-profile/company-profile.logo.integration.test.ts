import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStorage } from "@gms/storage";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IT-CP-P01…P03 exercises CompanyProfileService plus the real @gms/storage filesystem driver.
 * Prisma is an isolated in-memory boundary; this suite does not connect to or mutate a database.
 */

type ProfileRow = Record<string, unknown> & { id: number; version: number };
type MetadataRow = Record<string, unknown>;

const state = vi.hoisted(() => ({ row: null as ProfileRow | null, metadata: [] as MetadataRow[] }));

vi.mock("../../src/database/prisma-client", () => {
  const tx = {
    $queryRaw: vi.fn(async () => state.row ? [{ version: state.row.version }] : []),
    companyProfile: {
      findUnique: vi.fn(async () => state.row),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (!state.row) throw new Error("missing test profile");
        const increment = data.version as { increment?: number } | undefined;
        state.row = { ...state.row, ...data, version: state.row.version + (increment?.increment ?? 0) };
        return state.row;
      }),
    },
    storedFile: {
      create: vi.fn(async ({ data }: { data: MetadataRow }) => {
        state.metadata.push({ ...data });
        return data;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { objectKey: string; status: string }; data: Record<string, unknown> }) => {
        const row = state.metadata.find((entry) => entry.objectKey === where.objectKey && entry.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      companyProfile: {
        findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => {
          if (!state.row) return null;
          if (!select) return state.row;
          return Object.fromEntries(Object.keys(select).map((key) => [key, state.row?.[key]]));
        }),
      },
    },
  };
});

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 4, 5, 6]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7, 8, 9]);
const COMPANY_PROFILE = {
  id: 1,
  name: "Test Co., Ltd.",
  taxId: "0105555000000",
  contactName: "Test Admin",
  phoneCountry: "TH",
  phoneE164: "+66812345678",
  email: "admin@example.com",
  website: "",
  address: "1 Road",
  address2: "",
  roadStreet: "",
  countryCode: "TH",
  state: "Bangkok",
  city: "Bangkok",
  postcode: "10110",
  currencyCode: "THB",
  bankDetails: "",
  showBankDetailsOnInvoice: false,
  version: 1,
  updatedBy: "test-user",
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  logoContentType: null,
  logoSizeBytes: null,
  logoSha256: null,
  logoStorageKey: null,
  logoUpdatedAt: null,
};

let root: string;
let previousStorageRoot: string | undefined;
let service: import("../../src/company-profile/company-profile.service").CompanyProfileService;
let driver: ReturnType<typeof createStorage>;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "partner-logo-integration-"));
  previousStorageRoot = process.env.GMS_STORAGE_ROOT;
  process.env.GMS_STORAGE_ROOT = root;
  vi.resetModules();
  const loaded = await import("../../src/company-profile/company-profile.service");
  service = new loaded.CompanyProfileService();
  driver = createStorage(root, { writePrefixes: ["company-profile", "partner"], readPrefixes: ["company-profile", "partner"] });
});

afterAll(async () => {
  if (previousStorageRoot === undefined) delete process.env.GMS_STORAGE_ROOT;
  else process.env.GMS_STORAGE_ROOT = previousStorageRoot;
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  state.row = { ...COMPANY_PROFILE };
  state.metadata = [];
});

describe("company logo storage integration", () => {
  it("IT-CP-P01 persists immutable bytes and ready metadata, then reads through the service", async () => {
    const result = await service.putLogo("test-user", 1, "image/png", png);
    const key = String(state.row?.logoStorageKey);
    const metadata = state.metadata[0];
    expect(result.profile.logo).toMatchObject({ contentType: "image/png", sizeBytes: png.length });
    expect(metadata).toMatchObject({ bucket: "files", status: "ready", sourceType: "company-profile", sourceId: "1", purgeAfter: null });
    expect(metadata?.objectKey).toBe(key);
    expect(metadata?.sizeBytes).toBe(BigInt(png.length));
    expect(await driver.head("files", key, "image/png")).toMatchObject({ size: png.length, contentType: "image/png" });
    expect((await service.getLogo()).data).toEqual(png);
  });

  it("IT-CP-P02 replacement tombstones prior metadata but retains both physical objects", async () => {
    await service.putLogo("test-user", 1, "image/png", png);
    const previousKey = String(state.row?.logoStorageKey);
    await service.putLogo("test-user", 2, "image/jpeg", jpeg);
    const currentKey = String(state.row?.logoStorageKey);
    expect(currentKey).not.toBe(previousKey);
    expect(state.metadata.map((entry) => entry.status)).toEqual(["deleted", "ready"]);
    expect(state.metadata.every((entry) => entry.purgeAfter === null)).toBe(true);
    expect(await driver.head("files", previousKey)).toMatchObject({ size: png.length });
    expect(await driver.head("files", currentKey)).toMatchObject({ size: jpeg.length });
    expect((await service.getLogo()).data).toEqual(jpeg);
  });

  it("IT-CP-P03 UI removal hides the pointer and metadata while retaining uploaded bytes", async () => {
    await service.putLogo("test-user", 1, "image/png", png);
    const key = String(state.row?.logoStorageKey);
    const result = await service.removeLogo("test-user", 2);
    expect(result.profile.logo).toBeNull();
    expect(state.row?.logoStorageKey).toBeNull();
    expect(state.metadata[0]).toMatchObject({ status: "deleted", purgeAfter: null });
    expect(await driver.head("files", key)).toMatchObject({ size: png.length });
    await expect(service.getLogo()).rejects.toMatchObject({ response: expect.objectContaining({ error: expect.objectContaining({ code: "COMPANY_LOGO_NOT_FOUND" }) }) });
  });

  it("IT-CP-P04 keeps a legacy named-volume logo visible and snapshots it before UI removal", async () => {
    const legacyPath = path.join(root, "company-profile", "logo");
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, png);
    state.row = {
      ...COMPANY_PROFILE,
      logoContentType: "image/png",
      logoSizeBytes: png.length,
      logoSha256: createHash("sha256").update(png).digest("hex"),
      logoUpdatedAt: new Date("2025-12-01T00:00:00.000Z"),
    };
    expect((await service.getLogo()).data).toEqual(png);

    await service.removeLogo("test-user", 1);
    expect(state.metadata).toHaveLength(1);
    expect(state.metadata[0]).toMatchObject({ status: "deleted", purgeAfter: null, sizeBytes: BigInt(png.length) });
    expect(await readFile(legacyPath)).toEqual(png);
    expect(await driver.head("files", String(state.metadata[0]?.objectKey))).toMatchObject({ size: png.length });
  });

  it("IT-CP-P05 snapshots legacy bytes before replacement without deleting the volume source", async () => {
    const legacyPath = path.join(root, "company-profile", "logo");
    await mkdir(path.dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, png);
    state.row = {
      ...COMPANY_PROFILE,
      logoContentType: "image/png",
      logoSizeBytes: png.length,
      logoSha256: createHash("sha256").update(png).digest("hex"),
      logoUpdatedAt: new Date("2025-12-01T00:00:00.000Z"),
    };
    await service.putLogo("test-user", 1, "image/jpeg", jpeg);
    expect(state.metadata.map((entry) => entry.status)).toEqual(["deleted", "ready"]);
    expect(await readFile(legacyPath)).toEqual(png);
    expect((await service.getLogo()).data).toEqual(jpeg);
  });
});
