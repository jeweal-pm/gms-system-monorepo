import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Static imports are fine: vi.mock calls are hoisted above them (CommonJS tsconfig).
import { formatAddress, QuotationService } from "../../src/quotation/quotation.service";
import { createQuotationSchema, type QuotationInput } from "../../src/quotation/quotation.schemas";

/**
 * UT-QT-B01…B04, B12…B20: numbering, references/snapshots, status guards, list keyset — against a
 * mocked Prisma (SA quotation rev 1). Real SQL (row lock, CHECKs) is covered by the live checks (BE-QT-007).
 */

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CUSTOMER, SHIP, INVOICE, STONE, PHOTO, NUMBERING, QT] = [1, 2, 3, 4, 5, 6, 7].map(ID);

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  numbering: null as null | { id: string; prefix: string; separator: string; start_no: number },
  maxRunning: null as number | null,
  customer: null as Row | null,
  stoneCodes: [] as { id: string; active: boolean }[],
  photos: [] as { id: string }[],
  companyCurrency: "THB" as string | null,
  stored: null as Row | null,
  writeCount: 1,
  rawSql: [] as string[],
  created: [] as Row[],
  updates: [] as Row[],
  lines: [] as Row[],
  linePhotos: [] as Row[],
  charges: [] as Row[],
  findManyArgs: [] as Row[],
  deletes: [] as Row[],
  restoredStatus: "DRAFT",
  listRows: [] as Row[],
  countArgs: [] as Row[],
  /** Quotation approval setting (seed: OFF). */
  requireApproval: false,
}));

vi.mock("@gms/storage", () => ({
  uuidV7: (() => { let n = 100; return () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`; })(),
  createStorage: () => ({}),
  buildKey: () => "quotation-photo/x.jpg",
}));

vi.mock("../../src/database/prisma-client", () => {
  const tx = {
    $queryRaw: vi.fn(async (sql: { strings: string[] } | TemplateStringsArray) => {
      // ADR-0050: the approval setting read (tagged template, FOR SHARE) answers db.requireApproval; not recorded.
      if (Array.isArray(sql)) return [{ requireApproval: db.requireApproval }];
      db.rawSql.push((sql as { strings: string[] }).strings.join("?"));
      return db.numbering ? [db.numbering] : [];
    }),
    customer: {
      findUnique: vi.fn(async () => db.customer),
      findMany: vi.fn(async (args: Row) => { db.findManyArgs.push(args); return []; }),
    },
    stoneCode: { findMany: vi.fn(async (args?: { where?: { id?: unknown } }) => (args?.where?.id ? db.stoneCodes : [{ id: "sc", code: "RUOV-1", partOrder: ["name", "shape"], stoneName: { name: "Ruby" }, shape: { name: "Oval" }, size: null, color: null, clarity: null, cutting: null, quality: null }])) },
    stoneName: { findMany: vi.fn(async () => [{ name: "Ruby", code: "RU" }, { name: "Ruby", code: "RU2" }]) },
    stoneShape: { findMany: vi.fn(async () => [{ name: "Oval", code: "OV" }]) },
    stoneSize: { findMany: vi.fn(async () => [{ name: "2.0 mm" }]) },
    stoneColor: { findMany: vi.fn(async () => []) },
    stoneClarity: { findMany: vi.fn(async () => []) },
    stoneCutting: { findMany: vi.fn(async () => []) },
    stoneQuality: { findMany: vi.fn(async () => []) },
    storedFile: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => db.photos.filter((photo) => where.id.in.includes(photo.id))) },
    companyProfile: { findUnique: vi.fn(async () => (db.companyCurrency ? { currencyCode: db.companyCurrency } : null)) },
    // Currency master (currency SA-CUR-05): THB/USD active, EUR inactive.
    currency: {
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({ THB: { active: true }, USD: { active: true }, EUR: { active: false } } as Record<string, { active: boolean }>)[where.code] ?? null),
      findMany: vi.fn(async () => [{ code: "EUR", name: "Euro", active: false }, { code: "THB", name: "Baht", active: true }, { code: "USD", name: "Dollar", active: true }]),
    },
    documentSetup: { findUnique: vi.fn(async () => null) },
    approvalSetting: { findUnique: vi.fn(async () => ({ requireApproval: db.requireApproval })) },
    quotation: {
      aggregate: vi.fn(async () => ({ _max: { runningNo: db.maxRunning } })),
      create: vi.fn(async ({ data }: { data: Row }) => { db.created.push(data); return data; }),
      findUnique: vi.fn(async () => db.stored),
      updateMany: vi.fn(async (args: Row) => { db.updates.push(args); return { count: db.writeCount }; }),
      update: vi.fn(async (args: Row) => { db.updates.push(args); return { docNo: "QT-26001", status: (args.data as Row).status ?? db.restoredStatus }; }),
      // Soft delete / restore (ADR-0045): one guarded UPDATE … RETURNING.
      updateManyAndReturn: vi.fn(async (args: Row) => { db.deletes.push(args); return db.writeCount ? [{ docNo: "QT-26001", status: db.restoredStatus }] : []; }),
      findMany: vi.fn(async (args: Row) => { db.findManyArgs.push(args); return db.listRows; }),
      count: vi.fn(async (args: Row) => { db.countArgs.push(args); return db.listRows.length; }),
    },
    quotationLine: {
      createMany: vi.fn(async ({ data }: { data: Row[] }) => { db.lines.push(...data); return { count: data.length }; }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    quotationLinePhoto: { createMany: vi.fn(async ({ data }: { data: Row[] }) => { db.linePhotos.push(...data); return { count: data.length }; }) },
    quotationCharge: {
      createMany: vi.fn(async ({ data }: { data: Row[] }) => { db.charges.push(...data); return { count: data.length }; }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
});

const address = (id: string, type: "SHIPPING" | "INVOICE") => ({
  id, type, name: "Siam Gems Co., Ltd.", taxId: type === "INVOICE" ? "0105550000000" : null, address: "919/1 Silom Rd",
  city: "Bang Rak", state: "Bangkok", postcode: "10500", countryCode: "TH", isDefault: true, position: 1,
});

const input = (patch: Record<string, unknown> = {}): QuotationInput => createQuotationSchema.parse({
  docDate: "2026-10-26", dueDate: "2026-11-25", customerId: CUSTOMER, shippingAddressId: SHIP, invoiceAddressId: INVOICE,
  currency: "THB", exchangeRate: null, ref: "", documentNote: "",
  lines: [{
    source: "MANUAL", stoneCodeId: STONE, stoneCode: "RU-1", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "",
    lot: "", location: "", cerType: "", cerNo: "", pcs: 1, weightCt: "1.12", priceUnit: "PER_CT", unitPrice: "65000", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [PHOTO],
  }],
  discount: { type: "NONE", value: "0" },
  tax: { enabled: true, rate: "7", includeInPrice: false },
  serviceCharges: [{ type: "SHIPPING", amount: "100" }],
  labor: null,
  ...patch,
});

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

const service = new QuotationService();

beforeEach(() => {
  Object.assign(db, {
    numbering: { id: NUMBERING, prefix: "QT", separator: "-", start_no: 26001 },
    maxRunning: null,
    customer: { code: "C001", name: "Siam Gems Co., Ltd.", active: true, addresses: [address(SHIP, "SHIPPING"), address(INVOICE, "INVOICE")] },
    stoneCodes: [{ id: STONE, active: true }],
    photos: [{ id: PHOTO }],
    companyCurrency: "THB",
    stored: null,
    writeCount: 1,
    rawSql: [], created: [], updates: [], lines: [], linePhotos: [], charges: [], findManyArgs: [], deletes: [], restoredStatus: "DRAFT", listRows: [], countArgs: [],
    requireApproval: false,
  });
});

describe("numbering (SA-QT-04, owner Q-QT-03)", () => {
  it("UT-QT-B01 the first quotation of a numbering row gets its start number, under a row lock", async () => {
    await expect(service.create("actor", input())).resolves.toMatchObject({ docNo: "QT-26001", version: 1 });
    // Quotation approval OFF (seed): Save approves it (auto-approved, ADR-0050).
    expect(db.created[0]).toMatchObject({ numberingId: NUMBERING, runningNo: 26001, docNo: "QT-26001", status: "APPROVED", autoApproved: true, approvedBy: "actor", createdBy: "actor" });
    expect(db.created[0].approvedAt).toBeInstanceOf(Date);
    expect(db.rawSql[0]).toContain("FOR UPDATE");
  });

  it("UT-QT-B02 later numbers are the highest stored + 1 (a soft-deleted number stays taken, ADR-0045 D5)", async () => {
    db.maxRunning = 26004;
    await expect(service.create("actor", input())).resolves.toMatchObject({ docNo: "QT-26005" });
  });

  it("UT-QT-B03 no Document Setup row in effect → plain 1, 2, 3 … under an advisory lock (owner 2026-10-26)", async () => {
    db.numbering = null;
    await expect(service.create("actor", input())).resolves.toMatchObject({ docNo: "1" });
    expect(db.created[0]).toMatchObject({ numberingId: null, runningNo: 1, docNo: "1" });
    expect(db.rawSql.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(true);
    db.maxRunning = 4;
    await expect(service.create("actor", input())).resolves.toMatchObject({ docNo: "5" });
  });

  it("UT-QT-B04 nextNumber previews without a lock; plain numbers when not configured", async () => {
    db.maxRunning = 7;
    await expect(service.nextNumber("2026-10-26")).resolves.toEqual({ docNo: "QT-26001" });
    expect(db.rawSql[0]).not.toContain("FOR UPDATE");
    db.numbering = { id: NUMBERING, prefix: "Q", separator: "", start_no: 1 };
    await expect(service.nextNumber("2026-10-26")).resolves.toEqual({ docNo: "Q8" });
    db.numbering = null;
    await expect(service.nextNumber("2026-10-26")).resolves.toEqual({ docNo: "8" });
    expect(db.rawSql.some((sql) => sql.includes("pg_advisory_xact_lock"))).toBe(false);
  });
});

describe("create and references (SA-QT-06/07/08/10)", () => {
  it("UT-QT-B12 stores snapshots, server totals, lines, photos and charges", async () => {
    await service.create("actor", input());
    expect(db.created[0]).toMatchObject({ customerCodeSnapshot: "C001", customerNameSnapshot: "Siam Gems Co., Ltd.", currencyCode: "THB", discountType: "NONE" });
    expect(String(db.created[0].shippingAddressSnapshot)).toBe("Siam Gems Co., Ltd.\n919/1 Silom Rd\nBang Rak Bangkok 10500\nThailand");
    expect(String(db.created[0].invoiceAddressSnapshot)).toContain("Tax ID 0105550000000");
    expect(String(db.created[0].subtotal)).toBe("72800");
    expect(String(db.created[0].taxAmount)).toBe("5096");
    expect(String(db.created[0].grandTotal)).toBe("77996");
    expect(db.lines[0]).toMatchObject({ position: 1, stoneCodeId: STONE, stoneCodeSnapshot: "RU-1", source: "MANUAL", discountType: "NONE", discountValue: "0" });
    expect(String(db.lines[0].amount)).toBe("72800");
    expect(db.linePhotos).toEqual([{ lineId: db.lines[0].id, position: 1, fileId: PHOTO }]);
    expect(db.charges).toEqual([expect.objectContaining({ chargeType: "SHIPPING", amount: "100" })]);
  });

  it("UT-QT-B13 invalid references are reported on their fields", async () => {
    db.customer = { ...db.customer!, active: false };
    expect(await failure(service.create("a", input()))).toMatchObject({ code: "QUOTATION_REFERENCE_INVALID", path: "customerId" });
    db.customer = { ...db.customer!, active: true };
    expect(await failure(service.create("a", input({ shippingAddressId: INVOICE })))).toMatchObject({ code: "QUOTATION_REFERENCE_INVALID", path: "shippingAddressId" });
    // Currency master: an inactive currency is refused on a new quotation.
    expect(await failure(service.create("a", input({ currency: "EUR", exchangeRate: "39" })))).toMatchObject({ code: "QUOTATION_REFERENCE_INVALID", path: "currency" });
    db.stoneCodes = [{ id: STONE, active: false }];
    expect(await failure(service.create("a", input()))).toMatchObject({ code: "QUOTATION_REFERENCE_INVALID", path: "lines.0.stoneCodeId" });
    db.stoneCodes = [{ id: STONE, active: true }];
    db.photos = [];
    expect(await failure(service.create("a", input()))).toMatchObject({ code: "QUOTATION_PHOTO_INVALID", path: "lines.0.photoIds.0" });
  });

  it("UT-QT-B14b amounts that don't fit DECIMAL(18,2) are VALIDATION_ERROR, not a database failure", async () => {
    const huge = input().lines[0];
    const body = input({ lines: [{ ...huge, weightCt: "99999.999", unitPrice: "9999999999999999.99", photoIds: [] }] });
    expect(await failure(service.create("a", body))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", path: "lines.0.unitPrice" });
    expect(db.created).toHaveLength(0);
    expect(createQuotationSchema.safeParse({ ...body, discount: { type: "AMOUNT", value: "123456789012345" } }).success).toBe(false);
  });

  it("UT-QT-B14c an oversize line with a 100 % line discount is VALIDATION_ERROR, not a database failure (INV-20261026-002)", async () => {
    const huge = input().lines[0];
    const line = { ...huge, weightCt: "99999.999", unitPrice: "9999999999999999.99", photoIds: [], discount: { type: "PERCENT" as const, value: "100" } };
    expect(await failure(service.create("a", input({ lines: [line] })))).toMatchObject({ status: 400, code: "VALIDATION_ERROR", path: "lines.0.unitPrice" });
    expect(db.created).toHaveLength(0);
    expect(db.lines).toHaveLength(0);
  });

  it("UT-QT-B14 a foreign currency needs an exchange rate to the company currency", async () => {
    expect(await failure(service.create("a", input({ currency: "USD" })))).toMatchObject({ code: "VALIDATION_ERROR", path: "exchangeRate" });
    await expect(service.create("a", input({ currency: "USD", exchangeRate: "36.25" }))).resolves.toMatchObject({ docNo: "QT-26001" });
  });
});

describe("edit and status guards (SA-QT-03/09)", () => {
  const stored = (status: string, version = 3) => ({ status, version, customerId: CUSTOMER, shippingAddressId: SHIP, invoiceAddressId: INVOICE, lines: [{ stoneCodeId: STONE }] });

  it("UT-QT-B15 update (ADR-0050): auto-approved stays approved; a DRAFT is approved by the Save while OFF and stays a DRAFT while ON; a stored inactive customer or stone code may stay", async () => {
    db.stored = { ...stored("APPROVED"), autoApproved: true, revisionCount: 0 };
    db.customer = { ...db.customer!, active: false };
    db.stoneCodes = [{ id: STONE, active: false }];
    await expect(service.update("editor", QT, 3, input())).resolves.toMatchObject({ id: QT, version: 4, status: "APPROVED", autoApproved: true });
    // The header lock is one guarded version bump over DRAFT / REVISION_REQUESTED / APPROVED.
    expect(db.updates[0]).toMatchObject({ where: { id: QT, version: 3, status: { in: ["DRAFT", "REVISION_REQUESTED", "APPROVED"] }, deletedAt: null }, data: { updatedBy: "editor", version: { increment: 1 } } });
    expect(db.updates[1].data).not.toHaveProperty("status");
    expect(db.updates[1].data).not.toHaveProperty("approvedBy");
    expect(db.lines).toHaveLength(1);
    db.stored = { ...stored("DRAFT", 4), autoApproved: false, revisionCount: 0 };
    await expect(service.update("editor", QT, 4, input())).resolves.toMatchObject({ version: 5, status: "APPROVED", autoApproved: true });
    expect(db.updates[3]).toMatchObject({ data: { status: "APPROVED", autoApproved: true, approvedBy: "editor", reviewAction: null } });
    db.requireApproval = true;
    await expect(service.update("editor", QT, 4, input())).resolves.toMatchObject({ status: "DRAFT", autoApproved: false });
    expect(db.updates[5]).toMatchObject({ data: { status: "DRAFT", autoApproved: false } });
  });

  it("UT-QT-B16 update of a pending / rejected / reviewed-approved / cancelled quotation is STATUS_INVALID; a stale version is CHANGED; missing is NOT_FOUND", async () => {
    for (const status of ["PENDING_APPROVAL", "REJECTED", "CANCELLED"]) {
      db.stored = { ...stored(status), autoApproved: false, revisionCount: 0 };
      expect(await failure(service.update("a", QT, 3, input()))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    }
    db.stored = { ...stored("APPROVED"), autoApproved: false, revisionCount: 0 };
    expect(await failure(service.update("a", QT, 3, input()))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    db.writeCount = 0;
    db.stored = stored("DRAFT", 4);
    expect(await failure(service.update("a", QT, 3, input()))).toMatchObject({ status: 409, code: "QUOTATION_CHANGED" });
    db.stored = null;
    expect(await failure(service.update("a", QT, 3, input()))).toMatchObject({ status: 404, code: "QUOTATION_NOT_FOUND" });
  });

  it("UT-QT-B17 submit (DRAFT / REVISION_REQUESTED, approval ON), approve, reject / revise (review columns), cancel move only from their allowed statuses", async () => {
    db.requireApproval = true;
    db.stored = { ...stored("PENDING_APPROVAL", 2), lines: [], charges: [], docDate: new Date("2026-10-26"), dueDate: new Date("2026-11-25"), currencyCode: "THB", exchangeRate: null,
      discountType: "NONE", discountValue: "0", taxEnabled: false, taxRate: "7", taxIncluded: false, laborWork: null, laborBasis: null, laborQty: null, laborRate: null };
    await expect(service.submit({ id: "a", name: "Ann" }, QT, 1)).resolves.toMatchObject({ id: QT, status: "PENDING_APPROVAL", version: 2 });
    expect(db.updates[0]).toMatchObject({ where: { status: { in: ["DRAFT", "REVISION_REQUESTED"] } }, data: { status: "PENDING_APPROVAL", submittedBy: "a", submittedByName: "Ann" } });
    await service.approve("creator", QT, 2);
    expect(db.updates[1]).toMatchObject({ where: { status: { in: ["PENDING_APPROVAL"] } }, data: { status: "APPROVED", approvedBy: "creator", autoApproved: false } });
    await service.reject({ id: "b", name: "Bee" }, QT, 2, "Price changed");
    expect(db.updates[2]).toMatchObject({ where: { status: "PENDING_APPROVAL", deletedAt: null }, data: { status: "REJECTED", reviewAction: "REJECT", reviewNote: "Price changed", reviewedByName: "Bee", statusReason: "Price changed" } });
    await service.requestRevision({ id: "b", name: null }, QT, 2, "Fix the price");
    expect(db.updates[3]).toMatchObject({ where: { status: "PENDING_APPROVAL", revisionCount: { lt: 1 } }, data: { status: "REVISION_REQUESTED", reviewAction: "REVISE", revisionCount: { increment: 1 } } });
    await service.cancel("b", QT, 5, "Customer declined");
    expect(db.updates[4]).toMatchObject({ where: { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"] } }, data: { status: "CANCELLED" } });
    // Approval OFF → submit refused (stale page).
    db.requireApproval = false;
    expect(await failure(service.submit({ id: "a", name: null }, QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_APPROVAL_OFF" });
    // Second Revise → REVISE_LIMIT.
    db.writeCount = 0;
    db.stored = { status: "PENDING_APPROVAL", version: 2, deletedAt: null, revisionCount: 1 };
    expect(await failure(service.requestRevision({ id: "b", name: null }, QT, 2, "Again"))).toMatchObject({ status: 409, code: "QUOTATION_REVISE_LIMIT" });
  });

  it("UT-QT-B18 a guarded write that touches no row explains why", async () => {
    db.writeCount = 0;
    db.stored = { version: 2 };
    expect(await failure(service.approve("a", QT, 2))).toMatchObject({ code: "QUOTATION_STATUS_INVALID" });
    expect(await failure(service.submit({ id: "a", name: null }, QT, 1))).toMatchObject({ code: "QUOTATION_CHANGED" });
    db.stored = null;
    expect(await failure(service.cancel("a", QT, 1, "x"))).toMatchObject({ code: "QUOTATION_NOT_FOUND" });
  });

  it("UT-QT-B19 / UT-SD-08 delete (ADR-0045 / ADR-0050) is a soft delete of a DRAFT, REVISION_REQUESTED or auto-approved quotation at the expected version", async () => {
    db.stored = { docNo: "QT-26001", status: "APPROVED", autoApproved: true, revisionCount: 0 };
    await expect(service.delete("actor", QT, 1)).resolves.toEqual({ ok: true, version: 2 });
    expect(db.updates[0]).toMatchObject({ where: { id: QT, version: 1, status: { in: ["DRAFT", "REVISION_REQUESTED", "APPROVED"] }, deletedAt: null }, data: { version: { increment: 1 }, updatedBy: "actor" } });
    expect(db.updates[1]).toMatchObject({ where: { id: QT }, data: { deletedBy: "actor" } });
    expect((db.updates[1].data as Row).deletedAt).toBeInstanceOf(Date);
    // Pending / reviewed approved → STATUS_INVALID.
    db.stored = { docNo: "QT-26001", status: "PENDING_APPROVAL", autoApproved: false, revisionCount: 0 };
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    db.stored = { docNo: "QT-26001", status: "APPROVED", autoApproved: false, revisionCount: 0 };
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    db.writeCount = 0;
    db.stored = { version: 1, deletedAt: null };
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    db.stored = { version: 3, deletedAt: null };
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_CHANGED" });
    db.stored = { version: 2, deletedAt: new Date() };
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 409, code: "QUOTATION_DELETED" });
    db.stored = null;
    expect(await failure(service.delete("a", QT, 1))).toMatchObject({ status: 404, code: "QUOTATION_NOT_FOUND" });
  });

  it("UT-SD-08 restore (G3) clears both columns at the expected version: auto-approved while OFF, DRAFT while ON; misses explain why", async () => {
    await expect(service.restore("restorer", QT, 2)).resolves.toEqual({ id: QT, version: 3, status: "APPROVED" });
    expect(db.updates[0]).toMatchObject({ where: { id: QT, version: 2, deletedAt: { not: null } }, data: { deletedAt: null, deletedBy: null, version: { increment: 1 }, updatedBy: "restorer" } });
    expect(db.updates[1]).toMatchObject({ data: { status: "APPROVED", autoApproved: true, approvedBy: "restorer", submittedAt: null, reviewAction: null } });
    db.requireApproval = true;
    await expect(service.restore("restorer", QT, 2)).resolves.toEqual({ id: QT, version: 3, status: "DRAFT" });
    expect(db.updates[3]).toMatchObject({ data: { status: "DRAFT", autoApproved: false, approvedAt: null, submittedAt: null } });
    db.writeCount = 0;
    db.stored = null;
    expect(await failure(service.restore("a", QT, 2))).toMatchObject({ status: 404, code: "QUOTATION_NOT_FOUND" });
    db.stored = { deletedAt: null };
    expect(await failure(service.restore("a", QT, 2))).toMatchObject({ status: 409, code: "QUOTATION_STATUS_INVALID" });
    db.stored = { deletedAt: new Date() };
    expect(await failure(service.restore("a", QT, 2))).toMatchObject({ status: 409, code: "QUOTATION_CHANGED" });
  });

  it("UT-SD-09 update and submit/approve/reject/revise/cancel refuse a deleted quotation with QUOTATION_DELETED", async () => {
    db.writeCount = 0;
    db.stored = { ...stored("DRAFT"), deletedAt: new Date() };
    expect(await failure(service.update("a", QT, 3, input()))).toMatchObject({ status: 409, code: "QUOTATION_DELETED" });
    expect(db.updates).toHaveLength(1);
    expect(db.lines).toHaveLength(0);
    db.stored = { version: 3, deletedAt: new Date() };
    const actor = { id: "a", name: null };
    for (const call of [service.submit(actor, QT, 3), service.approve("a", QT, 3), service.reject(actor, QT, 3, "x"), service.requestRevision(actor, QT, 3, "x"), service.cancel("a", QT, 3, "x")]) {
      expect(await failure(call)).toMatchObject({ status: 409, code: "QUOTATION_DELETED" });
    }
    // Every guard excludes deleted rows.
    for (const update of db.updates) expect(update).toMatchObject({ where: { deletedAt: null } });
    expect(db.updates).toHaveLength(6);
  });
});

describe("list (SA-QT-11, owner Q-QT-06)", () => {
  it("UT-QT-B20 excludes cancelled by default, newest first, bounded; bad cursor is VALIDATION_ERROR", async () => {
    await service.list({ limit: 50, q: "siam", deleted: false });
    expect(db.findManyArgs[0]).toMatchObject({
      where: { status: { not: "CANCELLED" } },
      orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: 51,
    });
    await service.list({ limit: 10, status: "CANCELLED", deleted: false });
    expect(db.findManyArgs[1]).toMatchObject({ where: { status: "CANCELLED" } });
    expect(await failure(service.list({ limit: 10, cursor: "!!", deleted: false }))).toMatchObject({ code: "VALIDATION_ERROR", path: "cursor" });
  });

  it("UT-SD-08 list: deleted=false → deletedAt null on findMany and count; deleted=true → not null; items carry deletedAt", async () => {
    await service.list({ limit: 50, deleted: false });
    expect(db.findManyArgs[0]).toMatchObject({ where: { deletedAt: null, status: { not: "CANCELLED" } } });
    expect(db.countArgs[0]).toMatchObject({ where: { deletedAt: null } });
    const deletedAt = new Date("2026-11-06T03:00:00.000Z");
    const { Prisma } = await import("../../src/generated/prisma/client");
    db.listRows = [{ id: QT, docNo: "QT-1", status: "DRAFT", docDate: new Date("2026-11-06"), dueDate: new Date("2026-11-06"), customerNameSnapshot: "Siam", currencyCode: "THB", grandTotal: new Prisma.Decimal(1), createdAt: deletedAt, updatedAt: deletedAt, deletedAt }];
    const result = await service.list({ limit: 50, deleted: true });
    expect(db.findManyArgs[1]).toMatchObject({ where: { deletedAt: { not: null } }, select: { deletedAt: true } });
    expect(db.countArgs[1]).toMatchObject({ where: { deletedAt: { not: null } } });
    expect(result.items[0]).toMatchObject({ id: QT, deletedAt: "2026-11-06T03:00:00.000Z" });
    expect(result.total).toBe(1);
  });

  it("UT-QT-B25 options carry customers, currencies, charge types and stone choices", async () => {
    const options = await service.options();
    expect(options).toMatchObject({ companyCurrency: "THB", chargeTypes: ["SHIPPING", "HANDLING", "INSURANCE", "CERTIFICATE"], numbering: { configured: false } });
    expect(options.currencies).toEqual(["THB", "USD"]);
    expect(options.stone.codes).toEqual([{ id: "sc", code: "RUOV-1", partOrder: ["name", "shape"], stone: "Ruby", shape: "Oval", size: "", color: "", clarity: "", cutting: "", quality: "" }]);
    // Parts carry their codes for rebuilding a stone code (owner 2026-10-27); a size uses its name.
    expect(options.stone.stones).toEqual([{ name: "Ruby", code: "RU" }]);
    expect(options.stone.sizes).toEqual([{ name: "2.0 mm", code: "2.0MM" }]);
  });

  it("formats an address snapshot without empty parts", () => {
    expect(formatAddress({ name: "A", taxId: null, address: "1 Road", city: "", state: "", postcode: "", countryCode: "CH" })).toBe("A\n1 Road\nSwitzerland");
  });
});
