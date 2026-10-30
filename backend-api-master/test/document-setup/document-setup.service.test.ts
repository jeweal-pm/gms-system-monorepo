import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Static import is fine: vi.mock calls are hoisted above it (no top-level await; the tsconfig is CommonJS).
import { DocumentSetupService, fromDbDate, toDbDate } from "../../src/document-setup/document-setup.service";
import { saveDocumentSetupBodySchema } from "../../src/document-setup/document-setup.schemas";
import { DOCUMENT_TRANSACTIONS } from "../../src/document-setup/document-setup.transactions";

/** UT-DS-B01…B08: document-setup SA rev 1 (owner 2026-10-23) against a mocked Prisma. */

type Stored = { transactionKey: string; name: string; code: string; startFrom: number; declaration: string; version: number; updatedBy: string; updatedAt: Date };
type StoredRow = { id: string; transactionKey: string; effectiveDate: Date; prefix: string; separator: string; startNo: number };

const db = vi.hoisted(() => ({
  setups: new Map<string, Stored>(),
  rows: [] as StoredRow[],
  usedIds: new Set<string>(),
  /** Numbering rows referenced by a memo out / memo out return (SA-MO-04). */
  memoUsedIds: new Set<string>(),
  /** Numbering rows referenced by a memo receive (SA-MR-08). */
  memoReceiveUsedIds: new Set<string>(),
  returnUsedIds: new Set<string>(),
  failWith: null as unknown,
}));

vi.mock("@gms/storage", () => ({ uuidV7: (() => { let n = 0; return () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`; })() }));

vi.mock("../../src/database/prisma-client", () => {
  const withRows = (setup: Stored) => ({ ...setup, rows: db.rows.filter((row) => row.transactionKey === setup.transactionKey) });
  const tx = {
    documentSetup: {
      findMany: vi.fn(async () => {
        if (db.failWith) throw db.failWith;
        return [...db.setups.values()].map(({ transactionKey, code }) => ({ transactionKey, code }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { transactionKey: string } }) => {
        const setup = db.setups.get(where.transactionKey);
        return setup ? withRows(setup) : null;
      }),
      findFirst: vi.fn(async ({ where }: { where: { code: string; NOT: { transactionKey: string } } }) =>
        [...db.setups.values()].find((setup) => setup.code === where.code && setup.transactionKey !== where.NOT.transactionKey) ?? null),
      create: vi.fn(async ({ data }: { data: Stored }) => {
        if (db.setups.has(data.transactionKey)) throw Object.assign(new Error("unique"), { code: "P2002" });
        db.setups.set(data.transactionKey, { ...data });
        return data;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { transactionKey: string; version: number }; data: Partial<Stored> & { version: { increment: number } } }) => {
        const setup = db.setups.get(where.transactionKey);
        if (!setup || setup.version !== where.version) return { count: 0 };
        const { version, ...rest } = data;
        db.setups.set(where.transactionKey, { ...setup, ...rest, version: setup.version + version.increment });
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { transactionKey: string } }) => withRows(db.setups.get(where.transactionKey)!)),
    },
    documentNumbering: {
      findMany: vi.fn(async ({ where }: { where: { transactionKey: string } }) => db.rows.filter((row) => row.transactionKey === where.transactionKey)),
      deleteMany: vi.fn(async ({ where }: { where: { transactionKey: string; id: { notIn: string[] } } }) => {
        db.rows = db.rows.filter((row) => row.transactionKey !== where.transactionKey || where.id.notIn.includes(row.id));
        return { count: 1 };
      }),
      createMany: vi.fn(async ({ data }: { data: StoredRow[] }) => {
        db.rows.push(...data);
        return { count: data.length };
      }),
    },
  };
  Object.assign(tx, {
    quotation: {
      groupBy: vi.fn(async ({ where }: { where: { numberingId: { in: string[] } } }) =>
        where.numberingId.in.filter((id) => db.usedIds.has(id)).map((numberingId) => ({ numberingId }))),
    },
    memoOut: {
      groupBy: vi.fn(async ({ where }: { where: { numberingId: { in: string[] } } }) =>
        where.numberingId.in.filter((id) => db.memoUsedIds.has(id)).map((numberingId) => ({ numberingId }))),
    },
    memoOutReturn: { groupBy: vi.fn(async () => []) },
    memoReceive: {
      groupBy: vi.fn(async ({ where }: { where: { numberingId: { in: string[] } } }) =>
        where.numberingId.in.filter((id) => db.memoReceiveUsedIds.has(id)).map((numberingId) => ({ numberingId }))),
    },
    memoReturn: {
      groupBy: vi.fn(async ({ where }: { where: { numberingId: { in: string[] } } }) =>
        where.numberingId.in.filter((id) => db.returnUsedIds.has(id)).map((numberingId) => ({ numberingId }))),
    },
  });
  return { prisma: { ...tx, $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
});

const service = new DocumentSetupService();
const body = (overrides: Record<string, unknown> = {}) => saveDocumentSetupBodySchema.parse({
  transactionKey: "purchase-order",
  name: "PURCHASE ORDER",
  code: "po",
  startFrom: 180001,
  rows: [{ effectiveDate: "2026-01-01", prefix: "po", separator: "-", startNo: 180001 }],
  declaration: "Thank you  \n",
  expectedVersion: null,
  ...overrides,
});

async function domainCode(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { error: { code: string } }).error.code;
    throw error;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  db.setups.clear();
  db.rows = [];
  db.usedIds = new Set();
  db.memoUsedIds = new Set();
  db.memoReceiveUsedIds = new Set();
  db.returnUsedIds = new Set();
  db.failWith = null;
});

describe("DocumentSetupService", () => {
  it("UT-DS-B01 lists the 15 fixed transactions with their saved code", async () => {
    await service.save("user-1", body());
    const { items } = await service.list();
    expect(items).toHaveLength(15);
    expect(items.map((item) => item.transactionKey)).toEqual(DOCUMENT_TRANSACTIONS.map((transaction) => transaction.key));
    expect(items.find((item) => item.transactionKey === "purchase-order")).toEqual({ transactionKey: "purchase-order", label: "Purchase Order", defaultCode: "PO", configured: true, code: "PO" });
    expect(items.find((item) => item.transactionKey === "quotation")).toMatchObject({ configured: false, code: null });
  });

  it("UT-DS-B02 get: null before the first save, unknown transaction is NOT_FOUND", async () => {
    expect(await service.get("quotation")).toEqual({ setup: null });
    expect(await domainCode(service.get("stone-master"))).toBe("DOCUMENT_SETUP_NOT_FOUND");
  });

  it("UT-DS-B03 first save creates version 1; code/prefix uppercase; declaration trailing space trimmed; rows sorted", async () => {
    const { setup } = await service.save("user-1", body({
      rows: [
        { effectiveDate: "2027-01-01", prefix: "po", separator: "/", startNo: 1 },
        { effectiveDate: "2026-01-01", prefix: "po", separator: "-", startNo: 180001 },
      ],
    }));
    expect(setup).toMatchObject({ transactionKey: "purchase-order", name: "PURCHASE ORDER", code: "PO", startFrom: 180001, declaration: "Thank you", version: 1 });
    expect(setup.rows.map((row) => [row.effectiveDate, row.prefix, row.separator, row.startNo, row.used])).toEqual([
      ["2026-01-01", "PO", "-", 180001, false],
      ["2027-01-01", "PO", "/", 1, false],
    ]);
  });

  it("UT-DS-B04 update replaces the rows and bumps the version; a stale version is CHANGED", async () => {
    await service.save("user-1", body());
    const { setup } = await service.save("user-2", body({ expectedVersion: 1, name: "PO", rows: [{ effectiveDate: "2026-06-01", prefix: "", separator: "", startNo: 5 }] }));
    expect(setup.version).toBe(2);
    expect(setup.rows).toEqual([expect.objectContaining({ effectiveDate: "2026-06-01", startNo: 5 })]);
    expect(await domainCode(service.save("user-1", body({ expectedVersion: 1 })))).toBe("DOCUMENT_SETUP_CHANGED");
  });

  it("UT-DS-B05 a code used by another transaction is CODE_TAKEN with a field error; a second first-save is CHANGED", async () => {
    await service.save("user-1", body());
    expect(await domainCode(service.save("user-1", body({ transactionKey: "purchase", code: "PO" })))).toBe("DOCUMENT_SETUP_CODE_TAKEN");
    expect(await domainCode(service.save("user-1", body()))).toBe("DOCUMENT_SETUP_CHANGED");
  });

  it("UT-DS-B06 an unavailable database is PARTNER_UNAVAILABLE", async () => {
    db.failWith = Object.assign(new Error("down"), { code: "P1001" });
    expect(await domainCode(service.list())).toBe("PARTNER_UNAVAILABLE");
  });

  it("UT-DS-B07 date round trip keeps the calendar day", () => {
    expect(fromDbDate(toDbDate("2026-10-23"))).toBe("2026-10-23");
  });
});

describe("saveDocumentSetupBodySchema", () => {
  it("UT-DS-B08 rejects bad values with field paths", () => {
    const bad = saveDocumentSetupBodySchema.safeParse({
      transactionKey: "stone-master", name: " ", code: "TOO-LONG-CODE", startFrom: 0,
      rows: [
        { effectiveDate: "2026-02-30", prefix: "P O", separator: "--x", startNo: 1_000_000_000 },
        { effectiveDate: "2026-01-01", prefix: "", separator: "", startNo: 1 },
        { effectiveDate: "2026-01-01", prefix: "", separator: "", startNo: 1 },
      ],
      declaration: "x".repeat(2001), expectedVersion: 0,
    });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((issue) => issue.path.join("."));
    for (const path of ["transactionKey", "name", "code", "startFrom", "rows.0.effectiveDate", "rows.0.prefix", "rows.0.separator", "rows.0.startNo", "rows.2.effectiveDate", "declaration", "expectedVersion"]) {
      expect(paths).toContain(path);
    }
    expect(saveDocumentSetupBodySchema.safeParse({ ...body(), rows: [] }).success).toBe(false);
    expect(saveDocumentSetupBodySchema.safeParse({ ...body(), extra: 1 }).success).toBe(false);
  });

  it("UT-DS-B09 a row that issued a number is reported used, kept as is, and can't be changed or removed (SA-QT-05)", async () => {
    const twoRows = [{ effectiveDate: "2026-01-01", prefix: "po", separator: "-", startNo: 180001 }, { effectiveDate: "2027-01-01", prefix: "po", separator: "/", startNo: 1 }];
    await service.save("actor", body({ rows: twoRows }));
    const used = db.rows.find((row) => fromDbDate(row.effectiveDate) === "2026-01-01")!;
    db.usedIds.add(used.id);
    const { setup } = await service.get("purchase-order");
    expect(setup!.rows.map((row) => row.used)).toEqual([true, false]);
    // UT-MO-B10: a row that only a memo out used counts as used too (SA-MO-04).
    db.usedIds.clear();
    db.memoUsedIds.add(used.id);
    expect((await service.get("purchase-order")).setup!.rows.map((row) => row.used)).toEqual([true, false]);
    db.memoUsedIds.clear();
    // IT-MR-08 (unit part): a row that only a memo receive used counts as used too (SA-MR-08).
    db.memoReceiveUsedIds.add(used.id);
    expect((await service.get("purchase-order")).setup!.rows.map((row) => row.used)).toEqual([true, false]);
    db.memoReceiveUsedIds.clear();
    // UT-MR-B06: a memo return number counts too (memo-return SA rev 1).
    db.returnUsedIds.add(used.id);
    expect((await service.get("purchase-order")).setup!.rows.map((row) => row.used)).toEqual([true, false]);
    db.returnUsedIds.clear();
    db.usedIds.add(used.id);

    // Same values back: the used row keeps its id; the unused row is replaced.
    const saved = await service.save("actor", body({ rows: [...twoRows, { effectiveDate: "2028-01-01", prefix: "PO", separator: "", startNo: 1 }], expectedVersion: 1 }));
    expect(saved.setup.rows.map((row) => [row.effectiveDate, row.used])).toEqual([["2026-01-01", true], ["2027-01-01", false], ["2028-01-01", false]]);
    expect(db.rows.filter((row) => row.id === used.id)).toHaveLength(1);

    expect(await domainCode(service.save("actor", body({ rows: [{ ...twoRows[0], prefix: "QQ" }], expectedVersion: 2 })))).toBe("DOCUMENT_SETUP_ROW_IN_USE");
    expect(await domainCode(service.save("actor", body({ rows: [twoRows[1]], expectedVersion: 2 })))).toBe("DOCUMENT_SETUP_ROW_IN_USE");
  });
});
