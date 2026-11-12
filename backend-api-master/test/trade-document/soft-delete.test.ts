import { HttpException, Logger } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Static imports are fine: vi.mock calls are hoisted above them (CommonJS tsconfig).
import { errorBody } from "../../src/common/errors";
import { Prisma } from "../../src/generated/prisma/client";
import { PurchaseOrderService } from "../../src/purchase-order/purchase-order.service";
import { purchaseOrderListSchema } from "../../src/purchase-order/purchase-order.schemas";
import { purchaseListSchema } from "../../src/purchase/purchase.schemas";
import { PurchaseService } from "../../src/purchase/purchase.service";
import { quotationListSchema } from "../../src/quotation/quotation.schemas";
import { documentListSchema, explainMiss, explainRestoreMiss } from "../../src/trade-document/document-engine";
import { documentErrors } from "../../src/trade-document/document-errors";
import { MemoOutReturnService } from "../../src/trade-document/memo-out-return.service";
import { MemoOutService } from "../../src/trade-document/memo-out.service";
import { MemoReceiveService } from "../../src/trade-document/memo-receive.service";
import { MemoReturnService } from "../../src/trade-document/memo-return.service";
import { memoReceiveListSchema } from "../../src/trade-document/memo-schemas";
import { ReserveService } from "../../src/trade-document/reserve.service";

/**
 * transaction-soft-delete SA rev 1 (ADR-0045) UT-SD-01…07, UT-SD-10…12: the shared engine and the seven engine documents
 * against a recording fake Prisma. Real SQL (CHECK, partial index, races) is in soft-delete.db.integration.test.ts.
 */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  stored: null as Row | null,
  writeCount: 1,
  returned: [{ docNo: "D-1", status: "PENDING_APPROVAL" }] as Row[],
  rows: [] as Row[],
  calls: [] as { model: string; op: string; args: Record<string, unknown> }[],
}));

vi.mock("@gms/storage", () => ({
  uuidV7: (() => { let n = 100; return () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`; })(),
  createStorage: () => ({}),
  buildKey: () => "x",
}));

vi.mock("../../src/database/prisma-client", () => {
  const delegate = (model: string) => new Proxy({}, {
    get: (_target, op: string) => async (args: Record<string, unknown> = {}) => {
      db.calls.push({ model, op, args });
      switch (op) {
        case "updateMany": return { count: db.writeCount };
        case "updateManyAndReturn": return db.writeCount ? db.returned : [];
        case "findUnique": return db.stored;
        case "findMany": return db.rows;
        case "count": return db.rows.length;
        default: return { count: 0 };
      }
    },
  });
  const client: Record<string, unknown> = new Proxy({}, {
    get: (_target, key: string) => {
      if (key === "then") return undefined;
      if (key === "$transaction") return async (fn: (tx: unknown) => unknown) => fn(client);
      if (key === "$queryRaw") return async () => { db.calls.push({ model: "$", op: "$queryRaw", args: {} }); return []; };
      return delegate(key);
    },
  });
  return { prisma: client };
});

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DOC = ID(8);

/** The 7 engine documents: service, Prisma model and error code prefix. */
const documents = [
  { name: "memoOut", service: new MemoOutService(), model: "memoOut", code: "MEMO_OUT" },
  { name: "reserve", service: new ReserveService(), model: "reserve", code: "RESERVE" },
  { name: "memoReceive", service: new MemoReceiveService(), model: "memoReceive", code: "MEMO_RECEIVE" },
  { name: "memoReturn", service: new MemoReturnService(), model: "memoReturn", code: "MEMO_RETURN" },
  { name: "memoOutReturn", service: new MemoOutReturnService(), model: "memoOutReturn", code: "MEMO_OUT_RETURN" },
  { name: "purchaseOrder", service: new PurchaseOrderService(), model: "purchaseOrder", code: "PURCHASE_ORDER" },
  { name: "purchase", service: new PurchaseService(), model: "purchase", code: "PURCHASE" },
] as const;

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; message: string } };
      return { status: error.getStatus(), code: body.error.code };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

const callsOf = (op: string) => db.calls.filter((call) => call.op === op);
const dec = (value: string | number) => new Prisma.Decimal(value);

function detailRow(patch: Row = {}): Row {
  return {
    id: DOC, docNo: "D-1", status: "PENDING_APPROVAL", version: 2, docDate: new Date("2026-11-06"), dueDate: new Date("2026-11-30"),
    customerId: ID(1), customerCodeSnapshot: "C001", customerNameSnapshot: "Siam", shippingAddressId: null, shippingAddressSnapshot: "", invoiceAddressId: null, invoiceAddressSnapshot: "",
    vendorId: ID(2), vendorCodeSnapshot: "V001", vendorNameSnapshot: "Bangkok", addressId: null, addressSnapshot: "",
    currencyCode: "THB", exchangeRate: null, ref: "", documentNote: "", discountType: "NONE", discountValue: dec(0), taxEnabled: false, taxRate: dec(0), taxIncluded: false,
    laborWork: null, laborBasis: null, laborQty: null, laborRate: null,
    subtotal: dec(0), discountAmount: dec(0), priceBeforeTax: dec(0), taxAmount: dec(0), chargesAmount: dec(0), laborAmount: dec(0), grandTotal: dec(0),
    approvedAt: null, approvedBy: null, deletedAt: null, deletedBy: null,
    createdAt: new Date("2026-11-06T01:00:00.000Z"), createdBy: "creator", updatedAt: new Date("2026-11-06T02:00:00.000Z"),
    lines: [], charges: [],
    ...patch,
  };
}

beforeEach(() => {
  Object.assign(db, { stored: null, writeCount: 1, returned: [{ docNo: "D-1", status: "PENDING_APPROVAL" }], rows: [], calls: [] });
});

const draftRow = (patch: Row = {}) => ({ docNo: "D-1", status: "DRAFT", autoApproved: false, revisionCount: 0, version: 3, deletedAt: null, ...patch });

describe("soft delete (D4, as amended by ADR-0048)", () => {
  it.each(documents)("UT-SD-01 $name delete of a DRAFT: a guarded header lock, then one update setting deleted_at / by (never deleteMany)", async ({ service, model }) => {
    db.stored = draftRow();
    await expect(service.delete("actor", DOC, 3)).resolves.toEqual({ ok: true, version: 4 });
    expect(db.calls.filter((call) => call.op === "deleteMany")).toHaveLength(0);
    const [lock] = callsOf("updateMany");
    expect(lock).toMatchObject({
      model,
      args: { where: { id: DOC, version: 3, status: { in: ["DRAFT", "REVISION_REQUESTED", "APPROVED"] }, deletedAt: null }, data: { version: { increment: 1 }, updatedBy: "actor" } },
    });
    const [write] = callsOf("update");
    expect(write).toMatchObject({ model, args: { where: { id: DOC }, data: { deletedBy: "actor" } } });
    const data = write.args.data as Row;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect((lock.args.data as Row).updatedAt).toEqual(data.deletedAt);
    expect(data).not.toHaveProperty("status");
  });

  it.each(documents)("UT-SD-02 $name delete miss order: missing → NOT_FOUND, deleted → DELETED, PENDING / reviewed APPROVED → STATUS_INVALID, else CHANGED", async ({ service, code }) => {
    db.writeCount = 0;
    db.stored = null;
    expect(await failure(service.delete("a", DOC, 1))).toEqual({ status: 404, code: `${code}_NOT_FOUND` });
    db.stored = { status: "DRAFT", version: 2, deletedAt: new Date() };
    expect(await failure(service.delete("a", DOC, 1))).toEqual({ status: 409, code: `${code}_DELETED` });
    db.stored = { status: "APPROVED", autoApproved: false, version: 1, deletedAt: null };
    expect(await failure(service.delete("a", DOC, 1))).toEqual({ status: 409, code: `${code}_STATUS_INVALID` });
    db.stored = { status: "PENDING_APPROVAL", version: 1, deletedAt: null };
    expect(await failure(service.delete("a", DOC, 1))).toEqual({ status: 409, code: `${code}_STATUS_INVALID` });
    db.stored = { status: "DRAFT", version: 5, deletedAt: null };
    expect(await failure(service.delete("a", DOC, 1))).toEqual({ status: 409, code: `${code}_CHANGED` });
    expect(callsOf("findUnique")[0].args).toMatchObject({ where: { id: DOC }, select: { status: true, version: true, deletedAt: true } });
    // A reviewed APPROVED document that passes the lock is still refused (only an auto-approved one is deletable).
    db.writeCount = 1;
    db.stored = draftRow({ status: "APPROVED", autoApproved: false });
    expect(await failure(service.delete("a", DOC, 3))).toEqual({ status: 409, code: `${code}_STATUS_INVALID` });
  });
});

describe("restore (D6)", () => {
  it.each(documents)("UT-SD-03 $name restore clears both columns under {id, version, deleted}; approval ON → DRAFT with submitted_* cleared (G3); misses explain", async ({ service, model, code }) => {
    db.stored = draftRow({ status: "PENDING_APPROVAL" });
    await expect(service.restore("restorer", DOC, 4)).resolves.toEqual({ id: DOC, version: 5, status: "DRAFT" });
    // The setting is read FOR SHARE first (the fake returns no row → approval ON).
    expect(db.calls[0]).toMatchObject({ op: "$queryRaw" });
    const [write] = callsOf("updateMany");
    expect(write).toMatchObject({
      model,
      args: { where: { id: DOC, version: 4, deletedAt: { not: null } }, data: { deletedAt: null, deletedBy: null, version: { increment: 1 }, updatedBy: "restorer" } },
    });
    expect(callsOf("update")[0]).toMatchObject({ model, args: { where: { id: DOC }, data: { status: "DRAFT", autoApproved: false, approvedAt: null, submittedAt: null, submittedBy: null, submittedByName: null } } });
    db.writeCount = 0;
    db.stored = null;
    expect(await failure(service.restore("a", DOC, 4))).toEqual({ status: 404, code: `${code}_NOT_FOUND` });
    db.stored = { status: "PENDING_APPROVAL", version: 4, deletedAt: null };
    expect(await failure(service.restore("a", DOC, 4))).toEqual({ status: 409, code: `${code}_STATUS_INVALID` });
    db.stored = { status: "PENDING_APPROVAL", version: 6, deletedAt: new Date() };
    expect(await failure(service.restore("a", DOC, 4))).toEqual({ status: 409, code: `${code}_CHANGED` });
  });
});

describe("list and get (D9, D10)", () => {
  it("UT-SD-04 list: deleted=false → deletedAt null on findMany and count; deleted=true → not null; other filters and cursor unchanged", async () => {
    const memoReceive = new MemoReceiveService();
    await memoReceive.list(memoReceiveListSchema.parse({ partyId: ID(2), status: "PENDING_APPROVAL" }));
    const [findMany] = callsOf("findMany");
    const [count] = callsOf("count");
    expect(findMany.args).toMatchObject({ where: { deletedAt: null, vendorId: ID(2), status: "PENDING_APPROVAL" }, take: 51, select: { deletedAt: true } });
    expect(count.args).toEqual({ where: { deletedAt: null, vendorId: ID(2), status: "PENDING_APPROVAL" } });
    db.calls = [];
    const deletedAt = new Date("2026-11-06T05:00:00.000Z");
    db.rows = [{ id: DOC, docNo: "MR-1", status: "PENDING_APPROVAL", docDate: new Date("2026-11-06"), dueDate: new Date("2026-11-06"), vendorNameSnapshot: "Bangkok", currencyCode: "THB", grandTotal: dec(10), createdAt: deletedAt, updatedAt: deletedAt, deletedAt }];
    const result = await memoReceive.list(memoReceiveListSchema.parse({ deleted: true, q: "MR" }));
    expect(callsOf("findMany")[0].args).toMatchObject({ where: { deletedAt: { not: null } }, orderBy: [{ docDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
    expect(callsOf("count")[0].args).toEqual({ where: { deletedAt: { not: null } } });
    expect(result).toMatchObject({ total: 1, nextCursor: null, items: [{ id: DOC, docNo: "MR-1", deletedAt: "2026-11-06T05:00:00.000Z" }] });
    db.rows = [{ ...db.rows[0], deletedAt: null }];
    expect((await memoReceive.list(memoReceiveListSchema.parse({}))).items[0].deletedAt).toBeNull();
  });

  it.each(documents)("UT-SD-05 $name get returns deletedAt / deletedBy (null and set)", async ({ service }) => {
    db.stored = detailRow();
    await expect(service.get(DOC)).resolves.toMatchObject({ id: DOC, deletedAt: null, deletedBy: null });
    db.stored = detailRow({ deletedAt: new Date("2026-11-06T06:00:00.000Z"), deletedBy: "deleter" });
    await expect(service.get(DOC)).resolves.toMatchObject({ deletedAt: "2026-11-06T06:00:00.000Z", deletedBy: "deleter" });
  });
});

describe("writes on a deleted document (D8)", () => {
  it.each(documents)("UT-SD-06 $name update on a deleted row → DELETED before STATUS_INVALID / CHANGED; nothing written", async ({ service, code }) => {
    db.writeCount = 0;
    db.stored = { status: "APPROVED", version: 9, deletedAt: new Date(), lines: [] };
    expect(await failure((service.update as (a: string, i: string, v: number, input: unknown) => Promise<unknown>)("a", DOC, 1, {}))).toEqual({ status: 409, code: `${code}_DELETED` });
    // Only the guarded header lock ran (it matched nothing); no line, charge or header write.
    expect(callsOf("updateMany")).toHaveLength(1);
    expect(callsOf("update")).toHaveLength(0);
    expect(callsOf("deleteMany")).toHaveLength(0);
    expect(callsOf("createMany")).toHaveLength(0);
  });

  it.each(documents)("UT-SD-07 $name approve guard has deletedAt: null; a deleted miss → DELETED and no stock is touched", async ({ service, model, code }) => {
    db.writeCount = 0;
    db.stored = { status: "PENDING_APPROVAL", version: 2, deletedAt: new Date() };
    expect(await failure(service.approve("approver", DOC, 2))).toEqual({ status: 409, code: `${code}_DELETED` });
    const [guard] = callsOf("updateMany");
    expect(guard).toMatchObject({ model, args: { where: { id: DOC, version: 2, status: "PENDING_APPROVAL", deletedAt: null } } });
    // Only the guard and the miss read ran: no stock lock, Memo Stock row, PO line or counter.
    expect(db.calls.map((call) => `${call.model}.${call.op}`)).toEqual([`${model}.updateMany`, `${model}.findUnique`]);
    db.stored = { status: "APPROVED", version: 3, deletedAt: null };
    expect(await failure(service.approve("approver", DOC, 2))).toEqual({ status: 409, code: `${code}_STATUS_INVALID` });
  });
});

describe("helpers, schemas, messages, logs", () => {
  it("explainMiss / explainRestoreMiss follow the D8 order", () => {
    const errors = documentErrors("X", "X", "x");
    const code = (fn: () => never) => { try { fn(); } catch (error) { return ((error as HttpException).getResponse() as { error: { code: string } }).error.code; } return null; };
    expect(code(() => explainMiss(errors, null, ["P"]))).toBe("X_NOT_FOUND");
    expect(code(() => explainMiss(errors, { status: "A", version: 1, deletedAt: new Date() }, ["P"]))).toBe("X_DELETED");
    expect(code(() => explainMiss(errors, { status: "A", version: 1, deletedAt: null }, ["P"]))).toBe("X_STATUS_INVALID");
    expect(code(() => explainMiss(errors, { status: "P", version: 1, deletedAt: null }, ["P"]))).toBe("X_CHANGED");
    expect(code(() => explainRestoreMiss(errors, null))).toBe("X_NOT_FOUND");
    expect(code(() => explainRestoreMiss(errors, { status: "P", version: 1, deletedAt: null }))).toBe("X_STATUS_INVALID");
    expect(code(() => explainRestoreMiss(errors, { status: "P", version: 1, deletedAt: new Date() }))).toBe("X_CHANGED");
  });

  it("UT-SD-10 list schemas: deleted is a strict boolean defaulting to false; unknown keys are still refused", () => {
    for (const schema of [documentListSchema, memoReceiveListSchema, purchaseOrderListSchema, purchaseListSchema, quotationListSchema]) {
      expect(schema.parse({}).deleted).toBe(false);
      expect(schema.parse({ deleted: true }).deleted).toBe(true);
      const bad = schema.safeParse({ deleted: "true" });
      expect(bad.success).toBe(false);
      expect(bad.error?.issues.map((issue) => issue.path.join("."))).toEqual(["deleted"]);
      expect(schema.safeParse({ deletedAt: null }).success).toBe(false);
    }
  });

  it("UT-SD-13 list schemas accept the cursor/direction keys tRPC useInfiniteQuery sends (daybook Load more)", () => {
    for (const schema of [documentListSchema, memoReceiveListSchema, purchaseOrderListSchema, purchaseListSchema, quotationListSchema]) {
      expect(schema.safeParse({ limit: 50, deleted: false, cursor: null, direction: "forward" }).success).toBe(true);
      expect(schema.safeParse({ limit: 50, deleted: true, direction: "backward" }).success).toBe(true);
      expect(schema.safeParse({ direction: "sideways" }).success).toBe(false);
    }
  });

  it("UT-SD-11 every <CODE>_DELETED has its own message (and the PO / Purchase / Quotation codes no longer fall back)", () => {
    const generic = errorBody("NO_SUCH_CODE").error.message;
    const nouns: Record<string, string> = {
      QUOTATION: "quotation", RESERVE: "reserve", MEMO_RECEIVE: "memo receive", MEMO_RETURN: "memo return",
      MEMO_OUT: "memo out", MEMO_OUT_RETURN: "memo out return", PURCHASE_ORDER: "purchase order", PURCHASE: "purchase",
    };
    for (const [code, noun] of Object.entries(nouns)) {
      expect(errorBody(`${code}_DELETED`).error.message).toBe(`The ${noun} was deleted`);
      for (const suffix of ["NOT_FOUND", "CHANGED", "STATUS_INVALID"]) expect(errorBody(`${code}_${suffix}`).error.message).not.toBe(generic);
    }
  });

  it("UT-SD-12 logs <event>.deleted / <event>.restored with {actorId, id, docNo, version} and no document content", async () => {
    const log = vi.spyOn(Logger.prototype, "log");
    try {
      const purchase = new PurchaseService();
      db.stored = draftRow();
      await purchase.delete("actor", DOC, 1);
      db.stored = draftRow({ docNo: "PU-7" });
      await purchase.restore("restorer", DOC, 2);
      expect(log.mock.calls.map(([entry]) => entry)).toEqual([
        { event: "purchase.deleted", actorId: "actor", id: DOC, docNo: "D-1", version: 2, reversed: false },
        { event: "purchase.restored", actorId: "restorer", id: DOC, docNo: "PU-7", version: 3, status: "DRAFT" },
      ]);
    } finally {
      log.mockRestore();
    }
  });
});
