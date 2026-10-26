import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeCursor } from "../../src/common/cursor";
import { READ_TX, WRITE_TX } from "../../src/common/persistence";
import { COUNTRY_OPTIONS } from "../../src/common/reference-data";
import { Prisma } from "../../src/generated/prisma/client";
import { VendorService } from "../../src/vendor/vendor.service";
import { createVendorBodySchema, updateVendorBodySchema } from "../../src/vendor/vendor.schemas";
import { EXPECTED, failure, invoiceAddress, vendorBody, withVersion } from "../partner-shared/fixtures";
import { fake, prismaError, resetFake, seedRow } from "../partner-shared/prisma-fake";

/** UT-VEN-P20…P42: VendorService against the in-memory Prisma stand-in (`test/partner-shared/prisma-fake.ts`). */

vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);

const ACTOR = "user-1";
const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const create = (overrides: Record<string, unknown> = {}) => createVendorBodySchema.parse(vendorBody(overrides));
const update = (overrides: Record<string, unknown> = {}, expected = EXPECTED) => updateVendorBodySchema.parse(withVersion(vendorBody(overrides), expected));

let service: VendorService;

beforeEach(() => {
  resetFake();
  service = new VendorService();
});

const stored = (id: string) => fake.tables.vendor.get(id)!;
const defaults = (id: string) => stored(id).addresses.map((row) => row.isDefault);

describe("options", () => {
  it("UT-VEN-P20 lists every currency from the currency master and the shared countries (currency SA-CUR-05)", async () => {
    const options = await service.options();
    expect(options.currencies.map((item) => item.code)).toEqual(["EUR", "INR", "THB", "USD"]);
    expect(options.currencies.find((item) => item.code === "INR")).toEqual({ code: "INR", name: "Indian Rupee", active: false });
    expect(options.countries).toBe(COUNTRY_OPTIONS);
  });
});

describe("currency master (currency SA-CUR-05)", () => {
  it("UT-VEN-CUR1 rejects an inactive currency on create and keeps the stored inactive one on update", async () => {
    expect(await failure(service.create(ACTOR, create({ currencyCode: "INR" })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
    const row = seedRow("vendor", { id: ID, currencyCode: "INR", updatedAt: new Date(EXPECTED) });
    await expect(service.update(ACTOR, ID, update({ currencyCode: "INR" }, row.updatedAt.toISOString()))).resolves.toMatchObject({ id: ID });
    fake.tables.vendor.get(ID)!.currencyCode = "THB";
    const current = fake.tables.vendor.get(ID)!.updatedAt.toISOString();
    expect(await failure(service.update(ACTOR, ID, update({ currencyCode: "INR" }, current)))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
  });
});

describe("create", () => {
  it("UT-VEN-P21 writes scalars with database-lowered keys, the actor and positioned invoice addresses in a bounded transaction", async () => {
    const result = await service.create(ACTOR, create({ name: "Gem Supply", code: "V-01", invoiceAddresses: [invoiceAddress({ name: "A", taxId: "0105", isDefault: true }), invoiceAddress({ name: "B" })] }));
    expect(result).toEqual({ id: expect.any(String), updatedAt: expect.stringMatching(/Z$/) });
    expect(stored(result.id)).toMatchObject({ nameKey: "gem supply", code: "V-01", codeKey: "v-01", createdBy: ACTOR, updatedBy: ACTOR });
    expect(stored(result.id).addresses.map(({ position, name, taxId, isDefault, type }) => ({ position, name, taxId, isDefault, type }))).toEqual([
      { position: 1, name: "A", taxId: "0105", isDefault: true, type: undefined },
      { position: 2, name: "B", taxId: null, isDefault: false, type: undefined },
    ]);
    expect(fake.transactionOptions).toEqual([WRITE_TX]);
  });

  it("UT-VEN-P22 stores zero defaults as zero (nothing is promoted)", async () => {
    const { id } = await service.create(ACTOR, create({ invoiceAddresses: [invoiceAddress(), invoiceAddress()] }));
    expect(defaults(id)).toEqual([false, false]);
  });

  it("UT-VEN-P23 stores one default exactly where it was sent", async () => {
    const { id } = await service.create(ACTOR, create({ invoiceAddresses: [invoiceAddress(), invoiceAddress(), invoiceAddress({ isDefault: true })] }));
    expect(defaults(id)).toEqual([false, false, true]);
  });

  it("UT-VEN-P24 rejects unknown currency/country before any write", async () => {
    expect(await failure(service.create(ACTOR, create({ currencyCode: "ZZZ", invoiceAddresses: [invoiceAddress(), invoiceAddress({ countryCode: "ZZ" })] })))).toEqual({
      status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }, { path: "invoiceAddresses.1.countryCode", code: "unknown" }],
    });
    expect(fake.tables.vendor.size).toBe(0);
  });

  it("UT-VEN-P25 answers VENDOR_CODE_TAKEN for a duplicate code ignoring case", async () => {
    await service.create(ACTOR, create({ code: "V001" }));
    expect(await failure(service.create(ACTOR, create({ code: "v001" })))).toEqual({ status: 409, code: "VENDOR_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] });
  });

  it("UT-VEN-P26 maps an expired transaction to 503", async () => {
    fake.failWith = prismaError("P2028");
    expect(await failure(service.create(ACTOR, create()))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("get", () => {
  it("UT-VEN-P27 returns the detail with invoice addresses ordered by position and no shipping key", async () => {
    const row = seedRow("vendor", {
      code: "V001",
      addresses: [
        { id: "b", position: 2, name: "B", taxId: null, address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: false },
        { id: "a", position: 1, name: "A", taxId: "0105", address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: false },
      ],
    });
    const detail = await service.get(row.id);
    expect(Object.keys(detail)).toEqual(["id", "name", "code", "active", "updatedAt", "currencyCode", "firstName", "middleName", "lastName", "phone", "email", "invoiceAddresses", "createdAt"]);
    expect(detail.invoiceAddresses.map((item) => [item.id, item.position, item.taxId, item.isDefault])).toEqual([["a", 1, "0105", false], ["b", 2, null, false]]);
    expect(detail.phone).toBeNull();
  });

  it("UT-VEN-P28 answers 404 VENDOR_NOT_FOUND", async () => {
    expect(await failure(service.get(ID))).toEqual({ status: 404, code: "VENDOR_NOT_FOUND", fieldErrors: [] });
  });
});

describe("list", () => {
  const row = (n: number) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, name: `Vendor ${n}`, nameKey: `vendor ${n}`, code: `V00${n}`, active: n % 2 === 0, updatedAt: new Date("2026-10-16T00:00:00.000Z") });
  const listSql = () => {
    const call = fake.raw.find((entry) => entry.text.includes('AS "nameKey"'))!;
    return Prisma.sql(call.strings, ...call.values);
  };

  it("UT-VEN-P29 reads the vendor table with the standard keyset page", async () => {
    fake.listRows = [row(1), row(2), row(3)];
    fake.total = 3;
    const page = await service.list({ limit: 2 });
    expect(page.items).toEqual([
      { id: row(1).id, name: "Vendor 1", code: "V001", active: false, updatedAt: "2026-10-16T00:00:00.000Z" },
      { id: row(2).id, name: "Vendor 2", code: "V002", active: true, updatedAt: "2026-10-16T00:00:00.000Z" },
    ]);
    expect(decodeCursor(page.nextCursor!)).toEqual({ nameKey: "vendor 2", id: row(2).id });
    expect(page.total).toBe(3);
    expect(listSql().sql).toContain('FROM "partner"."vendor"');
    expect(fake.transactionOptions).toEqual([READ_TX]);
  });

  it("UT-VEN-P30 searches name or code and filters active=true", async () => {
    await service.list({ q: "V0", active: "true" });
    expect(listSql().values).toEqual(["%V0%", "%V0%", true, 51]);
  });

  it("UT-VEN-P31 rejects a malformed cursor and maps outages", async () => {
    expect(await failure(service.list({ cursor: "abc" }))).toMatchObject({ status: 400, fieldErrors: [{ path: "cursor", code: "invalid" }] });
    fake.failWith = prismaError("P1001");
    expect(await failure(service.list({}))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("update", () => {
  it("UT-VEN-P32 replaces scalars and addresses (new IDs, positions from order, defaults as sent)", async () => {
    const before = await service.create(ACTOR, create({ invoiceAddresses: [invoiceAddress({ isDefault: true })] }));
    const oldIds = stored(before.id).addresses.map((item) => item.id);
    const result = await service.update("user-2", before.id, update({ name: "Renamed", invoiceAddresses: [invoiceAddress({ name: "X" }), invoiceAddress({ name: "Y" })] }, before.updatedAt));
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
    expect(stored(before.id)).toMatchObject({ name: "Renamed", updatedBy: "user-2", createdBy: ACTOR });
    expect(stored(before.id).addresses.map(({ id, position, name, isDefault }) => ({ old: oldIds.includes(id), position, name, isDefault }))).toEqual([
      { old: false, position: 1, name: "X", isDefault: false },
      { old: false, position: 2, name: "Y", isDefault: false },
    ]);
  });

  it("UT-VEN-P33 answers 409 VENDOR_STALE for a stale version and changes nothing", async () => {
    const before = await service.create(ACTOR, create());
    const snapshot = structuredClone(stored(before.id));
    expect(await failure(service.update(ACTOR, before.id, update({ name: "Stale" }, "2020-01-01T00:00:00.000Z")))).toEqual({ status: 409, code: "VENDOR_STALE", fieldErrors: [] });
    expect(stored(before.id)).toEqual(snapshot);
  });

  it("UT-VEN-P34 answers 404 VENDOR_NOT_FOUND for an unknown id", async () => {
    expect(await failure(service.update(ACTOR, ID, update()))).toEqual({ status: 404, code: "VENDOR_NOT_FOUND", fieldErrors: [] });
  });

  it("UT-VEN-P35 keeps a stored legacy country valid on update", async () => {
    const row = seedRow("vendor", { currencyCode: "THB", addresses: [{ id: "a", position: 1, countryCode: "ZZ", isDefault: false }] });
    await expect(service.update(ACTOR, row.id, update({ code: "S-1", invoiceAddresses: [invoiceAddress({ countryCode: "ZZ" })] }, row.updatedAt.toISOString()))).resolves.toMatchObject({ id: row.id });
    expect(await failure(service.update(ACTOR, row.id, update({ invoiceAddresses: [invoiceAddress({ countryCode: "YY" })] }, stored(row.id).updatedAt.toISOString())))).toMatchObject({
      status: 400, fieldErrors: [{ path: "invoiceAddresses.0.countryCode", code: "unknown" }],
    });
  });

  it("UT-VEN-P36 answers VENDOR_CODE_TAKEN when renaming onto another vendor's code and rolls back", async () => {
    await service.create(ACTOR, create({ code: "V001" }));
    const second = await service.create(ACTOR, create({ code: "V002" }));
    const snapshot = structuredClone(stored(second.id));
    expect(await failure(service.update(ACTOR, second.id, update({ code: " V001 " }, second.updatedAt)))).toMatchObject({ status: 409, code: "VENDOR_CODE_TAKEN" });
    expect(stored(second.id)).toEqual(snapshot);
  });
});

describe("delete", () => {
  it("UT-VEN-P37 deletes once (always allowed), then answers 404", async () => {
    const { id } = await service.create(ACTOR, create());
    await expect(service.delete(ACTOR, id)).resolves.toEqual({ ok: true });
    expect(await failure(service.delete(ACTOR, id))).toEqual({ status: 404, code: "VENDOR_NOT_FOUND", fieldErrors: [] });
  });

  it("UT-VEN-P38 maps a P2025 on delete to 404 and a connection loss to 503", async () => {
    fake.failWith = prismaError("P2025");
    expect(await failure(service.delete(ACTOR, ID))).toMatchObject({ status: 404, code: "VENDOR_NOT_FOUND" });
    fake.failWith = prismaError("P1002");
    expect(await failure(service.delete(ACTOR, ID))).toMatchObject({ status: 503 });
  });
});

describe("nextCode", () => {
  it("UT-VEN-P39 formats V + at least three digits from the vendor table aggregate", async () => {
    fake.nextValue = "42";
    await expect(service.nextCode()).resolves.toEqual({ code: "V042" });
    const call = fake.raw.find((entry) => entry.text.includes("COALESCE(max"))!;
    const sql = Prisma.sql(call.strings, ...call.values);
    expect(sql.sql).toContain('FROM "partner"."vendor"');
    expect(sql.values).toEqual(["^[Vv][0-9]+$", 18]);
  });

  it("UT-VEN-P40 maps an outage on nextCode to 503", async () => {
    fake.failWith = prismaError("P1008");
    expect(await failure(service.nextCode())).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});
