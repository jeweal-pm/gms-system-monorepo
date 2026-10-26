import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor } from "../../src/common/cursor";
import { READ_TX, WRITE_TX } from "../../src/common/persistence";
import { COUNTRY_OPTIONS } from "../../src/common/reference-data";
import { createCustomerBodySchema, updateCustomerBodySchema } from "../../src/customer/customer.schemas";
import { CustomerService } from "../../src/customer/customer.service";
import { Prisma } from "../../src/generated/prisma/client";
import { address, customerBody, EXPECTED, failure, invoiceAddress, withVersion } from "../partner-shared/fixtures";
import { fake, prismaError, resetFake, seedRow } from "../partner-shared/prisma-fake";

/**
 * UT-CUS-P20…P47: CustomerService against the in-memory Prisma stand-in (`test/partner-shared/prisma-fake.ts`;
 * the persistence boundary is mocked as in company-profile; SQL is covered by the opt-in live tests).
 */

vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);

const ACTOR = "user-1";
const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";
const create = (overrides: Record<string, unknown> = {}) => createCustomerBodySchema.parse(customerBody(overrides));
const update = (overrides: Record<string, unknown> = {}, expected = EXPECTED) => updateCustomerBodySchema.parse(withVersion(customerBody(overrides), expected));

let service: CustomerService;

beforeEach(() => {
  resetFake();
  vi.useRealTimers();
  service = new CustomerService();
});

const stored = (id: string) => fake.tables.customer.get(id)!;
const defaults = (id: string, type: "INVOICE" | "SHIPPING") => stored(id).addresses.filter((row) => row.type === type).map((row) => row.isDefault);

describe("options", () => {
  it("UT-CUS-P20 lists every currency from the currency master and the shared countries (currency SA-CUR-05)", async () => {
    const options = await service.options();
    expect(options.currencies.map((item) => item.code)).toEqual(["EUR", "INR", "THB", "USD"]);
    expect(options.currencies.find((item) => item.code === "INR")).toEqual({ code: "INR", name: "Indian Rupee", active: false });
    expect(options.countries).toBe(COUNTRY_OPTIONS);
  });
});

describe("currency master (currency SA-CUR-05)", () => {
  it("UT-CUS-CUR1 rejects an inactive currency on create and keeps the stored inactive one on update", async () => {
    expect(await failure(service.create(ACTOR, create({ currencyCode: "INR" })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
    const row = seedRow("customer", { id: ID, currencyCode: "INR", updatedAt: new Date(EXPECTED) });
    await expect(service.update(ACTOR, ID, update({ currencyCode: "INR" }, row.updatedAt.toISOString()))).resolves.toMatchObject({ id: ID });
    fake.tables.customer.get(ID)!.currencyCode = "THB";
    const current = fake.tables.customer.get(ID)!.updatedAt.toISOString();
    expect(await failure(service.update(ACTOR, ID, update({ currencyCode: "INR" }, current)))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
  });
});

describe("create", () => {
  it("UT-CUS-P21 writes the customer with keys from PostgreSQL lower(), actor and addresses inside a bounded transaction", async () => {
    const result = await service.create(ACTOR, create({ name: "Acme Co", code: "C-0001", phone: { country: "TH", e164: "+66812345678" } }));
    expect(result).toEqual({ id: expect.any(String), updatedAt: expect.stringMatching(/Z$/) });
    expect(stored(result.id)).toMatchObject({
      name: "Acme Co", nameKey: "acme co", code: "C-0001", codeKey: "c-0001", email: "ann@example.com",
      phoneE164: "+66812345678", phoneCountry: "TH", createdBy: ACTOR, updatedBy: ACTOR,
    });
    expect(stored(result.id).createdAt).toEqual(stored(result.id).updatedAt);
    expect(fake.transactionOptions).toEqual([WRITE_TX]);
    expect(WRITE_TX.timeout).toBeLessThan(5_000);
  });

  it("UT-CUS-P22 derives type and position; only invoice addresses keep a tax ID", async () => {
    const { id } = await service.create(ACTOR, create({
      invoiceAddresses: [invoiceAddress({ name: "I1", taxId: "0105" }), invoiceAddress({ name: "I2", isDefault: true })],
      shippingAddresses: [address({ name: "S1", isDefault: true })],
    }));
    const rows = stored(id).addresses.map(({ type, position, name, taxId, isDefault }) => ({ type, position, name, taxId, isDefault }));
    expect(rows).toEqual([
      { type: "INVOICE", position: 1, name: "I1", taxId: "0105", isDefault: false },
      { type: "INVOICE", position: 2, name: "I2", taxId: null, isDefault: true },
      { type: "SHIPPING", position: 1, name: "S1", taxId: null, isDefault: true },
    ]);
  });

  it("UT-CUS-P23 sets the first address of a type as default when none is marked (exactly one per type)", async () => {
    const { id } = await service.create(ACTOR, create({ invoiceAddresses: [invoiceAddress(), invoiceAddress(), invoiceAddress()], shippingAddresses: [address(), address()] }));
    expect(defaults(id, "INVOICE")).toEqual([true, false, false]);
    expect(defaults(id, "SHIPPING")).toEqual([true, false]);
  });

  it("UT-CUS-P24 keeps a marked default and does not add the first one", async () => {
    const { id } = await service.create(ACTOR, create({ invoiceAddresses: [invoiceAddress(), invoiceAddress({ isDefault: true })], shippingAddresses: [address(), address(), address({ isDefault: true })] }));
    expect(defaults(id, "INVOICE")).toEqual([false, true]);
    expect(defaults(id, "SHIPPING")).toEqual([false, false, true]);
  });

  it("UT-CUS-P25 rejects currency/country outside the reference lists before any write", async () => {
    const result = await failure(service.create(ACTOR, create({ currencyCode: "ZZZ", shippingAddresses: [address({ countryCode: "ZZ" })] })));
    expect(result).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }, { path: "shippingAddresses.0.countryCode", code: "unknown" }] });
    expect(fake.tables.customer.size).toBe(0);
    expect(fake.transactionOptions).toEqual([]);
  });

  it("UT-CUS-P26 answers CUSTOMER_CODE_TAKEN for a code that differs only by case (code_key unique)", async () => {
    await service.create(ACTOR, create({ code: "C001" }));
    expect(await failure(service.create(ACTOR, create({ code: " c001 " })))).toEqual({ status: 409, code: "CUSTOMER_CODE_TAKEN", fieldErrors: [{ path: "code", code: "duplicate" }] });
    expect(fake.tables.customer.size).toBe(1);
  });

  it("UT-CUS-P27 maps a database outage to 503 PARTNER_UNAVAILABLE", async () => {
    fake.failWith = prismaError("P1001");
    expect(await failure(service.create(ACTOR, create()))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("get", () => {
  it("UT-CUS-P28 returns the detail in contract shape with addresses split by type and ordered by position", async () => {
    const row = seedRow("customer", {
      name: "Acme", code: "C001", phoneE164: "+66812345678", phoneCountry: "TH",
      addresses: [
        { id: "s2", type: "SHIPPING", position: 2, name: "S2", taxId: null, address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: false },
        { id: "i1", type: "INVOICE", position: 1, name: "I1", taxId: "0105", address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: true },
        { id: "s1", type: "SHIPPING", position: 1, name: "S1", taxId: null, address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: true },
      ],
    });
    const detail = await service.get(row.id);
    expect(Object.keys(detail)).toEqual(["id", "name", "code", "active", "updatedAt", "currencyCode", "firstName", "middleName", "lastName", "phone", "email", "invoiceAddresses", "shippingAddresses", "createdAt"]);
    expect(detail).toMatchObject({ id: row.id, code: "C001", phone: { country: "TH", e164: "+66812345678" }, updatedAt: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(detail.invoiceAddresses).toEqual([{ id: "i1", position: 1, name: "I1", address: "a", countryCode: "TH", state: "s", city: "c", postcode: "1", isDefault: true, taxId: "0105" }]);
    expect(detail.shippingAddresses.map((item) => item.id)).toEqual(["s1", "s2"]);
    expect(detail.shippingAddresses[0]).not.toHaveProperty("taxId");
  });

  it("UT-CUS-P29 returns phone null unless both phone columns are set", async () => {
    const row = seedRow("customer", { phoneE164: "+66812345678", phoneCountry: null });
    expect((await service.get(row.id)).phone).toBeNull();
  });

  it("UT-CUS-P30 answers 404 CUSTOMER_NOT_FOUND for an unknown id", async () => {
    expect(await failure(service.get("0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e"))).toEqual({ status: 404, code: "CUSTOMER_NOT_FOUND", fieldErrors: [] });
  });

  it("UT-CUS-P31 maps a pool timeout to 503", async () => {
    fake.failWith = new Error("timeout exceeded when trying to connect");
    expect(await failure(service.get("0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e"))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("list", () => {
  const row = (n: number) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, name: `Acme ${n}`, nameKey: `acme ${n}`, code: `C00${n}`, active: true, updatedAt: new Date("2026-10-16T01:02:03.456Z") });
  const listCall = () => fake.raw.find((call) => call.text.includes('AS "nameKey"'))!;
  const countCall = () => fake.raw.find((call) => call.text.includes("count(*)"))!;
  const sqlOf = (call: { strings: readonly string[]; values: unknown[] }) => Prisma.sql(call.strings, ...call.values);

  it("UT-CUS-P32 returns the first page with total, no cursor when nothing follows, in a read-only repeatable-read transaction", async () => {
    fake.listRows = [row(1), row(2)];
    fake.total = 2;
    const page = await service.list({});
    expect(page).toEqual({
      items: [
        { id: row(1).id, name: "Acme 1", code: "C001", active: true, updatedAt: "2026-10-16T01:02:03.456Z" },
        { id: row(2).id, name: "Acme 2", code: "C002", active: true, updatedAt: "2026-10-16T01:02:03.456Z" },
      ],
      nextCursor: null,
      total: 2,
    });
    expect(fake.executed).toEqual(["SET TRANSACTION READ ONLY"]);
    expect(fake.transactionOptions).toEqual([READ_TX]);
    expect(READ_TX.isolationLevel).toBe("RepeatableRead");
    const sql = sqlOf(listCall());
    expect(sql.sql).toContain('FROM "partner"."customer"');
    expect(sql.sql).toContain('ORDER BY "name_key" ASC, "id" ASC');
    expect(sql.values).toEqual([51]);
  });

  it("UT-CUS-P33 reads limit + 1 rows and returns a cursor from the last item of the page", async () => {
    fake.listRows = [row(1), row(2), row(3)];
    fake.total = 7;
    const page = await service.list({ limit: 2 });
    expect(page.items.map((item) => item.name)).toEqual(["Acme 1", "Acme 2"]);
    expect(page.total).toBe(7);
    expect(decodeCursor(page.nextCursor!)).toEqual({ nameKey: "acme 2", id: row(2).id });
    expect(sqlOf(listCall()).values).toEqual([3]);
  });

  it("UT-CUS-P34 continues after the cursor (keyset) while the total ignores it", async () => {
    const cursor = encodeCursor({ nameKey: "acme 2", id: row(2).id });
    await service.list({ cursor, limit: 2 });
    const list = sqlOf(listCall());
    expect(list.sql).toContain('("name_key", "id") > (');
    expect(list.values).toEqual(["acme 2", row(2).id, 3]);
    expect(sqlOf(countCall()).sql).not.toContain('"name_key", "id"');
  });

  it("UT-CUS-P35 searches name OR code with ILIKE, escaping % and _, and filters active", async () => {
    await service.list({ q: "50%_off", active: "false" });
    const list = sqlOf(listCall());
    expect(list.sql).toContain('("name" ILIKE');
    expect(list.sql).toContain('OR "code" ILIKE');
    expect(list.sql).toContain('"active" =');
    expect(list.values).toEqual(["%50\\%\\_off%", "%50\\%\\_off%", false, 51]);
    expect(sqlOf(countCall()).values).toEqual(["%50\\%\\_off%", "%50\\%\\_off%", false]);
  });

  it("UT-CUS-P36 rejects an invalid cursor with 400 before reading", async () => {
    expect(await failure(service.list({ cursor: "!!" }))).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "cursor", code: "invalid" }] });
    expect(fake.raw).toEqual([]);
  });

  it("UT-CUS-P37 accepts timestamp text from the raw query and maps outages to 503", async () => {
    fake.listRows = [{ ...row(1), updatedAt: "2026-10-16 01:02:03.456" }];
    expect((await service.list({})).items[0].updatedAt).toBe("2026-10-16T01:02:03.456Z");
    fake.failWith = prismaError("P2024");
    expect(await failure(service.list({}))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("update", () => {
  async function created() {
    const result = await service.create(ACTOR, create({ code: "C001", invoiceAddresses: [invoiceAddress({ isDefault: true }), invoiceAddress()], shippingAddresses: [address({ isDefault: true })] }));
    return { id: result.id, updatedAt: result.updatedAt, addressIds: stored(result.id).addresses.map((item) => item.id) };
  }

  it("UT-CUS-P38 replaces scalars and the whole address set with the current version and moves the version forward", async () => {
    const before = await created();
    const result = await service.update("user-2", before.id, update({ name: "Renamed", code: "C001", invoiceAddresses: [invoiceAddress({ name: "New" })], shippingAddresses: [address(), address({ isDefault: true })] }, before.updatedAt));
    expect(result.id).toBe(before.id);
    expect(new Date(result.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
    expect(stored(before.id)).toMatchObject({ name: "Renamed", nameKey: "renamed", updatedBy: "user-2", createdBy: ACTOR });
    const ids = stored(before.id).addresses.map((item) => item.id);
    expect(ids.filter((id) => before.addressIds.includes(id))).toEqual([]);
    expect(stored(before.id).addresses.map(({ type, position, name }) => ({ type, position, name }))).toEqual([
      { type: "INVOICE", position: 1, name: "New" },
      { type: "SHIPPING", position: 1, name: "HQ" },
      { type: "SHIPPING", position: 2, name: "HQ" },
    ]);
    expect(defaults(before.id, "INVOICE")).toEqual([true]);
    expect(defaults(before.id, "SHIPPING")).toEqual([false, true]);
  });

  it("UT-CUS-P39 uses expected + 1 ms when the clock is behind the stored version", async () => {
    const before = await created();
    const future = "2099-01-01T00:00:00.000Z";
    stored(before.id).updatedAt = new Date(future);
    const result = await service.update(ACTOR, before.id, update({}, future));
    expect(result.updatedAt).toBe("2099-01-01T00:00:00.001Z");
  });

  it("UT-CUS-P40 answers 409 CUSTOMER_STALE for a stale expectedUpdatedAt and changes nothing", async () => {
    const before = await created();
    const snapshot = structuredClone(stored(before.id));
    expect(await failure(service.update(ACTOR, before.id, update({ name: "Stale" }, "2020-01-01T00:00:00.000Z")))).toEqual({ status: 409, code: "CUSTOMER_STALE", fieldErrors: [] });
    expect(stored(before.id)).toEqual(snapshot);
  });

  it("UT-CUS-P41 answers 404 CUSTOMER_NOT_FOUND for an unknown id", async () => {
    expect(await failure(service.update(ACTOR, "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e", update()))).toEqual({ status: 404, code: "CUSTOMER_NOT_FOUND", fieldErrors: [] });
  });

  it("UT-CUS-P42 answers 404 when the row disappears between read and write", async () => {
    const before = await created();
    const { prisma } = await import("../partner-shared/prisma-fake");
    vi.mocked(prisma.customer.updateMany).mockImplementationOnce(async () => {
      fake.tables.customer.delete(before.id);
      return { count: 0 };
    });
    expect(await failure(service.update(ACTOR, before.id, update({}, before.updatedAt)))).toMatchObject({ status: 404, code: "CUSTOMER_NOT_FOUND" });
  });

  it("UT-CUS-P43 keeps a stored legacy currency/country valid but rejects a new unknown one", async () => {
    const row = seedRow("customer", { currencyCode: "ZZZ", addresses: [{ id: "a", type: "INVOICE", position: 1, countryCode: "ZZ", isDefault: true }] });
    const version = row.updatedAt.toISOString();
    await expect(service.update(ACTOR, row.id, update({ code: "S-1", currencyCode: "ZZZ", invoiceAddresses: [invoiceAddress({ countryCode: "ZZ" })] }, version))).resolves.toMatchObject({ id: row.id });
    const next = stored(row.id).updatedAt.toISOString();
    expect(await failure(service.update(ACTOR, row.id, update({ currencyCode: "YYY" }, next)))).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "currencyCode", code: "unknown" }] });
  });

  it("UT-CUS-P44 answers CUSTOMER_CODE_TAKEN when renaming to another customer's code and rolls back", async () => {
    const first = await created();
    const second = await service.create(ACTOR, create({ code: "C002" }));
    const snapshot = structuredClone(stored(second.id));
    expect(await failure(service.update(ACTOR, second.id, update({ code: "c001" }, second.updatedAt)))).toMatchObject({ status: 409, code: "CUSTOMER_CODE_TAKEN" });
    expect(stored(second.id)).toEqual(snapshot);
    expect(stored(first.id).code).toBe("C001");
  });
});

describe("delete", () => {
  it("UT-CUS-P45 deletes once, then answers 404 CUSTOMER_NOT_FOUND", async () => {
    const { id } = await service.create(ACTOR, create());
    await expect(service.delete(ACTOR, id)).resolves.toEqual({ ok: true });
    expect(fake.tables.customer.has(id)).toBe(false);
    expect(await failure(service.delete(ACTOR, id))).toEqual({ status: 404, code: "CUSTOMER_NOT_FOUND", fieldErrors: [] });
  });

  it("UT-CUS-P46 maps a database outage on delete to 503", async () => {
    fake.failWith = prismaError("P1017");
    expect(await failure(service.delete(ACTOR, "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e"))).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
  });
});

describe("nextCode", () => {
  it("UT-CUS-P47 formats the next running number with the C prefix and a bounded pattern", async () => {
    fake.nextValue = "1";
    await expect(service.nextCode()).resolves.toEqual({ code: "C001" });
    fake.nextValue = "1000";
    await expect(service.nextCode()).resolves.toEqual({ code: "C1000" });
    const call = fake.raw.find((entry) => entry.text.includes("COALESCE(max"))!;
    const sql = Prisma.sql(call.strings, ...call.values);
    expect(sql.sql).toContain('FROM "partner"."customer"');
    expect(sql.values).toEqual(["^[Cc][0-9]+$", 18]);
  });

  it("UT-CUS-P48 maps a database outage on nextCode to 503 and a malformed aggregate to an error", async () => {
    fake.failWith = prismaError("P1001");
    expect(await failure(service.nextCode())).toMatchObject({ status: 503, code: "PARTNER_UNAVAILABLE" });
    fake.failWith = null;
    fake.nextValue = "0";
    await expect(service.nextCode()).rejects.toThrow("invalid running number");
  });
});
