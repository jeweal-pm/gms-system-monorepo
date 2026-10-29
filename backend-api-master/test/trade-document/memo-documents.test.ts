import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Static imports are fine: vi.mock calls are hoisted above them (CommonJS tsconfig).
import { documentListSchema } from "../../src/trade-document/document-engine";
import { MemoOutService } from "../../src/trade-document/memo-out.service";
import { MemoOutReturnService } from "../../src/trade-document/memo-out-return.service";
import { MemoReceiveService } from "../../src/trade-document/memo-receive.service";
import { MemoReturnService } from "../../src/trade-document/memo-return.service";
import { createMemoOutReturnSchema, createMemoOutSchema, createMemoReceiveSchema, createMemoReturnSchema, memoStockSchema } from "../../src/trade-document/memo-schemas";
import { Prisma } from "../../src/generated/prisma/client";

/**
 * UT-MO-B01…B09, B11: memo out / memo out return SA rev 1 (ADR-0033, owner 2026-10-28); UT-MR-B01…B05: memo receive /
 * memo return (memo-return SA rev 1, owner 2026-10-29) — the shared engine against a
 * mocked Prisma: Document Setup keys, party references and snapshots, server totals, version/draft guards,
 * list and options. Real SQL (row lock, CHECKs) is covered by the live checks.
 */

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CUSTOMER, SHIP, INVOICE, VENDOR, VADDR, STONE, NUMBERING, DOC] = [1, 2, 3, 4, 5, 6, 7, 8].map(ID);

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  numbering: null as null | { id: string; prefix: string; separator: string; start_no: number },
  maxRunning: null as number | null,
  customer: null as Row | null,
  vendor: null as Row | null,
  stoneCodes: [] as { id: string; active: boolean }[],
  companyCurrency: "THB" as string | null,
  stored: null as Row | null,
  writeCount: 1,
  rawSql: [] as { text: string; values: unknown[] }[],
  created: [] as { model: string; data: Row }[],
  updates: [] as Row[],
  lines: [] as { model: string; data: Row[] }[],
  charges: [] as Row[],
  findManyArgs: [] as Row[],
  /** Memo receive lines (Memo Stock) and the quantities other memo returns already took. */
  sources: [] as Row[],
  returned: [] as Row[],
  groupByArgs: [] as Row[],
  returnLineCount: 0,
}));

vi.mock("@gms/storage", () => ({
  uuidV7: (() => { let n = 100; return () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`; })(),
  createStorage: () => ({}),
  buildKey: () => "x",
}));

vi.mock("../../src/database/prisma-client", () => {
  const document = (model: string) => ({
    aggregate: vi.fn(async () => ({ _max: { runningNo: db.maxRunning } })),
    create: vi.fn(async ({ data }: { data: Row }) => { db.created.push({ model, data }); return data; }),
    findUnique: vi.fn(async () => db.stored),
    updateMany: vi.fn(async (args: Row) => { db.updates.push(args); return { count: db.writeCount }; }),
    deleteMany: vi.fn(async () => ({ count: db.writeCount })),
    findMany: vi.fn(async (args: Row) => { db.findManyArgs.push(args); return []; }),
    count: vi.fn(async () => 0),
  });
  const children = (model: string) => ({
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      if (model.endsWith("Charge")) db.charges.push(...data);
      else db.lines.push({ model, data });
      return { count: data.length };
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  });
  const empty = { findMany: vi.fn(async () => []) };
  const tx = {
    $queryRaw: vi.fn(async (sql: { strings: string[]; values: unknown[] }) => {
      db.rawSql.push({ text: sql.strings.join("?"), values: sql.values });
      return sql.strings.join("?").includes("document_numbering") && db.numbering ? [db.numbering] : [];
    }),
    customer: { findUnique: vi.fn(async () => db.customer), findMany: vi.fn(async () => []) },
    vendor: {
      findUnique: vi.fn(async () => db.vendor),
      findMany: vi.fn(async () => [{ id: VENDOR, code: "V001", name: "Bangkok Gems", active: true, currencyCode: "USD", addresses: [vendorAddress(VADDR)] }]),
    },
    stoneCode: { findMany: vi.fn(async (args?: { where?: { id?: unknown } }) => (args?.where?.id ? db.stoneCodes : [])) },
    stoneName: empty, stoneShape: empty, stoneSize: empty, stoneColor: empty, stoneClarity: empty, stoneCutting: empty, stoneQuality: empty,
    companyProfile: { findUnique: vi.fn(async () => (db.companyCurrency ? { currencyCode: db.companyCurrency } : null)) },
    documentSetup: { findUnique: vi.fn(async () => null) },
    currency: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({ THB: { active: true }, USD: { active: true }, EUR: { active: false } } as Record<string, { active: boolean }>)[where.code] ?? null),
      findMany: vi.fn(async () => [{ code: "EUR", name: "Euro", active: false }, { code: "THB", name: "Baht", active: true }]),
    },
    memoOut: document("memoOut"),
    memoOutLine: children("memoOutLine"),
    memoOutCharge: children("memoOutCharge"),
    memoOutReturn: document("memoOutReturn"),
    memoOutReturnLine: children("memoOutReturnLine"),
    memoOutReturnCharge: children("memoOutReturnCharge"),
    memoReceive: document("memoReceive"),
    memoReceiveLine: { ...children("memoReceiveLine"), findMany: vi.fn(async (args: Row) => { db.findManyArgs.push(args); return db.sources; }) },
    memoReceiveCharge: children("memoReceiveCharge"),
    memoReturn: document("memoReturn"),
    memoReturnLine: {
      ...children("memoReturnLine"),
      count: vi.fn(async () => db.returnLineCount),
      groupBy: vi.fn(async (args: Row) => { db.groupByArgs.push(args); return db.returned; }),
    },
    memoReturnCharge: children("memoReturnCharge"),
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
});

function customerAddress(id: string, type: "SHIPPING" | "INVOICE") {
  return { id, type, name: "Siam Gems", taxId: null, address: "919/1 Silom Rd", city: "Bang Rak", state: "Bangkok", postcode: "10500", countryCode: "TH", isDefault: true, position: 1 };
}
function vendorAddress(id: string) {
  return { id, name: "Bangkok Gems Co., Ltd.", taxId: "0105550000000", address: "88 Silom Rd", city: "Bang Rak", state: "Bangkok", postcode: "10500", countryCode: "TH", isDefault: true, position: 1 };
}

const shared = (patch: Row = {}) => ({
  docDate: "2026-10-28", dueDate: "2026-11-28", currency: "THB", exchangeRate: null, ref: "", documentNote: "",
  lines: [{
    source: "MANUAL", stoneCodeId: STONE, stoneCode: "RU-1", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
    lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.12", priceUnit: "PER_CT", unitPrice: "65000", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [],
  }],
  discount: { type: "NONE", value: "0" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [{ type: "SHIPPING", amount: "100" }], labor: null,
  ...patch,
});
const outInput = (patch: Row = {}) => createMemoOutSchema.parse({ ...shared(), customerId: CUSTOMER, shippingAddressId: SHIP, invoiceAddressId: INVOICE, ...patch });
const returnLine = (patch: Row = {}) => ({ ...shared().lines[0], outstandingPcs: 2, outstandingWeightCt: "2.5", ...patch });
const returnInput = (patch: Row = {}) => createMemoOutReturnSchema.parse({ ...shared(), lines: [returnLine()], vendorId: VENDOR, addressId: VADDR, ...patch });

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: { path: string }[] } };
      return { status: error.getStatus(), code: body.error.code, path: body.error.fieldErrors?.[0]?.path };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

const memoOut = new MemoOutService();
const memoOutReturn = new MemoOutReturnService();

beforeEach(() => {
  Object.assign(db, {
    numbering: { id: NUMBERING, prefix: "MO", separator: "-", start_no: 2609001 },
    maxRunning: null,
    customer: { code: "C001", name: "Siam Gems", active: true, addresses: [customerAddress(SHIP, "SHIPPING"), customerAddress(INVOICE, "INVOICE")] },
    vendor: { code: "V001", name: "Bangkok Gems", active: true, addresses: [vendorAddress(VADDR)] },
    stoneCodes: [{ id: STONE, active: true }],
    companyCurrency: "THB",
    stored: null,
    writeCount: 1,
    rawSql: [], created: [], updates: [], lines: [], charges: [], findManyArgs: [],
    sources: [], returned: [], groupByArgs: [], returnLineCount: 0,
  });
});

describe("schemas", () => {
  it("UT-MO-B01 memo lines can't carry photos; each document takes only its own party fields", () => {
    expect(createMemoOutSchema.safeParse({ ...outInput(), lines: [{ ...outInput().lines[0], photoIds: [STONE] }] }).success).toBe(false);
    expect(createMemoOutSchema.safeParse({ ...outInput(), vendorId: VENDOR }).success).toBe(false);
    expect(createMemoOutReturnSchema.safeParse({ ...returnInput(), customerId: CUSTOMER }).success).toBe(false);
    expect(createMemoOutReturnSchema.safeParse({ ...returnInput(), dueDate: "2026-10-01" }).success).toBe(false);
  });
});

describe("numbering from Document Setup (SA-MO-04)", () => {
  it("UT-MO-B02 memo out reads key memo-out under a row lock; first number = start no, then max + 1", async () => {
    await expect(memoOut.create("actor", outInput())).resolves.toMatchObject({ docNo: "MO-2609001", version: 1 });
    expect(db.rawSql[0].values[0]).toBe("memo-out");
    expect(db.rawSql[0].text).toContain("FOR UPDATE");
    expect(db.created[0]).toMatchObject({ model: "memoOut", data: { numberingId: NUMBERING, runningNo: 2609001, status: "DRAFT", createdBy: "actor" } });
    db.maxRunning = 2609004;
    await expect(memoOut.create("actor", outInput())).resolves.toMatchObject({ docNo: "MO-2609005" });
  });

  it("UT-MO-B03 memo out return reads key memo-out-return; no setup row → plain 1, 2, 3 under its own advisory lock", async () => {
    db.numbering = { id: NUMBERING, prefix: "MOR", separator: "", start_no: 1 };
    await expect(memoOutReturn.create("actor", returnInput())).resolves.toMatchObject({ docNo: "MOR1" });
    expect(db.rawSql[0].values[0]).toBe("memo-out-return");
    db.numbering = null;
    db.rawSql = [];
    await expect(memoOutReturn.nextNumber("2026-10-28")).resolves.toEqual({ docNo: "1" });
    await memoOutReturn.create("actor", returnInput());
    expect(db.rawSql.some((sql) => sql.text.includes("pg_advisory_xact_lock") && sql.values.includes("partner.memo_out_return.plain_running_no"))).toBe(true);
  });
});

describe("party references, snapshots and totals (SA-MO-05/06)", () => {
  it("UT-MO-B04 memo out stores the customer + both address snapshots and server totals", async () => {
    await memoOut.create("actor", outInput());
    const data = db.created[0].data;
    expect(data).toMatchObject({ customerId: CUSTOMER, customerCodeSnapshot: "C001", customerNameSnapshot: "Siam Gems", shippingAddressId: SHIP, invoiceAddressId: INVOICE });
    expect(String(data.shippingAddressSnapshot)).toContain("919/1 Silom Rd");
    expect(String(data.subtotal)).toBe("72800");
    expect(String(data.grandTotal)).toBe("77996"); // 72,800 + 7% tax 5,096 + shipping 100
    expect(db.lines[0]).toMatchObject({ model: "memoOutLine" });
    expect(db.charges).toEqual([expect.objectContaining({ chargeType: "SHIPPING" })]);
  });

  it("UT-MO-B05 memo out return stores the vendor + address snapshot", async () => {
    await memoOutReturn.create("actor", returnInput());
    expect(db.created[0]).toMatchObject({ model: "memoOutReturn", data: { vendorId: VENDOR, vendorCodeSnapshot: "V001", vendorNameSnapshot: "Bangkok Gems", addressId: VADDR } });
    expect(String(db.created[0].data.addressSnapshot)).toContain("88 Silom Rd");
    expect(db.lines[0]).toMatchObject({ model: "memoOutReturnLine", data: [expect.objectContaining({ pcs: 1, weightCt: "1.12", outstandingPcs: 2, outstandingWeightCt: "2.5" })] });
  });

  it("UT-MO-B11 memo out return lines need an Outstanding quantity and may not return more than it (UI rev 3)", () => {
    const parse = (line: Row) => createMemoOutReturnSchema.safeParse({ ...shared(), lines: [line], vendorId: VENDOR, addressId: VADDR });
    expect(parse(returnLine({ pcs: 2, weightCt: "2.5" })).success).toBe(true);
    expect(parse(shared().lines[0]).success).toBe(false);
    const tooMany = parse(returnLine({ pcs: 3 }));
    expect(tooMany.success ? [] : tooMany.error.issues.map((issue) => issue.path.join("."))).toEqual(["lines.0.pcs"]);
    const tooHeavy = parse(returnLine({ weightCt: "2.501" }));
    expect(tooHeavy.success ? [] : tooHeavy.error.issues.map((issue) => issue.path.join("."))).toEqual(["lines.0.weightCt"]);
    // Memo out lines have no Outstanding quantity.
    expect(createMemoOutSchema.safeParse({ ...outInput(), lines: [returnLine()] }).success).toBe(false);
  });

  it("UT-MO-B06 rejects an inactive party, a wrong address, an inactive currency and a missing exchange rate", async () => {
    db.customer = { ...db.customer!, active: false };
    expect(await failure(memoOut.create("actor", outInput()))).toMatchObject({ status: 422, code: "MEMO_OUT_REFERENCE_INVALID", path: "customerId" });
    db.customer = { ...db.customer!, active: true };
    expect(await failure(memoOut.create("actor", outInput({ shippingAddressId: INVOICE })))).toMatchObject({ code: "MEMO_OUT_REFERENCE_INVALID", path: "shippingAddressId" });
    expect(await failure(memoOutReturn.create("actor", returnInput({ addressId: ID(99) })))).toMatchObject({ code: "MEMO_OUT_RETURN_REFERENCE_INVALID", path: "addressId" });
    expect(await failure(memoOutReturn.create("actor", returnInput({ currency: "EUR", exchangeRate: "39" })))).toMatchObject({ code: "MEMO_OUT_RETURN_REFERENCE_INVALID", path: "currency" });
    expect(await failure(memoOut.create("actor", outInput({ currency: "USD" })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", path: "exchangeRate" });
  });
});

describe("update and delete (SA-MO-07)", () => {
  it("UT-MO-B07 replaces the document under the version guard; a stored inactive vendor may stay; stale → CHANGED", async () => {
    db.stored = { status: "DRAFT", version: 2, currencyCode: "THB", vendorId: VENDOR, lines: [{ stoneCodeId: STONE }] };
    db.vendor = { ...db.vendor!, active: false };
    await expect(memoOutReturn.update("editor", DOC, 2, returnInput())).resolves.toEqual({ id: DOC, version: 3 });
    expect(db.updates[0]).toMatchObject({ where: { id: DOC, version: 2, status: { in: ["DRAFT"] } } });
    db.stored = { ...db.stored, version: 5 };
    expect(await failure(memoOutReturn.update("editor", DOC, 2, returnInput()))).toMatchObject({ status: 409, code: "MEMO_OUT_RETURN_CHANGED" });
    db.stored = null;
    expect(await failure(memoOut.update("editor", DOC, 2, outInput()))).toMatchObject({ status: 404, code: "MEMO_OUT_NOT_FOUND" });
  });

  it("UT-MO-B08 delete needs the current version of a draft", async () => {
    await expect(memoOut.delete("actor", DOC, 1)).resolves.toEqual({ ok: true });
    db.writeCount = 0;
    db.stored = { version: 4 };
    expect(await failure(memoOut.delete("actor", DOC, 1))).toMatchObject({ status: 409, code: "MEMO_OUT_CHANGED" });
    db.stored = null;
    expect(await failure(memoOutReturn.delete("actor", DOC, 1))).toMatchObject({ status: 404, code: "MEMO_OUT_RETURN_NOT_FOUND" });
  });
});

describe("list and options (SA-MO-09)", () => {
  it("UT-MO-B09 lists newest first searching the party name; options have the quotation / vendor shapes", async () => {
    await memoOut.list(documentListSchema.parse({ q: "gem", partyId: CUSTOMER }));
    expect(db.findManyArgs[0]).toMatchObject({ orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }], take: 51, where: { customerId: CUSTOMER } });
    expect(JSON.stringify(db.findManyArgs[0])).toContain("customerNameSnapshot");
    expect(await failure(memoOutReturn.list(documentListSchema.parse({ cursor: "!!" })))).toMatchObject({ status: 400, path: "cursor" });
    await expect(memoOut.options()).resolves.toMatchObject({ customers: [], currencies: ["THB"], companyCurrency: "THB", numbering: { configured: false } });
    const back = await memoOutReturn.options();
    expect(back.vendors[0]).toMatchObject({ code: "V001", currency: "USD", addresses: [expect.objectContaining({ id: VADDR, isDefault: true })] });
  });
});

const memoReceive = new MemoReceiveService();
const memoReturn = new MemoReturnService();
const [SOURCE, SOURCE2, RECEIPT] = [21, 22, 23].map(ID);

/** A memo receive line of VENDOR in THB: 10 pcs / 3.200 ct at 18,000 per ct. */
function sourceLine(patch: Row = {}): Row {
  return {
    id: SOURCE, memoReceiveId: RECEIPT, position: 1, stoneCodeId: STONE, stoneCodeSnapshot: "RU-RUBDEXVVS1AAA", stone: "Ruby", shape: "Oval", size: "7.2×5.4 mm",
    color: "Red", clarity: "VVS", cutting: "Excellent", quality: "AAA", lot: "L-2608-003", location: "BKK-01", cerType: "GIA", cerNo: "GRS2024-081233",
    pcs: 10, weightCt: new Prisma.Decimal("3.2"), priceUnit: "PER_CT", unitPrice: new Prisma.Decimal("18000"), itemNote: "Unheated",
    document: { id: RECEIPT, docNo: "MR-1", docDate: new Date("2026-10-01T00:00:00Z"), dueDate: new Date("2026-11-01T00:00:00Z"), vendorId: VENDOR, currencyCode: "THB" },
    ...patch,
  };
}
const receiveInput = (patch: Row = {}) => createMemoReceiveSchema.parse({ ...shared(), vendorId: VENDOR, addressId: VADDR, ...patch });
/** A return line as the client sends it: only sourceLineId, the Return quantity and the note are trusted. */
const memoReturnLine = (patch: Row = {}) => ({ ...shared().lines[0], stone: "typed by client", unitPrice: "1", sourceLineId: SOURCE, pcs: 7, weightCt: "2.24", outstandingPcs: 999, outstandingWeightCt: "999", ...patch });
const memoReturnInput = (lines: Row[] = [memoReturnLine()]) => createMemoReturnSchema.parse({ ...shared(), lines, vendorId: VENDOR, addressId: VADDR });

describe("memo receive (memo-return SA rev 1)", () => {
  it("UT-MR-B01 memo receive reads Document Setup key memo-receive and stores the vendor snapshot", async () => {
    db.numbering = { id: NUMBERING, prefix: "MR", separator: "-", start_no: 1 };
    await expect(memoReceive.create("actor", receiveInput())).resolves.toMatchObject({ docNo: "MR-1" });
    expect(db.rawSql[0].values[0]).toBe("memo-receive");
    expect(db.created[0]).toMatchObject({ model: "memoReceive", data: { vendorId: VENDOR, vendorNameSnapshot: "Bangkok Gems", addressId: VADDR } });
    expect(db.lines[0]).toMatchObject({ model: "memoReceiveLine" });
    expect(db.lines[0].data[0]).not.toHaveProperty("sourceLineId");
  });

  it("UT-MR-B02 a memo receive with returned lines can't be edited or deleted (MEMO_RECEIVE_IN_USE)", async () => {
    db.stored = { status: "DRAFT", version: 1, currencyCode: "THB", vendorId: VENDOR, lines: [] };
    db.returnLineCount = 1;
    expect(await failure(memoReceive.update("editor", DOC, 1, receiveInput()))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_IN_USE" });
    expect(await failure(memoReceive.delete("editor", DOC, 1))).toMatchObject({ status: 409, code: "MEMO_RECEIVE_IN_USE" });
    db.returnLineCount = 0;
    await expect(memoReceive.update("editor", DOC, 1, receiveInput())).resolves.toEqual({ id: DOC, version: 2 });
    await expect(memoReceive.delete("editor", DOC, 1)).resolves.toEqual({ ok: true });
  });
});

describe("memo return (memo-return SA rev 1)", () => {
  it("UT-MR-B03 copies the item and price from the memo receive line under a row lock; Outstanding = received − returned elsewhere", async () => {
    db.numbering = { id: NUMBERING, prefix: "MRT", separator: "-", start_no: 1 };
    db.sources = [sourceLine()];
    db.returned = [{ sourceLineId: SOURCE, _sum: { pcs: 2, weightCt: new Prisma.Decimal("0.5") } }];
    await expect(memoReturn.create("actor", memoReturnInput())).resolves.toMatchObject({ docNo: "MRT-1" });
    expect(db.rawSql[0].text).toContain("memo_receive_line");
    expect(db.rawSql[0].text).toContain("FOR UPDATE");
    expect(db.rawSql.some((sql) => sql.values.includes("memo-return"))).toBe(true);
    expect(db.lines[0].model).toBe("memoReturnLine");
    expect(db.lines[0].data[0]).toMatchObject({
      sourceLineId: SOURCE, stone: "Ruby", stoneCodeSnapshot: "RU-RUBDEXVVS1AAA", lot: "L-2608-003", location: "BKK-01", unitPrice: "18000.00",
      pcs: 7, weightCt: "2.24", outstandingPcs: 8, outstandingWeightCt: "2.700",
    });
    expect(String(db.lines[0].data[0].amount)).toBe("40320"); // 2.24 ct × 18,000
  });

  it("UT-MR-B04 rejects more than Outstanding, another vendor's or currency's line, and the same line twice; an edit doesn't count itself", async () => {
    db.sources = [sourceLine()];
    db.returned = [{ sourceLineId: SOURCE, _sum: { pcs: 4, weightCt: new Prisma.Decimal("1") } }];
    expect(await failure(memoReturn.create("actor", memoReturnInput([memoReturnLine({ pcs: 7, weightCt: "2.2" })])))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", path: "lines.0.pcs" });
    expect(await failure(memoReturn.create("actor", memoReturnInput([memoReturnLine({ pcs: 6, weightCt: "2.3" })])))).toMatchObject({ status: 400, path: "lines.0.weightCt" });
    db.sources = [sourceLine({ document: { ...(sourceLine().document as Row), vendorId: ID(77) } })];
    expect(await failure(memoReturn.create("actor", memoReturnInput()))).toMatchObject({ status: 422, code: "MEMO_RETURN_REFERENCE_INVALID", path: "lines.0.sourceLineId" });
    db.sources = [sourceLine({ document: { ...(sourceLine().document as Row), currencyCode: "USD" } })];
    expect(await failure(memoReturn.create("actor", memoReturnInput()))).toMatchObject({ code: "MEMO_RETURN_REFERENCE_INVALID", path: "lines.0.sourceLineId" });
    db.sources = [];
    expect(await failure(memoReturn.create("actor", memoReturnInput()))).toMatchObject({ code: "MEMO_RETURN_REFERENCE_INVALID", path: "lines.0.sourceLineId" });
    expect(await failure(memoReturn.create("actor", memoReturnInput([memoReturnLine(), memoReturnLine()])))).toMatchObject({ status: 400, path: "lines.1.sourceLineId" });

    db.sources = [sourceLine()];
    db.returned = [];
    db.groupByArgs = [];
    db.stored = { status: "DRAFT", version: 1, currencyCode: "THB", vendorId: VENDOR, lines: [] };
    await expect(memoReturn.update("editor", DOC, 1, memoReturnInput([memoReturnLine({ pcs: 10, weightCt: "3.2" })]))).resolves.toEqual({ id: DOC, version: 2 });
    expect(db.groupByArgs[0]).toMatchObject({ where: { sourceLineId: { in: [SOURCE] }, memoReturnId: { not: DOC } } });
  });

  it("UT-MR-B05 Memo Stock lists the vendor's lines in the currency with a quantity still out", async () => {
    db.sources = [sourceLine(), sourceLine({ id: SOURCE2, pcs: 2, weightCt: new Prisma.Decimal("1.36"), unitPrice: new Prisma.Decimal("500"), priceUnit: "PER_PCS" })];
    db.returned = [{ sourceLineId: SOURCE, _sum: { pcs: 3, weightCt: new Prisma.Decimal("0.96") } }, { sourceLineId: SOURCE2, _sum: { pcs: 2, weightCt: new Prisma.Decimal("1.36") } }];
    const stock = await memoReturn.memoStock(memoStockSchema.parse({ vendorId: VENDOR, currency: "THB", q: "ruby", from: "2026-10-01", to: "2026-10-31", excludeReturnId: DOC }));
    expect(db.findManyArgs[0]).toMatchObject({ where: { document: { vendorId: VENDOR, currencyCode: "THB" } }, take: 200 });
    expect(JSON.stringify(db.findManyArgs[0])).toContain("ruby");
    expect(db.groupByArgs[0]).toMatchObject({ where: { memoReturnId: { not: DOC } } });
    expect(stock.items).toEqual([expect.objectContaining({
      sourceLineId: SOURCE, memoReceiveNo: "MR-1", docDate: "2026-10-01", stone: "Ruby", pendingPcs: 7, pendingWeightCt: "2.240", unitPrice: "18000.00", amount: "40320.00", itemNote: "Unheated",
    })]);
  });
});
