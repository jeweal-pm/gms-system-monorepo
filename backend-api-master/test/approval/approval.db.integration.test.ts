import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sendAndApprove, setApproval, submitted } from "../partner-shared/approval";

/**
 * Approve Center API on real PostgreSQL (approve-center SA rev 1 as amended by approval-setup SA rev 1 / ADR-0048):
 * - IT-AP-B08: `summary` counts only live PENDING_APPROVAL (not drafts, not deleted), caps at 100 with 101 pending.
 * - IT-AS-B10: OFF types leave `items` (kept in `types` with requireApproval false), `pending` for an OFF type →
 *   APPROVAL_TYPE_OFF; Quotation appears when ON; rows carry `revisionCount`.
 * - IT-AP-B09: oldest first; a resubmitted document moves to the end; every sort × dir pages 101 rows with no
 *   duplicate / missing row, in the expected order (ties broken by id).
 * - IT-AP-B10: search by doc no., party, ref, stone, Stock ID (Memo Out Return via its Memo Out line; PO by stone only);
 *   `%` / `_` literal; drafts / deleted / non-pending excluded.
 * - IT-AP-B11: EXPLAIN of `summary` and the default `pending` uses `<t>_pending_idx` (with sequential scans disabled,
 *   as the planner prefers a scan on tiny tables).
 * Opt-in (INV-20261021-007): only with `PARTNER_TEST_DATABASE_URL` on a disposable loopback non-5432 `f1_system`.
 */

const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `ac-it-${randomUUID().slice(0, 8)}`;
const APPROVER = { id: `${ACTOR}-ap`, name: "Approver" };
const YEAR = 87;
const TAG = randomUUID().slice(0, 6).toUpperCase();
const TYPES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;
const SUPER = { isSuperAdmin: true, grants: [] as string[] };

type Prisma = typeof import("../../src/database/prisma-client").prisma;
let prisma: Prisma;
let schemas: typeof import("../../src/trade-document/memo-schemas");
let approval: InstanceType<typeof import("../../src/approval/approval.service").ApprovalService>;
let pendingInput: typeof import("../../src/approval/approval.schemas").approvalPendingInputSchema;
let s: {
  receive: InstanceType<typeof import("../../src/trade-document/memo-receive.service").MemoReceiveService>;
  memoOut: InstanceType<typeof import("../../src/trade-document/memo-out.service").MemoOutService>;
  reserve: InstanceType<typeof import("../../src/trade-document/reserve.service").ReserveService>;
  memoOutReturn: InstanceType<typeof import("../../src/trade-document/memo-out-return.service").MemoOutReturnService>;
  po: InstanceType<typeof import("../../src/purchase-order/purchase-order.service").PurchaseOrderService>;
  quotation: InstanceType<typeof import("../../src/quotation/quotation.service").QuotationService>;
};

const vendor = { id: randomUUID(), addressId: randomUUID(), name: `AC IT Vendor ${TAG}` };
const customer = { id: randomUUID(), shipping: randomUUID(), invoice: randomUUID(), name: `AC IT Customer ${TAG}` };
let fixtures = false;

const money = { discount: { type: "NONE" as const, value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null };
const dates = { docDate: "2026-11-10", dueDate: "2026-12-10", currency: "THB", exchangeRate: null, ref: "", documentNote: "" };
const vendorHeader = (ref = "") => ({ ...dates, ...money, ref, vendorId: vendor.id, addressId: vendor.addressId });
const customerHeader = (ref = "") => ({ ...dates, ...money, ref, customerId: customer.id, shippingAddressId: customer.shipping, invoiceAddressId: customer.invoice });
const blank = { stoneCodeId: null, stoneCode: "", stone: "typed", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "", cerType: "", cerNo: "",
  discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as string[] };
const receiveLine = (pcs: number, weightCt: string) => ({
  source: "MANUAL" as const, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "L", cerType: "", cerNo: "",
  pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "1000", discount: { type: "NONE" as const, value: "0" }, itemNote: "", photoIds: [] as [],
});
const stockLine = (memoStockId: string, pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, pcs, weightCt, priceUnit: "PER_CT" as const, unitPrice: "2000", memoStockId });
const orderLine = (stone: string, pcs: number, weightCt: string) => ({ ...blank, source: "MANUAL" as const, stone, location: "Safe", pcs, weightCt, priceUnit: "PER_PCS" as const, unitPrice: "100" });
const poInput = (lines: ReturnType<typeof orderLine>[], ref = "") => ({ ...vendorHeader(ref), lines }) as never;
const quoteInput = (ref = "") => ({ ...customerHeader(ref), lines: [{ ...blank, source: "MANUAL", stone: "Emerald", pcs: 1, weightCt: "1", priceUnit: "PER_CT", unitPrice: "100" }] }) as never;

async function failure(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: unknown } };
      return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors };
    }
    throw error;
  }
  throw new Error("expected a failure");
}

/** Live pending rows of a table outside this file's fixtures (the summary counts the whole table). */
async function baseline(table: string, partyColumn: string, partyId: string) {
  const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM "partner"."${table}" WHERE status = 'PENDING_APPROVAL' AND deleted_at IS NULL AND ${partyColumn} <> $1::uuid`, partyId);
  return row.n;
}

/** Every page of one sort × dir for the given search. */
async function allPages(type: (typeof TYPES)[number], sort: string, dir: string, q: string) {
  const ids: string[] = [];
  const rows: { id: string; docNo: string; submittedAt: string; totalWeightCt: string; grandTotal: string; currency: string; party: { name: string } }[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await approval.pending(pendingInput.parse({ type, sort, dir, q, cursor, limit: 50 }));
    rows.push(...page.items);
    ids.push(...page.items.map((row) => row.id));
    cursor = page.nextCursor;
    pages += 1;
    expect(pages).toBeLessThan(10);
  } while (cursor);
  return { ids, rows, pages };
}

const docs = { po: [] as { id: string; version: number; docNo: string }[] };

describe.runIf(canRun)("approval.summary / approval.pending on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    vi.stubEnv("DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    schemas = await import("../../src/trade-document/memo-schemas");
    ({ approvalPendingInputSchema: pendingInput } = await import("../../src/approval/approval.schemas"));
    const { ApprovalService } = await import("../../src/approval/approval.service");
    const { MemoReceiveService } = await import("../../src/trade-document/memo-receive.service");
    const { MemoOutService } = await import("../../src/trade-document/memo-out.service");
    const { ReserveService } = await import("../../src/trade-document/reserve.service");
    const { MemoOutReturnService } = await import("../../src/trade-document/memo-out-return.service");
    const { PurchaseOrderService } = await import("../../src/purchase-order/purchase-order.service");
    const { QuotationService } = await import("../../src/quotation/quotation.service");
    approval = new ApprovalService();
    const receive = new MemoReceiveService();
    receive.clock = () => new Date(`20${YEAR}-06-01T03:00:00Z`);
    s = { receive, memoOut: new MemoOutService(), reserve: new ReserveService(), memoOutReturn: new MemoOutReturnService(), po: new PurchaseOrderService(), quotation: new QuotationService() };
    if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: ACTOR, updatedBy: ACTOR } });
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    const code = `ACIT${TAG}`;
    const address = { position: 1, name: "AC IT", address: "1 Test Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true };
    await prisma.vendor.create({ data: {
      id: vendor.id, name: vendor.name, nameKey: vendor.name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "ac-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: vendor.addressId }] },
    } });
    await prisma.customer.create({ data: {
      id: customer.id, name: customer.name, nameKey: customer.name.toLowerCase(), code: `${code}C`, codeKey: `${code.toLowerCase()}c`, currencyCode: "THB", firstName: "It", email: "ac-it@example.test",
      createdBy: ACTOR, updatedBy: ACTOR, addresses: { create: [{ ...address, id: customer.shipping, type: "SHIPPING" }, { ...address, id: customer.invoice, type: "INVOICE" }] },
    } });
    fixtures = true;
    for (const type of TYPES) await setApproval(prisma, type, true);
    // 101 pending Purchase Orders with varied quantity and value (the default sort follows the submit order).
    for (let index = 0; index < 101; index += 1) {
      const lines = [orderLine(index % 5 === 0 ? "Ruby" : "Sapphire", (index % 7) + 1, ((index * 37) % 50 / 10 + 0.1).toFixed(3))];
      if (index === 0) lines.push(orderLine("Emerald", 1, "1"), orderLine("Ruby", 1, "1"), orderLine("Topaz", 1, "1"), orderLine("Opal", 1, "1"));
      const saved = await s.po.create(ACTOR, poInput(lines, index === 7 ? "Lot 50%_x" : index === 8 ? "Lot 50 x" : `R${index}`));
      docs.po.push(await submitted(s.po, ACTOR, saved));
    }
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    if (fixtures) {
      await prisma.memoOutReturn.deleteMany({ where: { customerId: customer.id } });
      await prisma.memoOut.deleteMany({ where: { customerId: customer.id } });
      await prisma.reserve.deleteMany({ where: { customerId: customer.id } });
      await prisma.quotation.deleteMany({ where: { customerId: customer.id } });
      await prisma.purchaseOrder.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoStock.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.memoReceive.deleteMany({ where: { vendorId: vendor.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.vendor.deleteMany({ where: { id: vendor.id } });
      await prisma.storedFile.deleteMany({ where: { kind: "it", createdBy: ACTOR } });
    }
    await prisma.memoStockIdCounter.deleteMany({ where: { year: YEAR } });
    for (const type of TYPES) await setApproval(prisma, type, type !== "quotation");
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("IT-AP-B08 / IT-AS-B10 summary: live pending only, capped at 100; OFF types leave items; Quotation when ON; canApprove filter", async () => {
    const quoteBase = await baseline("quotation", "customer_id", customer.id);
    const pendingQuotes = [];
    for (let index = 0; index < 2; index += 1) pendingQuotes.push(await submitted(s.quotation, ACTOR, await s.quotation.create(ACTOR, quoteInput(), null)));
    await s.quotation.create(ACTOR, quoteInput(), null); // a draft is not waiting
    const gone = await submitted(s.quotation, ACTOR, await s.quotation.create(ACTOR, quoteInput(), null));
    // A legacy soft-deleted pending row (G3 keeps it allowed) is not counted.
    await prisma.$executeRaw`UPDATE "partner"."quotation" SET deleted_at = now(), deleted_by = ${ACTOR} WHERE id = ${gone.id}::uuid`;
    const summary = await approval.summary(SUPER);
    expect(summary.countCap).toBe(100);
    expect(summary.types.map((row) => row.type)).toEqual([...TYPES]);
    expect(summary.items.find((row) => row.type === "purchase-order")).toEqual({ type: "purchase-order", count: 100 });
    expect(summary.items.find((row) => row.type === "quotation")).toEqual({ type: "quotation", count: Math.min(quoteBase + 2, 100) });

    // OFF: Quotation (directly, bypassing the waiting guard for the test) leaves items, stays in types as off.
    await setApproval(prisma, "quotation", false);
    const off = await approval.summary(SUPER);
    expect(off.items.map((row) => row.type)).not.toContain("quotation");
    expect(off.types.find((row) => row.type === "quotation")).toEqual({ type: "quotation", requireApproval: false });
    expect(await failure(approval.pending(pendingInput.parse({ type: "quotation" })))).toEqual({ status: 409, code: "APPROVAL_TYPE_OFF", fieldErrors: undefined });
    await setApproval(prisma, "quotation", true);
    const quotes = await approval.pending(pendingInput.parse({ type: "quotation", q: customer.name }));
    expect(quotes.items.map((row) => row.id).sort()).toEqual(pendingQuotes.map((row) => row.id).sort());

    // canApprove filter: only the approvable types, in registry order.
    const limited = await approval.summary({ isSuperAdmin: false, grants: ["purchase-order:APPROVE", "quotation:APPROVE", "reserve:VIEW"] });
    expect(limited.types.map((row) => row.type)).toEqual(["quotation", "purchase-order"]);
    expect(limited.items.map((row) => row.type)).toEqual(["quotation", "purchase-order"]);
    expect(await approval.summary({ isSuperAdmin: false, grants: ["reserve:VIEW"] })).toEqual({ items: [], countCap: 100, types: [] });
  });

  it("IT-AP-B09 pending: oldest first, rows carry the contract fields; every sort × dir pages 101 rows without duplicates or gaps; a resubmitted document moves to the end", async () => {
    const q = vendor.name;
    const first = await approval.pending(pendingInput.parse({ type: "purchase-order", q }));
    expect(first.items).toHaveLength(50);
    expect(first.items.map((row) => row.id)).toEqual(docs.po.slice(0, 50).map((row) => row.id));
    expect(first.items[0]).toMatchObject({
      type: "purchase-order", status: "PENDING_APPROVAL", version: docs.po[0].version, party: { id: vendor.id, name: vendor.name }, ref: "R0", currency: "THB",
      lineCount: 5, stoneNames: ["Ruby", "Emerald", "Topaz"], moreStoneCount: 1, submittedBy: ACTOR, submittedByName: "IT Tester", revisionCount: 0, lastReview: null,
    });
    expect(first.items[0].totalPcs).toBe(5);

    const expected = (rows: Awaited<ReturnType<typeof allPages>>["rows"], sort: string, dir: string) => {
      const key = (row: (typeof rows)[number]): (string | number)[] => sort === "submittedAt" ? [row.submittedAt] : sort === "docNo" ? [row.docNo]
        : sort === "party" ? [row.party.name] : sort === "qty" ? [Number(row.totalWeightCt)] : [row.currency, Number(row.grandTotal)];
      const sign = dir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const ka = [...key(a), a.id];
        const kb = [...key(b), b.id];
        for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return (ka[i] < kb[i] ? -1 : 1) * sign;
        return 0;
      }).map((row) => row.id);
    };
    for (const sort of ["submittedAt", "docNo", "party", "qty", "value"]) {
      for (const dir of ["asc", "desc"]) {
        const result = await allPages("purchase-order", sort, dir, q);
        expect(result.pages, `${sort} ${dir}`).toBe(3);
        expect(new Set(result.ids).size, `${sort} ${dir}`).toBe(101);
        expect(result.ids, `${sort} ${dir}`).toEqual(expected(result.rows, sort, dir));
      }
    }
    // A cursor from another sort is refused.
    expect(await failure(approval.pending(pendingInput.parse({ type: "purchase-order", q, sort: "docNo", cursor: first.nextCursor })))).toMatchObject({ code: "VALIDATION_ERROR" });

    // Revise the oldest, edit nothing, send again: it leaves the queue while sent back, then is last, with revisionCount 1.
    const oldest = docs.po[0];
    await s.po.requestRevision(APPROVER, oldest.id, oldest.version, "Fix");
    expect((await allPages("purchase-order", "submittedAt", "asc", q)).ids).not.toContain(oldest.id);
    // INV-20261111-002 item 2: a party cursor naming a row outside the live pending set (sent back, unknown id) → cursor
    // VALIDATION_ERROR, never an ordering read of that row; a live pending row still pages.
    const { encodePendingCursor } = await import("../../src/approval/approval.service");
    for (const id of [oldest.id, randomUUID()]) {
      const cursor = encodePendingCursor({ sort: "party", dir: "asc", q, keys: [], id });
      expect(await failure(approval.pending(pendingInput.parse({ type: "purchase-order", q, sort: "party", cursor })))).toMatchObject({
        code: "VALIDATION_ERROR", fieldErrors: [{ path: "cursor", code: "invalid" }],
      });
    }
    const liveCursor = encodePendingCursor({ sort: "party", dir: "asc", q, keys: [], id: docs.po[1].id });
    await expect(approval.pending(pendingInput.parse({ type: "purchase-order", q, sort: "party", cursor: liveCursor }))).resolves.toMatchObject({ items: expect.any(Array) });
    await s.po.submit({ id: ACTOR, name: "Maker" }, oldest.id, oldest.version + 1);
    const after = await allPages("purchase-order", "submittedAt", "asc", q);
    expect(after.ids.at(-1)).toBe(oldest.id);
    const moved = after.rows.at(-1) as unknown as { revisionCount: number; lastReview: unknown; submittedByName: string };
    expect(moved).toMatchObject({ revisionCount: 1, lastReview: { action: "REVISE", note: "Fix", byName: "Approver" }, submittedByName: "Maker" });
    docs.po[0] = { ...oldest, version: oldest.version + 2 };
  });

  it("IT-AP-B10 search: doc no., party, ref (% and _ literal), stone, Stock ID incl. Memo Out Return via Memo Out; PO by stone only; drafts / approved / deleted excluded", async () => {
    // Stock for Reserve / Memo Out lines.
    const receive = await s.receive.create(ACTOR, { ...vendorHeader(), lines: [receiveLine(10, "5")] } as never);
    await sendAndApprove(s.receive, ACTOR, receive.id, receive.version);
    const item = await prisma.memoStock.findFirstOrThrow({ where: { memoReceiveId: receive.id } });
    const outInput = (pcs: number) => schemas.createMemoOutSchema.parse({ ...customerHeader(), lines: [stockLine(item.id, pcs, (pcs / 2).toFixed(3))] });
    const reserve = await submitted(s.reserve, ACTOR, await s.reserve.create(ACTOR, outInput(1)));
    const out = await s.memoOut.create(ACTOR, outInput(4));
    await sendAndApprove(s.memoOut, ACTOR, out.id, out.version);
    const outLine = await prisma.memoOutLine.findFirstOrThrow({ where: { memoOutId: out.id } });
    const back = await submitted(s.memoOutReturn, ACTOR, await s.memoOutReturn.create(ACTOR, schemas.createMemoOutReturnSchema.parse({
      ...customerHeader(), lines: [{ ...blank, source: "MANUAL", priceUnit: "PER_PCS", unitPrice: "1", outstandingPcs: 999, outstandingWeightCt: "999", memoOutLineId: outLine.id, pcs: 1, weightCt: "0.5" }],
    })));
    const draftReserve = await s.reserve.create(ACTOR, outInput(1));
    const ids = async (type: (typeof TYPES)[number], q: string) => (await allPages(type, "submittedAt", "asc", q)).ids;

    // Stock ID: the Reserve line and the Memo Out Return through its Memo Out line; the draft is never listed.
    expect(await ids("reserve", item.stockId)).toEqual([reserve.id]);
    expect(await ids("memo-out-return", item.stockId.toLowerCase())).toEqual([back.id]);
    expect(await ids("reserve", customer.name.slice(3).toUpperCase())).toEqual([reserve.id]);
    // Without a Document Setup row numbers are plain (1, 2, 3 …): doc no. is a substring match, so check membership.
    expect(await ids("reserve", reserve.docNo)).toContain(reserve.id);
    expect(await ids("reserve", "zz-no-match")).toEqual([]);
    expect(await ids("reserve", draftReserve.docNo)).not.toContain(draftReserve.id);
    // PO: stone (line), ref with literal % and _, doc no.; no Stock ID column.
    const rubyPos = await ids("purchase-order", "ruby");
    expect(rubyPos.length).toBeGreaterThanOrEqual(21);
    expect(rubyPos).toContain(docs.po[5].id);
    expect(await ids("purchase-order", "50%_")).toEqual([docs.po[7].id]);
    expect(await ids("purchase-order", "50 x")).toEqual([docs.po[8].id]);
    expect(await ids("purchase-order", docs.po[9].docNo)).toContain(docs.po[9].id);
    // Approved and deleted leave the list.
    await s.po.approve(ACTOR, docs.po[9].id, docs.po[9].version);
    expect(await ids("purchase-order", docs.po[9].docNo)).not.toContain(docs.po[9].id);
    await prisma.$executeRaw`UPDATE "partner"."purchase_order" SET deleted_at = now(), deleted_by = ${ACTOR} WHERE id = ${docs.po[7].id}::uuid`;
    expect(await ids("purchase-order", "50%_")).toEqual([]);
  });

  it("IT-AS-PH3 G14: a line photo counts as approver-readable only while its document is a live PENDING_APPROVAL (PO, Quotation)", async () => {
    const { isPendingDocumentPhoto } = await import("../../src/quotation/quotation-photo.public.controller");
    const photo = async (source: string) => {
      const id = randomUUID();
      await prisma.storedFile.create({ data: { id, kind: "it", bucket: "files", objectKey: `it/${id}.png`, filename: `${id}.png`, contentType: "image/png", sizeBytes: BigInt(1),
        sha256: "a".repeat(64), status: "ready", sourceType: source, sourceId: id, createdBy: ACTOR, createdAt: new Date(), readyAt: new Date() } });
      return id;
    };
    const target = docs.po[2];
    const [line] = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: target.id } });
    const poPhoto = await photo("purchase_order.line-photo");
    await prisma.purchaseOrderLinePhoto.create({ data: { lineId: line.id, position: 1, fileId: poPhoto } });
    expect(await isPendingDocumentPhoto("purchase-order", poPhoto)).toBe(true);
    // A photo id of another type's table, or an unknown id, is not readable this way.
    expect(await isPendingDocumentPhoto("quotation", poPhoto)).toBe(false);
    expect(await isPendingDocumentPhoto("purchase-order", randomUUID())).toBe(false);
    await s.po.approve(ACTOR, target.id, target.version);
    expect(await isPendingDocumentPhoto("purchase-order", poPhoto)).toBe(false);

    const draft = await s.quotation.create(ACTOR, quoteInput(), null);
    const [quoteLine] = await prisma.quotationLine.findMany({ where: { quotationId: draft.id } });
    const quotePhoto = await photo("quotation.line-photo");
    await prisma.quotationLinePhoto.create({ data: { lineId: quoteLine.id, position: 1, fileId: quotePhoto } });
    expect(await isPendingDocumentPhoto("quotation", quotePhoto)).toBe(false);
    const sent = await submitted(s.quotation, ACTOR, draft);
    expect(await isPendingDocumentPhoto("quotation", quotePhoto)).toBe(true);
    await prisma.$executeRaw`UPDATE "partner"."quotation" SET deleted_at = now(), deleted_by = ${ACTOR} WHERE id = ${sent.id}::uuid`;
    expect(await isPendingDocumentPhoto("quotation", quotePhoto)).toBe(false);
  });

  it("IT-AP-B11 EXPLAIN: summary and the default pending use <t>_pending_idx", async () => {
    const { summarySql, pendingSql } = await import("../../src/approval/approval.service");
    const { APPROVAL_REGISTRY } = await import("../../src/approval/approval.registry");
    const { Prisma: P } = await import("../../src/generated/prisma/client");
    const plans = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      const explain = async (query: import("../../src/generated/prisma/client").Prisma.Sql) =>
        (await tx.$queryRaw<{ "QUERY PLAN": string }[]>(P.sql`EXPLAIN ${query}`)).map((row) => row["QUERY PLAN"]).join("\n");
      return {
        summary: await explain(summarySql(["purchase-order", "reserve"])),
        pending: await explain(pendingSql(APPROVAL_REGISTRY["purchase-order"], { sort: "submittedAt", dir: "asc", q: undefined, limit: 50, after: null })),
      };
    });
    expect(plans.summary).toContain("purchase_order_pending_idx");
    expect(plans.summary).toContain("reserve_pending_idx");
    expect(plans.pending).toContain("purchase_order_pending_idx");
  });
});
