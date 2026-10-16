import { createHash } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SaveCompanyProfileInput } from "../../src/company-profile/company-profile.schemas";
import { CompanyProfileService } from "../../src/company-profile/company-profile.service";

/**
 * UT-CP-P40…P58: CompanyProfileService against an in-memory stand-in for Prisma and the logo file
 * (the persistence and file-system boundaries are mocked; SQL, CHECKs and the volume are covered by
 * the BT-CP runs in the SA testing document). `vi.mock` is hoisted above the imports.
 */

type Row = Record<string, unknown> & { id: number; version: number };

const db = vi.hoisted(() => ({ row: null as Row | null, failCreateWith: null as unknown }));
const files = vi.hoisted(() => ({ data: null as Buffer | null, replace: vi.fn(), remove: vi.fn() }));

vi.mock("../../src/database/prisma-client", () => {
  const tx = {
    $queryRaw: vi.fn(async () => (db.row ? [{ version: db.row.version }] : [])),
    companyProfile: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (db.failCreateWith) throw db.failCreateWith;
        if (db.row) throw Object.assign(new Error("unique"), { code: "P2002" });
        db.row = { ...data };
        return db.row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { version: number }; data: Record<string, unknown> }) => {
        if (!db.row || db.row.version !== where.version) return { count: 0 };
        db.row = { ...db.row, ...data, version: db.row.version + 1 };
        return { count: 1 };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        db.row = { ...db.row!, ...data, version: db.row!.version + 1 };
        return db.row;
      }),
      count: vi.fn(async () => (db.row ? 1 : 0)),
      findUniqueOrThrow: vi.fn(async () => db.row),
    },
  };
  return {
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      companyProfile: {
        findUnique: vi.fn(async ({ select }: { select?: Record<string, boolean> }) => {
          if (!db.row) return null;
          if (!select) return db.row;
          return Object.fromEntries(Object.keys(select).map((key) => [key, db.row![key]]));
        }),
      },
    },
  };
});

vi.mock("../../src/company-profile/logo-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/company-profile/logo-storage")>();
  return {
    ...actual,
    replaceLogoFile: files.replace.mockImplementation(async (data: Buffer) => {
      files.data = data;
    }),
    readLogoFile: vi.fn(async () => files.data),
    removeLogoFile: files.remove.mockImplementation(async () => {
      files.data = null;
    }),
  };
});

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);

function input(overrides: Partial<SaveCompanyProfileInput> = {}): SaveCompanyProfileInput {
  return {
    name: "Test Co., Ltd.",
    taxId: "0105555000000",
    contactName: "Contact",
    phone: { country: "TH", e164: "+66812345678" },
    email: "admin@example.com",
    website: "",
    address: "1 Road",
    address2: "",
    countryCode: "TH",
    state: "Bangkok",
    city: "Bangkok",
    postcode: "10110",
    currencyCode: "THB",
    bankDetails: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bank" }] }] },
    showBankDetailsOnInvoice: true,
    terms: null,
    showTermsOnInvoice: false,
    expectedVersion: null,
    ...overrides,
  };
}

/** Partner envelope code and HTTP status of a thrown partner exception. */
async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: { path: string }[] } };
      return { status: error.getStatus(), code: body.error.code, paths: (body.error.fieldErrors ?? []).map((item) => item.path) };
    }
    throw error;
  }
  throw new Error("expected the call to fail");
}

let service: CompanyProfileService;

beforeEach(() => {
  db.row = null;
  db.failCreateWith = null;
  files.data = null;
  files.replace.mockClear();
  files.remove.mockClear();
  service = new CompanyProfileService();
});

describe("get and options", () => {
  it("UT-CP-P40 returns null before the first save", async () => {
    expect(await service.get()).toEqual({ profile: null });
  });

  it("UT-CP-P41 returns the shared reference lists", () => {
    const options = service.options();
    expect(options.currencies.some((item) => item.code === "THB")).toBe(true);
    expect(options.countries.some((item) => item.code === "TH")).toBe(true);
  });
});

describe("save", () => {
  it("UT-CP-P42 creates the single row on the first save with version 1 and the actor", async () => {
    const { profile } = await service.save("user-1", input());
    expect(profile).toMatchObject({ name: "Test Co., Ltd.", phone: { country: "TH", e164: "+66812345678" }, version: 1, updatedBy: "user-1", logo: null });
    expect(db.row).toMatchObject({ id: 1, phoneCountry: "TH", phoneE164: "+66812345678" });
  });

  it("UT-CP-P43 stores an empty rich text as database null", async () => {
    await service.save("user-1", input({ bankDetails: null }));
    expect(db.row?.bankDetails).not.toBeNull();
    expect(String(db.row?.bankDetails)).toContain("DbNull");
    const { profile } = await service.get();
    expect(profile?.bankDetails).not.toBeUndefined();
  });

  it("UT-CP-P44 answers CONFLICT for a second first save", async () => {
    await service.save("user-1", input());
    expect(await failure(service.save("user-2", input()))).toMatchObject({ status: 409, code: "CONFLICT" });
  });

  it("UT-CP-P45 updates with the current version and increments it", async () => {
    await service.save("user-1", input());
    const { profile } = await service.save("user-2", input({ name: "Renamed", expectedVersion: 1 }));
    expect(profile).toMatchObject({ name: "Renamed", version: 2, updatedBy: "user-2" });
  });

  it("UT-CP-P46 answers CONFLICT for a stale version and keeps the row", async () => {
    await service.save("user-1", input());
    expect(await failure(service.save("user-2", input({ name: "Stale", expectedVersion: 5 })))).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(db.row?.name).toBe("Test Co., Ltd.");
  });

  it("UT-CP-P47 answers COMPANY_PROFILE_NOT_FOUND when updating before the first save", async () => {
    expect(await failure(service.save("user-1", input({ expectedVersion: 1 })))).toMatchObject({ status: 404, code: "COMPANY_PROFILE_NOT_FOUND" });
  });

  it("UT-CP-P48 rejects a country or currency outside the reference lists", async () => {
    expect(await failure(service.save("user-1", input({ countryCode: "ZZ", currencyCode: "ZZZ" })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", paths: ["countryCode", "currencyCode"] });
    expect(db.row).toBeNull();
  });

  it("UT-CP-P49 maps a database outage to PARTNER_UNAVAILABLE", async () => {
    db.failCreateWith = Object.assign(new Error("db down"), { code: "P1001" });
    expect(await failure(service.save("user-1", input()))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("logo", () => {
  beforeEach(async () => {
    await service.save("user-1", input());
  });

  it("UT-CP-P50 stores a valid PNG, records its metadata and increments the version", async () => {
    const { profile } = await service.putLogo("user-1", 1, "image/png", png);
    const sha = createHash("sha256").update(png).digest("hex");
    expect(files.replace).toHaveBeenCalledWith(png);
    expect(profile).toMatchObject({ version: 2, logo: { version: sha.slice(0, 16), contentType: "image/png", sizeBytes: png.length } });
  });

  it("UT-CP-P51 overwrites the logo on a second upload", async () => {
    await service.putLogo("user-1", 1, "image/png", png);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const { profile } = await service.putLogo("user-1", 2, "image/jpeg", jpeg);
    expect(files.data).toEqual(jpeg);
    expect(profile.logo).toMatchObject({ contentType: "image/jpeg", sizeBytes: jpeg.length });
  });

  it.each([
    ["an unsupported type", "image/gif", Buffer.from("GIF89a")],
    ["bytes that do not match the type", "image/jpeg", png],
    ["an empty file", "image/png", Buffer.alloc(0)],
  ])("UT-CP-P52 rejects %s with 415 and writes nothing", async (_label, type, data) => {
    expect(await failure(service.putLogo("user-1", 1, type, data))).toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(files.replace).not.toHaveBeenCalled();
  });

  it("UT-CP-P53 rejects a file over 10 MB with 413", async () => {
    const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)]);
    expect(await failure(service.putLogo("user-1", 1, "image/png", big))).toMatchObject({ status: 413, code: "PAYLOAD_TOO_LARGE" });
  });

  it("UT-CP-P54 answers CONFLICT for a stale version without touching the file", async () => {
    expect(await failure(service.putLogo("user-1", 9, "image/png", png))).toMatchObject({ status: 409, code: "CONFLICT" });
    expect(files.replace).not.toHaveBeenCalled();
  });

  it("UT-CP-P55 serves the stored bytes with their type and version", async () => {
    await service.putLogo("user-1", 1, "image/png", png);
    const logo = await service.getLogo();
    expect(logo.data).toEqual(png);
    expect(logo.contentType).toBe("image/png");
    expect(logo.version).toHaveLength(16);
  });

  it("UT-CP-P56 answers COMPANY_LOGO_NOT_FOUND without metadata or when the file is missing", async () => {
    expect(await failure(service.getLogo())).toMatchObject({ status: 404, code: "COMPANY_LOGO_NOT_FOUND" });
    await service.putLogo("user-1", 1, "image/png", png);
    files.data = null;
    expect(await failure(service.getLogo())).toMatchObject({ status: 404, code: "COMPANY_LOGO_NOT_FOUND" });
  });

  it("UT-CP-P57 removes the file and clears the metadata", async () => {
    await service.putLogo("user-1", 1, "image/png", png);
    const { profile } = await service.removeLogo("user-1", 2);
    expect(files.remove).toHaveBeenCalled();
    expect(profile).toMatchObject({ version: 3, logo: null });
  });
});

describe("logo before the first save", () => {
  it("UT-CP-P58 answers COMPANY_PROFILE_NOT_FOUND", async () => {
    expect(await failure(service.putLogo("user-1", 1, "image/png", png))).toMatchObject({ status: 404, code: "COMPANY_PROFILE_NOT_FOUND" });
    expect(await failure(service.removeLogo("user-1", 1))).toMatchObject({ status: 404, code: "COMPANY_PROFILE_NOT_FOUND" });
  });
});
