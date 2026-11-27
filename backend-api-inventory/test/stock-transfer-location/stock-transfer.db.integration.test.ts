/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTransfer } from "../../src/modules/stock/transfer";
import { lockLoadStocks } from "../../src/modules/stock/stock";
import { canRun, masterModule, startHarness, type Harness } from "../support/harness";
import { internalApi, seedLoad, w } from "../stock-card/support";

/**
 * Stock Transfer Location on PostgreSQL through the real HTTP app and the REAL master internal API (ADR-0060 checklist,
 * testing.md IT-STL-01…14 + NP-STL). Rows are scoped to the loads / transfers created here and removed in afterAll.
 */
const LEAF = "stock-transfer-location";
const ALL = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `${LEAF}:${action}`);
let h: Harness;
let maker: Awaited<ReturnType<Harness["user"]>>;
let approver: Awaited<ReturnType<Harness["user"]>>;
const loads: string[] = [];
const transfers: string[] = [];

async function setApproval(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = ${LEAF}`;
}
async function stock(options: { pcs?: number; weightCt?: string; cost?: string; location?: string; lot?: string; docDate?: string } = {}) {
  const seeded = await seedLoad(h, { pcs: options.pcs ?? 10, weightCt: options.weightCt ?? "5.000", location: options.location ?? "Safe A", lot: options.lot ?? `STL-${randomUUID().slice(0, 6)}`, stoneCode: `STL-${randomUUID().slice(0, 8)}`, docDate: options.docDate });
  loads.push(seeded.loadId);
  await h.ownerDb.stock.update({ where: { id: seeded.id }, data: { cost_amount_base: options.cost ?? "1000.00", unit_cost_base: "200", stock_price: "300", sale_price: "400" } });
  return seeded;
}
const row = (id: string) => h.ownerDb.stock.findUniqueOrThrow({ where: { id } });
const lineOf = (s: { id: string }, patch: Record<string, unknown> = {}) => ({ fromStockUuid: s.id, onHandPcs: 10, onHandWeightCt: "5.000", toLocation: "Safe B", pcs: 4, weightCt: "2.000", ...patch });
async function create(lines: Record<string, unknown>[], who = maker) {
  const result = await who.call("POST", "/stock-transfer-location", { docDate: "2026-11-24", ref: "IT", lines });
  if (result.body.id) transfers.push(result.body.id);
  return result;
}
const detail = async (id: string) => (await maker.call("GET", `/stock-transfer-location/${id}`)).body;

describe.runIf(canRun)("IT-STL stock transfer location on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    const { ensureTestLocations } = await masterModule("test/partner-shared/locations");
    await ensureTestLocations(h.master.prisma, ["Safe A", "Safe B", "Safe C"]);
    await h.master.prisma.$executeRaw`INSERT INTO "partner"."location" ("id", "name", "active", "created_by", "updated_by") VALUES (gen_random_uuid(), 'STL Closed', false, 'test', 'test') ON CONFLICT ((lower("name"))) DO UPDATE SET "active" = false`;
    maker = await h.user([...ALL, "stock-card:VIEW"]);
    approver = await h.user(ALL);
    await setApproval(false);
  }, 120_000);

  afterAll(async () => {
    if (!h) return;
    const db = h.ownerDb;
    const stocks = (await db.stock.findMany({ where: { load_id: { in: loads } }, select: { id: true, transferred_from_uuid: true } }));
    const ids = stocks.map((s) => s.id);
    await db.notification_event.deleteMany({ where: { document_id: { in: transfers } } });
    await db.stock_transfer.deleteMany({ where: { id: { in: transfers } } });
    await db.stock_movement.deleteMany({ where: { stock_uuid: { in: ids } } });
    await db.stock_photo.deleteMany({ where: { stock_uuid: { in: ids } } });
    const holds = await db.stock_hold.findMany({ where: { stock_uuid: { in: ids } }, select: { document_type: true, document_id: true } });
    await db.stock_hold.deleteMany({ where: { stock_uuid: { in: ids } } });
    for (const doc of holds) await db.stock_hold_document.deleteMany({ where: { document_type: doc.document_type, document_id: doc.document_id } });
    // Children (born by a transfer) first: chains are at most two deep here.
    await db.stock.deleteMany({ where: { id: { in: stocks.filter((s) => s.transferred_from_uuid).map((s) => s.id) }, transferred_to: { none: {} } } });
    await db.stock.deleteMany({ where: { id: { in: stocks.filter((s) => s.transferred_from_uuid).map((s) => s.id) } } });
    await db.stock.deleteMany({ where: { id: { in: ids } } });
    await db.load_to_stock.deleteMany({ where: { id: { in: loads } } });
    await h.master.prisma.stockIdIssue.deleteMany({ where: { documentId: { in: transfers } } });
    await setApproval(true);
    await h.close();
  }, 120_000);

  it("IT-STL-01 partial move (approval OFF): new Stock ID with the moved qty, source keeps the rest, cost split exactly, ledger OUT + IN", async () => {
    const s = await stock();
    const created = await create([lineOf(s)]);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "APPROVED", version: 1 });
    expect(created.body.docNo).toBeTruthy();
    const source = await row(s.id);
    expect([source.pcs, w(source.weight_ct.toString()), source.on_hand_pcs, w(source.on_hand_weight_ct.toString()), source.cost_amount_base.toFixed(2), source.location, source.version]).toEqual([6, "3.000", 6, "3.000", "600.00", "Safe A", 2]);
    const fresh = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id } });
    expect([fresh.pcs, w(fresh.weight_ct.toString()), fresh.on_hand_pcs, fresh.cost_amount_base.toFixed(2), fresh.location, fresh.load_id, fresh.lot, fresh.ref_doc_no, fresh.stock_price.toFixed(2), fresh.version]).toEqual([4, "2.000", 4, "400.00", "Safe B", s.loadId, source.lot, source.ref_doc_no, "300.00", 1]);
    expect(fresh.stock_id).not.toBe(s.stockId);
    expect(fresh.card_key).not.toBe(source.card_key);
    const ledger = await h.ownerDb.stock_movement.findMany({ where: { document_id: created.body.id }, orderBy: { kind: "asc" } });
    expect(ledger.map((m) => [m.kind, m.stock_uuid === s.id ? "src" : "new", m.pcs_delta, w(m.weight_delta.toString()), m.cost_delta_base.toFixed(2)])).toEqual([
      ["TRANSFER_IN", "new", 4, "2.000", "400.00"], ["TRANSFER_OUT", "src", -4, "-2.000", "-400.00"],
    ]);
    const doc = await detail(created.body.id);
    expect(doc.lines[0]).toMatchObject({ stockId: s.stockId, newStockId: fresh.stock_id, fromLocation: "Safe A", toLocation: "Safe B", pcs: 4, weightCt: "2.000", attrs: { location: "Safe A" } });
    expect(doc.approval).toMatchObject({ requireApproval: false, autoApproved: true });
  });

  it("IT-STL-02 whole move: source on hand 0 and gone from the picker; the new row is listed; total cost unchanged", async () => {
    const s = await stock();
    const created = await create([lineOf(s, { pcs: 10, weightCt: "5.000", toLocation: "safe c" })]);
    expect(created.status).toBe(201);
    const source = await row(s.id);
    expect([source.pcs, source.on_hand_pcs, w(source.weight_ct.toString()), source.cost_amount_base.toFixed(2), source.status]).toEqual([0, 0, "0.000", "0.00", "ACTIVE"]);
    const fresh = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id } });
    expect([fresh.cost_amount_base.toFixed(2), fresh.location]).toEqual(["1000.00", "Safe C"]);
    const picker = await maker.call("GET", `/stock-transfer-location/stock?q=${encodeURIComponent(s.stockId)}`);
    expect(picker.body.items).toEqual([]);
    const listed = await maker.call("GET", `/stock-transfer-location/stock?q=${encodeURIComponent(fresh.stock_id)}`);
    expect(listed.body.items.map((item: any) => [item.stockUuid, item.location, item.onHandPcs, item.onHandWeightCt])).toEqual([[fresh.id, "Safe C", 10, "5.000"]]);
  });

  it("IT-STL-03 Stock Card: old card OUT and new card IN, both with the transfer number and → / ← account", async () => {
    const s = await stock();
    const created = await create([lineOf(s)]);
    const source = await row(s.id);
    const fresh = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id } });
    const out = await maker.call("GET", `/stock-card/cards/${source.card_key}/transactions`);
    expect(out.status).toBe(200);
    const outRow = out.body.items.find((item: any) => item.docType === LEAF);
    expect(outRow).toMatchObject({ docId: created.body.id, docNo: created.body.docNo, docDate: "2026-11-24", docTypeLabel: "Stock Transfer Location", stockId: s.stockId, accountName: "→ Safe B", outPcs: 4, outWeightCt: "2.000", inPcs: null });
    const inn = await maker.call("GET", `/stock-card/cards/${fresh.card_key}/transactions`);
    expect(inn.body.items).toHaveLength(1);
    expect(inn.body.items[0]).toMatchObject({ docId: created.body.id, docNo: created.body.docNo, stockId: fresh.stock_id, accountName: "← Safe A", inPcs: 4, inWeightCt: "2.000", balancePcs: 4 });
  });

  it("IT-STL-04 on hand changed after pick → 409 with live on hand, nothing written (pre-check and the locked apply)", async () => {
    const s = await stock();
    await h.ownerDb.stock.update({ where: { id: s.id }, data: { on_hand_pcs: 3, reserved_pcs: 7 } });
    const before = await h.ownerDb.stock_transfer.count();
    const refused = await create([lineOf(s)]);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "STOCK_TRANSFER_EXCEEDS_ON_HAND", details: { lines: [{ lineId: s.id, rowPath: "lines.0", onHandPcs: 3, onHandWeightCt: "5.000" }] } });
    expect(await h.ownerDb.stock_transfer.count()).toBe(before);
    // The locked apply refuses the same way and rolls back every write.
    await expect(h.db.$transaction((tx) => applyTransfer(tx, { transferId: randomUUID(), revision: 1, actorId: "it" }, [{ lineId: "x", fromStockUuid: s.id, fromLocation: "Safe A", toLocation: "Safe B", pcs: 4, weightCt: "1" }], ["ZZ0001"]))).rejects.toMatchObject({ code: "STOCK_TRANSFER_EXCEEDS_ON_HAND" });
    const after = await row(s.id);
    expect([after.version, after.on_hand_pcs, await h.ownerDb.stock.count({ where: { transferred_from_uuid: s.id } })]).toEqual([1, 3, 0]);
  });

  it("IT-STL-05 locations: unknown / inactive / unchanged → 422 LOCATION_INVALID; a moved or reversed source → 422 LINE_UNAVAILABLE", async () => {
    const s = await stock();
    for (const toLocation of ["Nowhere", "STL Closed", "Safe A"]) {
      const refused = await create([lineOf(s, { toLocation })]);
      expect(refused.status).toBe(422);
      expect(refused.body.error).toMatchObject({ code: "LOCATION_INVALID", details: { lineIds: [s.id], lines: [{ lineId: s.id, rowPath: "lines.0" }] } });
    }
    await h.ownerDb.stock.update({ where: { id: s.id }, data: { status: "REVERSED", pcs: 0, weight_ct: 0, on_hand_pcs: 0, on_hand_weight_ct: 0 } });
    const gone = await create([lineOf(s, { pcs: 0, weightCt: "1" })]);
    expect(gone.body.error).toMatchObject({ code: "STOCK_TRANSFER_LINE_UNAVAILABLE", details: { lineIds: [s.id] } });
    const invalid = await create([lineOf(s, { pcs: 11 })]);
    expect([invalid.status, invalid.body.error.code, invalid.body.error.details.fieldErrors[0].path]).toEqual([400, "VALIDATION_FAILED", "lines.0.pcs"]);
  });

  it("IT-STL-06 approval ON: DRAFT → submit → PENDING → approve applies (with notifications); summary and pending list include the type", async () => {
    await setApproval(true);
    try {
      const s = await stock();
      const created = await create([lineOf(s)]);
      expect(created.body.status).toBe("DRAFT");
      expect((await row(s.id)).version).toBe(1);
      const edited = await maker.call("PUT", `/stock-transfer-location/${created.body.id}`, { docDate: "2026-11-24", ref: "IT edited", lines: [lineOf(s, { pcs: 5, weightCt: "2.500", id: (await detail(created.body.id)).lines[0].id })], expectedVersion: 1 });
      expect(edited.body).toMatchObject({ status: "DRAFT", version: 2 });
      const submitted = await maker.call("POST", `/stock-transfer-location/${created.body.id}/submit`, { expectedVersion: 2 });
      expect(submitted.body).toMatchObject({ status: "PENDING_APPROVAL", version: 3 });
      const summary = await approver.call("GET", "/approval/summary");
      expect(summary.body.items).toContainEqual({ type: LEAF, count: expect.any(Number) });
      const pending = await approver.call("GET", `/approval/pending?type=${LEAF}&q=${encodeURIComponent(created.body.docNo)}`);
      expect(pending.body.items).toEqual([expect.objectContaining({ id: created.body.id, partyName: "IT edited", totalPcs: 5, totalWeightCt: "2.500", lineCount: 1, revisionCount: 0 })]);
      const stale = await approver.call("POST", `/stock-transfer-location/${created.body.id}/approve`, { expectedVersion: 2 });
      expect(stale.body.error).toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 3 } });
      const noRight = await maker.call("POST", `/stock-transfer-location/${created.body.id}/approve`, { expectedVersion: 3 });
      expect(noRight.status).toBe(200); // maker also holds APPROVE + VIEW here
      expect(noRight.body.status).toBe("APPROVED");
      expect((await row(s.id)).on_hand_pcs).toBe(5);
      expect(await h.ownerDb.notification_event.count({ where: { document_id: created.body.id } })).toBe(2);
      const doc = await detail(created.body.id);
      expect(doc.approval).toMatchObject({ requireApproval: true, autoApproved: false, submitted: expect.any(Object) });
      // an approver-approved transfer can't be edited or deleted
      const del = await maker.call("POST", `/stock-transfer-location/${created.body.id}/delete`, { expectedVersion: doc.version });
      expect(del.body.error).toMatchObject({ code: "STOCK_TRANSFER_STATUS", details: { status: "APPROVED" } });
    } finally {
      await setApproval(false);
    }
  });

  it("IT-STL-07 revise once, then reject is final; submit while OFF → STOCK_TRANSFER_APPROVAL_OFF", async () => {
    await setApproval(true);
    const s = await stock();
    const created = await create([lineOf(s)]);
    await maker.call("POST", `/stock-transfer-location/${created.body.id}/submit`, { expectedVersion: 1 });
    const revised = await approver.call("POST", `/stock-transfer-location/${created.body.id}/request-revision`, { expectedVersion: 2, note: "fix" });
    expect(revised.body.status).toBe("REVISION_REQUESTED");
    await maker.call("POST", `/stock-transfer-location/${created.body.id}/submit`, { expectedVersion: 3 });
    const again = await approver.call("POST", `/stock-transfer-location/${created.body.id}/request-revision`, { expectedVersion: 4, note: "again" });
    expect(again.body.error.code).toBe("STOCK_TRANSFER_REVISE_LIMIT");
    const rejected = await approver.call("POST", `/stock-transfer-location/${created.body.id}/reject`, { expectedVersion: 4, reason: "no" });
    expect(rejected.body.status).toBe("REJECTED");
    const edit = await maker.call("PUT", `/stock-transfer-location/${created.body.id}`, { docDate: "2026-11-24", ref: "", lines: [lineOf(s)], expectedVersion: 5 });
    expect(edit.body.error).toMatchObject({ code: "STOCK_TRANSFER_STATUS", details: { status: "REJECTED" } });
    const draft = await create([lineOf(await stock())]);
    await setApproval(false);
    const off = await maker.call("POST", `/stock-transfer-location/${draft.body.id}/submit`, { expectedVersion: 1 });
    expect([off.status, off.body.error.code]).toEqual([409, "STOCK_TRANSFER_APPROVAL_OFF"]);
    // a DRAFT saved while approval is OFF is applied now
    const lineId = (await detail(draft.body.id)).lines[0].id;
    const applied = await maker.call("PUT", `/stock-transfer-location/${draft.body.id}`, { docDate: "2026-11-24", ref: "", lines: [lineOf({ id: (await detail(draft.body.id)).lines[0].fromStockUuid }, { id: lineId })], expectedVersion: 1 });
    expect(applied.body).toMatchObject({ status: "APPROVED", version: 2 });
    expect((await detail(draft.body.id)).lines[0]).toMatchObject({ id: lineId, newStockId: expect.any(String) });
  });

  it("IT-STL-08 edit after effect: reverse + re-apply in one transaction (new Stock ID, old one REVERSED); delete reverses; restore → DRAFT", async () => {
    const s = await stock();
    const created = await create([lineOf(s)]);
    const first = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id } });
    const lineId = (await detail(created.body.id)).lines[0].id;
    const edited = await maker.call("PUT", `/stock-transfer-location/${created.body.id}`, { docDate: "2026-11-24", ref: "IT", lines: [lineOf(s, { id: lineId, pcs: 10, weightCt: "5.000", toLocation: "Safe C" })], expectedVersion: 1 });
    expect(edited.body).toMatchObject({ status: "APPROVED", version: 2 });
    expect((await row(first.id)).status).toBe("REVERSED");
    const second = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id, status: "ACTIVE" } });
    expect([second.pcs, second.location, second.cost_amount_base.toFixed(2)]).toEqual([10, "Safe C", "1000.00"]);
    expect(second.stock_id).not.toBe(first.stock_id);
    expect((await row(s.id)).on_hand_pcs).toBe(0);
    const removed = await maker.call("POST", `/stock-transfer-location/${created.body.id}/delete`, { expectedVersion: 2 });
    expect(removed.status).toBe(200);
    const back = await row(s.id);
    expect([back.pcs, back.on_hand_pcs, w(back.weight_ct.toString()), back.cost_amount_base.toFixed(2)]).toEqual([10, 10, "5.000", "1000.00"]);
    expect((await row(second.id)).status).toBe("REVERSED");
    const kinds = await h.ownerDb.stock_movement.groupBy({ by: ["kind"], where: { document_id: created.body.id }, _count: true });
    expect(Object.fromEntries(kinds.map((k) => [k.kind, k._count]))).toEqual({ TRANSFER_OUT: 2, TRANSFER_IN: 2, TRANSFER_OUT_REVERSAL: 2, TRANSFER_IN_REVERSAL: 2 });
    // Stock Card: everything nets to zero for this document
    const card = await maker.call("GET", `/stock-card/cards/${back.card_key}/transactions`);
    expect(card.body.items.some((item: any) => item.docId === created.body.id)).toBe(false);
    const restored = await maker.call("POST", `/stock-transfer-location/${created.body.id}/restore`, { expectedVersion: 3 });
    expect(restored.body).toMatchObject({ status: "DRAFT", version: 4 });
    const list = await maker.call("GET", `/stock-transfer-location?q=${encodeURIComponent(created.body.docNo)}`);
    expect(list.body.items).toEqual([expect.objectContaining({ id: created.body.id, status: "DRAFT", deleted: false, lineCount: 1 })]);
  });

  it("IT-STL-09 IN_USE: a reserved new stock blocks edit / delete; the Load of a transferred stock is in use too", async () => {
    const s = await stock();
    const created = await create([lineOf(s)]);
    const fresh = await h.ownerDb.stock.findFirstOrThrow({ where: { transferred_from_uuid: s.id } });
    const locked = await h.db.$transaction((tx) => lockLoadStocks(tx, s.loadId));
    expect(locked.inUse.sort()).toEqual([s.stockId, fresh.stock_id].sort());
    const internal = internalApi(h);
    const held = await internal.hold("reserve", randomUUID(), [{ stockUuid: fresh.id, pcs: 1, weightCt: "0.500" }]);
    expect(held.status).toBe(200);
    const del = await maker.call("POST", `/stock-transfer-location/${created.body.id}/delete`, { expectedVersion: 1 });
    expect(del.body.error).toMatchObject({ code: "STOCK_TRANSFER_IN_USE", details: { stockIds: [fresh.stock_id] } });
    expect((await detail(created.body.id)).version).toBe(1);
    // a source changed since the apply blocks too
    const s2 = await stock();
    const c2 = await create([lineOf(s2)]);
    await create([lineOf(s2, { onHandPcs: 6, onHandWeightCt: "3.000", pcs: 1, weightCt: "0.5" })]);
    const del2 = await maker.call("POST", `/stock-transfer-location/${c2.body.id}/delete`, { expectedVersion: 1 });
    expect(del2.body.error).toMatchObject({ code: "STOCK_TRANSFER_IN_USE", details: { stockIds: [s2.stockId] } });
  });

  it("IT-STL-10 Stock ID issue: same revision replays the same ids, more ids append, a lower revision is VERSION_CONFLICT", async () => {
    const id = randomUUID();
    transfers.push(id);
    const first = await h.masterApi.issueStockIds(LEAF, id, 1, 2);
    expect(first).toMatchObject({ revision: 1, replayed: false });
    expect(first.stockIds).toHaveLength(2);
    expect(await h.masterApi.issueStockIds(LEAF, id, 1, 2)).toEqual({ revision: 1, stockIds: first.stockIds, replayed: true });
    const more = await h.masterApi.issueStockIds(LEAF, id, 1, 3);
    expect(more.stockIds.slice(0, 2)).toEqual(first.stockIds);
    expect(new Set(more.stockIds).size).toBe(3);
    const next = await h.masterApi.issueStockIds(LEAF, id, 2, 1);
    expect(first.stockIds).not.toContain(next.stockIds[0]);
    await expect(h.masterApi.issueStockIds(LEAF, id, 1, 1)).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("IT-STL-11 picker filters: own open stock only, location, q (Stock ID / lot), exclude, keyset paging oldest first", async () => {
    const lot = `PK-${randomUUID().slice(0, 6)}`;
    const a = await stock({ lot, docDate: "2026-01-01" });
    const b = await stock({ lot, docDate: "2026-01-02", location: "Safe B" });
    const c = await stock({ lot, docDate: "2026-01-03" });
    await h.ownerDb.stock.update({ where: { id: c.id }, data: { on_hand_pcs: 0, on_hand_weight_ct: 0, reserved_pcs: 10, reserved_weight_ct: "5" } });
    const all = await maker.call("GET", `/stock-transfer-location/stock?q=${lot}`);
    expect(all.body.items.map((item: any) => item.stockUuid)).toEqual([a.id, b.id]);
    expect(all.body.items[0]).toMatchObject({ stockId: a.stockId, lotKey: `OS${a.id}`, location: "Safe A", priceUnit: "PER_CT", stockPrice: "300.00", currency: "THB", onHandPcs: 10, onHandWeightCt: "5.000", refDocDate: "2026-01-01" });
    expect(all.body.items[0]).not.toHaveProperty("costAmountBase");
    expect((await maker.call("GET", `/stock-transfer-location/stock?q=${lot}&location=safe%20b`)).body.items.map((item: any) => item.stockUuid)).toEqual([b.id]);
    expect((await maker.call("GET", `/stock-transfer-location/stock?q=${lot}&exclude=${a.id}`)).body.items.map((item: any) => item.stockUuid)).toEqual([b.id]);
    const page1 = await maker.call("GET", `/stock-transfer-location/stock?q=${lot}&limit=1`);
    expect(page1.body.items.map((item: any) => item.stockUuid)).toEqual([a.id]);
    const page2 = await maker.call("GET", `/stock-transfer-location/stock?q=${lot}&limit=1&cursor=${page1.body.nextCursor}`);
    expect([page2.body.items.map((item: any) => item.stockUuid), page2.body.nextCursor]).toEqual([[b.id], null]);
    expect((await maker.call("GET", `/stock-transfer-location/stock?cursor=bad!`)).status).toBe(400);
  });

  it("IT-STL-12 grants and CSRF per route", async () => {
    const none = await h.user(["stock-card:VIEW"]);
    const viewer = await h.user([`${LEAF}:VIEW`]);
    const s = await stock();
    for (const [method, path] of [["GET", "/stock-transfer-location"], ["GET", "/stock-transfer-location/stock"], ["GET", "/stock-transfer-location/options"], ["GET", `/stock-transfer-location/${randomUUID()}`]] as const) {
      expect((await none.call(method, path)).status).toBe(403);
    }
    expect((await viewer.call("GET", "/stock-transfer-location")).status).toBe(200);
    expect((await viewer.call("POST", "/stock-transfer-location", { docDate: "2026-11-24", ref: "", lines: [lineOf(s)] })).status).toBe(403);
    for (const action of ["approve", "request-revision", "reject", "delete", "restore", "submit"]) {
      expect((await viewer.call("POST", `/stock-transfer-location/${randomUUID()}/${action}`, { expectedVersion: 1, note: "x", reason: "x" })).status).toBe(403);
    }
    expect((await viewer.call("PUT", `/stock-transfer-location/${randomUUID()}`, { docDate: "2026-11-24", ref: "", lines: [lineOf(s)], expectedVersion: 1 })).status).toBe(403);
    const csrf = await maker.call("POST", "/stock-transfer-location", { docDate: "2026-11-24", ref: "", lines: [lineOf(s)] }, { origin: "https://evil.example" });
    expect([csrf.status, csrf.body.error.code]).toEqual([403, "CSRF_INVALID"]);
    expect((await maker.call("GET", "/stock-transfer-location/not-a-uuid")).body.error.code).toBe("STOCK_TRANSFER_NOT_FOUND");
    expect((await row(s.id)).version).toBe(1);
  });

  it("IT-STL-13 options and next number", async () => {
    const options = await maker.call("GET", "/stock-transfer-location/options");
    expect(options.body.locations).toEqual(expect.arrayContaining(["Safe A", "Safe B", "Safe C"]));
    expect(options.body.locations).not.toContain("STL Closed");
    expect(typeof options.body.numbering.configured).toBe("boolean");
    const next = await maker.call("GET", "/stock-transfer-location/next-number?docDate=2026-11-24");
    expect(next.body.docNo).toMatch(/\S/);
  });

  it("NP-STL N+1 budget: list / pending / picker = 1 statement, detail = 2, apply statements do not grow with lines", async () => {
    const stocks = [await stock(), await stock(), await stock(), await stock()];
    const one = await h.measured(() => create([lineOf(stocks[0])]));
    const three = await h.measured(() => create([lineOf(stocks[1]), lineOf(stocks[2]), lineOf(stocks[3])]));
    expect(one.result.status).toBe(201);
    expect(three.result.status).toBe(201);
    expect(three.queries).toBe(one.queries);
    // master: location resolve + numbering + one Stock ID issue, all before the transaction
    expect(one.master).toHaveLength(3);
    expect(one.master.filter((call) => call.includes("/stock-id-issues/"))).toHaveLength(1);
    const detailRead = await h.measured(() => maker.call("GET", `/stock-transfer-location/${three.result.body.id}`));
    expect(detailRead.queries).toBe(2);
    const list = await h.measured(() => maker.call("GET", "/stock-transfer-location?limit=50"));
    expect(list.result.body.items.length).toBeGreaterThan(3);
    expect(list.queries).toBe(1);
    const picker = await h.measured(() => maker.call("GET", "/stock-transfer-location/stock?limit=50"));
    expect(picker.queries).toBe(1);
    const pending = await h.measured(() => approver.call("GET", `/approval/pending?type=${LEAF}`));
    expect(pending.queries).toBe(1);
    const reversal = await h.measured(() => maker.call("POST", `/stock-transfer-location/${three.result.body.id}/delete`, { expectedVersion: 1 }));
    expect(reversal.result.status).toBe(200);
    const reversalOne = await h.measured(() => maker.call("POST", `/stock-transfer-location/${one.result.body.id}/delete`, { expectedVersion: 1 }));
    expect(reversal.queries).toBe(reversalOne.queries);
    console.info(`NP-STL create(1 line)=${one.queries} create(3 lines)=${three.queries} detail=${detailRead.queries} list=${list.queries} picker=${picker.queries} pending=${pending.queries} delete+reverse=${reversal.queries}`);
  });
});

