/* eslint-disable @typescript-eslint/no-explicit-any -- Hono API responses are checked as JSON */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRun, masterFixtures, masterModule, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, seedLoad } from "../stock-card/support";

/** IT-SAJ-B01…10: real Postgres, inventory Hono, and master numbering/reference API. */
const TAG = `saj-it-${randomUUID().slice(0, 8)}`;
const MAKER = ["stock-adjustment:VIEW", "stock-adjustment:ADD", "stock-adjustment:EDIT", "stock-adjustment:DELETE"];
const APPROVER = ["stock-adjustment:VIEW", "stock-adjustment:APPROVE"];
type User = Awaited<ReturnType<Harness["user"]>>;
let h: Harness;
let maker: User;
let approver: User;
let viewer: User;
let numberingSetup: any;
let originalSetup: any = null;
let createdSetup = false;
let setupVersion = 1;
const loads: string[] = [];
const docs: string[] = [];
const date = "2026-11-24";
const body = (stock: { id: string }, stockPcs: number, stockWeightCt: string, physicalPcs: number, physicalWeightCt: string, patch: Record<string, unknown> = {}) => ({
  docDate: date, location: "Safe A", ref: TAG, note: "integration", lines: [{ stockUuid: stock.id, stockPcs, stockWeightCt, physicalPcs, physicalWeightCt, physicalPrice: null, remark: "count" }], ...patch,
});

async function setting(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'stock-adjustment'`;
}
async function configureNumbering() {
  const setupModule = await masterModule("src/document-setup/document-setup.service");
  numberingSetup = new setupModule.DocumentSetupService();
  const prisma = h.master.prisma;
  originalSetup = await prisma.documentSetup.findUnique({ where: { transactionKey: "stock-adjustment" }, include: { rows: true } });
  if (originalSetup) {
    await prisma.documentNumbering.updateMany({ where: { transactionKey: "stock-adjustment" }, data: { externalUsedAt: null } });
    const rows = originalSetup.rows.filter((row: any) => row.effectiveDate.toISOString().slice(0, 10) !== date).map((row: any) => ({
      effectiveDate: row.effectiveDate.toISOString().slice(0, 10), prefix: row.prefix, separator: row.separator, startNo: row.startNo,
    }));
    rows.push({ effectiveDate: date, prefix: "SA", separator: "-", startNo: 1 });
    const updated = await numberingSetup.save(TAG, { transactionKey: "stock-adjustment", name: "Stock Adjustment", code: originalSetup.code, startFrom: originalSetup.startFrom,
      declaration: originalSetup.declaration, expectedVersion: originalSetup.version, rows });
    setupVersion = updated.setup.version;
    return;
  }
  const created = await numberingSetup.save(TAG, { transactionKey: "stock-adjustment", name: "Stock Adjustment", code: `SAJ${TAG.slice(-4).toUpperCase()}`, startFrom: 1,
    declaration: "", expectedVersion: null, rows: [{ effectiveDate: date, prefix: "SA", separator: "-", startNo: 1 }] });
  setupVersion = created.setup.version;
  createdSetup = true;
}
async function restoreNumbering() {
  const prisma = h.master.prisma;
  await prisma.documentNumbering.updateMany({ where: { transactionKey: "stock-adjustment" }, data: { externalUsedAt: null } });
  if (createdSetup) {
    await prisma.documentSetup.deleteMany({ where: { transactionKey: "stock-adjustment" } });
  } else if (originalSetup) {
    const rows = originalSetup.rows.map((row: any) => ({ effectiveDate: row.effectiveDate.toISOString().slice(0, 10), prefix: row.prefix, separator: row.separator, startNo: row.startNo }));
    await numberingSetup.save(TAG, { transactionKey: "stock-adjustment", name: originalSetup.name, code: originalSetup.code, startFrom: originalSetup.startFrom,
      declaration: originalSetup.declaration, expectedVersion: setupVersion, rows });
  }
}
async function seeded(pcs = 4, weightCt = "2.000") {
  const row = await seedLoad(h, { location: "Safe A", lot: `${TAG}-${loads.length}`, pcs, weightCt });
  loads.push(row.loadId);
  return row;
}
async function created(user: User, input: unknown) {
  const result = await user.call("POST", "/stock-adjustment", input);
  if (result.body.id) docs.push(result.body.id);
  return result;
}

describe.runIf(canRun)("IT-SAJ Stock Adjustment on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    await masterFixtures(h, TAG);
    await configureNumbering();
    maker = await h.user(MAKER, { name: "Adjustment Maker" });
    approver = await h.user(APPROVER, { name: "Adjustment Approver" });
    viewer = await h.user(["stock-adjustment:VIEW"]);
    h.approverIds.push(approver.userId);
    await setting(false);
  }, 90_000);

  afterAll(async () => {
    if (!h) return;
    if (docs.length) {
      await h.ownerDb.notification_event.deleteMany({ where: { document_id: { in: docs } } });
      await h.ownerDb.stock_adjustment.deleteMany({ where: { id: { in: docs } } });
    }
    await cleanupLoads(h, loads);
    await setting(true);
    await restoreNumbering();
    await h.close();
  }, 90_000);

  it("IT-SAJ-B01/B02/B05 applies bounded set-counts, preserves balance and reverses effective auto-approved docs", async () => {
    const stock = await seeded();
    await h.ownerDb.stock.update({ where: { id: stock.id }, data: { unit_cost_base: "10.0000", cost_amount_base: "40.00", stock_price: "100.00" } });
    const saved = await created(maker, body(stock, 4, "2.000", 5, "2.500", { lines: [{ stockUuid: stock.id, stockPcs: 4, stockWeightCt: "2.000", physicalPcs: 5, physicalWeightCt: "2.500", physicalPrice: "125.00", remark: "count" }] }));
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ status: "APPROVED", version: 1 });
    const after = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } });
    expect([after.pcs, after.on_hand_pcs, after.weight_ct.toFixed(3), after.on_hand_weight_ct.toFixed(3), after.stock_price.toFixed(2), after.cost_amount_base.toFixed(2)]).toEqual([5, 5, "2.500", "2.500", "125.00", "45.00"]);
    const movement = await h.ownerDb.stock_movement.findFirstOrThrow({ where: { document_type: "stock-adjustment", document_id: saved.body.id } });
    expect([movement.kind, movement.pcs_delta, movement.weight_delta.toFixed(3), movement.cost_delta_base.toFixed(2)]).toEqual(["ADJUST", 1, "0.500", "5.00"]);
    const detail = await maker.call("GET", `/stock-adjustment/${saved.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lines[0]).toMatchObject({ stockPcs: 4, physicalPcs: 5, stockPrice: "100.00", physicalPrice: "125.00", diffPcs: 1 });
    const edited = await maker.call("PUT", `/stock-adjustment/${saved.body.id}`, body(stock, 4, "2.000", 6, "3.000", { lines: [{ stockUuid: stock.id, stockPcs: 4, stockWeightCt: "2.000", physicalPcs: 6, physicalWeightCt: "3.000", physicalPrice: "130.00", remark: "recount" }], expectedVersion: 1 }));
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ version: 2, status: "APPROVED" });
    const editedStock = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } });
    expect([editedStock.pcs, editedStock.on_hand_pcs, editedStock.weight_ct.toFixed(3), editedStock.stock_price.toFixed(2)]).toEqual([6, 6, "3.000", "130.00"]);
    const deleted = await maker.call("POST", `/stock-adjustment/${saved.body.id}/delete`, { expectedVersion: 2 });
    expect(deleted.status).toBe(200);
    const restored = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } });
    expect([restored.pcs, restored.on_hand_pcs, restored.weight_ct.toFixed(3), restored.stock_price.toFixed(2), restored.cost_amount_base.toFixed(2)]).toEqual([4, 4, "2.000", "100.00", "40.00"]);
    const reversal = await h.ownerDb.stock_movement.findFirstOrThrow({ where: { document_type: "stock-adjustment", document_id: saved.body.id, kind: "ADJUST_REVERSAL", pcs_delta: -2 } });
    expect([reversal.pcs_delta, reversal.weight_delta.toFixed(3)]).toEqual([-2, "-1.000"]);
    const restoredDoc = await maker.call("POST", `/stock-adjustment/${saved.body.id}/restore`, { expectedVersion: 3 });
    expect(restoredDoc.body).toMatchObject({ version: 4, status: "DRAFT" });
    expect((await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } })).on_hand_pcs).toBe(4);
  });

  it("IT-SAJ-B01 skips stock writes for a no-change line but records a price-only adjustment", async () => {
    const same = await seeded();
    const before = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: same.id } });
    const unchanged = await created(maker, body(same, 4, "2.000", 4, "2.000"));
    expect(unchanged.status).toBe(201);
    const afterNoop = await h.ownerDb.stock.findUniqueOrThrow({ where: { id: same.id } });
    expect([afterNoop.version, afterNoop.first_used_at]).toEqual([before.version, null]);
    expect(await h.ownerDb.stock_movement.count({ where: { document_type: "stock-adjustment", document_id: unchanged.body.id } })).toBe(0);

    const price = await seeded();
    const priceOnly = await created(maker, body(price, 4, "2.000", 4, "2.000", { lines: [{ stockUuid: price.id, stockPcs: 4, stockWeightCt: "2.000", physicalPcs: 4, physicalWeightCt: "2.000", physicalPrice: "99.00", remark: "price" }] }));
    expect(priceOnly.status).toBe(201);
    const movement = await h.ownerDb.stock_movement.findFirstOrThrow({ where: { document_type: "stock-adjustment", document_id: priceOnly.body.id } });
    expect([movement.kind, movement.pcs_delta, movement.weight_delta.toFixed(3), movement.cost_delta_base.toFixed(2)]).toEqual(["ADJUST", 0, "0.000", "0.00"]);
    expect((await h.ownerDb.stock.findUniqueOrThrow({ where: { id: price.id } })).stock_price.toFixed(2)).toBe("99.00");
  });

  it("IT-SAJ-B03/B04/B06/B09 rejects stale stock, requires approval when enabled, and limits the picker to own positive stock", async () => {
    await setting(true);
    const options = await maker.call("GET", "/stock-adjustment/options");
    expect(options.status).toBe(200);
    expect(options.body).toMatchObject({ numbering: { configured: true } });
    const previewA = await maker.call("GET", `/stock-adjustment/next-number?docDate=${date}`);
    const previewB = await maker.call("GET", `/stock-adjustment/next-number?docDate=${date}`);
    expect(previewA.body.docNo).toMatch(/^SA/);
    expect(previewB.body.docNo).toBe(previewA.body.docNo);
    const stock = await seeded();
    const cursorRef = `${TAG}-cursor`;
    const draft = await created(maker, body(stock, 4, "2.000", 6, "3.000", { ref: cursorRef }));
    expect(draft.status).toBe(201);
    expect(draft.body.status).toBe("DRAFT");
    expect((await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } })).on_hand_pcs).toBe(4);
    const submitted = await maker.call("POST", `/stock-adjustment/${draft.body.id}/submit`, { expectedVersion: 1 });
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe("PENDING_APPROVAL");
    expect((await approver.call("GET", "/approval/summary")).body.items).toContainEqual(expect.objectContaining({ type: "stock-adjustment", count: expect.any(Number) }));
    const secondPendingStock = await seeded();
    const secondPending = await created(maker, body(secondPendingStock, 4, "2.000", 5, "2.500", { ref: cursorRef }));
    await maker.call("POST", `/stock-adjustment/${secondPending.body.id}/submit`, { expectedVersion: 1 });
    const pending = await approver.call("GET", `/approval/pending?type=stock-adjustment&q=${encodeURIComponent(cursorRef)}&limit=1`);
    expect(pending.status).toBe(200);
    expect(pending.body.nextCursor).toEqual(expect.any(String));
    expect(pending.body.items.some((item: any) => item.id === draft.body.id && item.partyName === "Safe A" && item.revisionCount === 0)).toBe(true);
    const pendingNext = await approver.call("GET", `/approval/pending?type=stock-adjustment&q=${encodeURIComponent(cursorRef)}&limit=1&cursor=${encodeURIComponent(pending.body.nextCursor)}`);
    expect(pendingNext.status).toBe(200);
    expect(pendingNext.body.items).toHaveLength(1);
    expect(pendingNext.body.items[0].id).toBe(secondPending.body.id);
    expect(await h.ownerDb.notification_event.count({ where: { document_id: draft.body.id, type: "approval.pending" } })).toBe(1);
    const approved = await approver.call("POST", `/stock-adjustment/${draft.body.id}/approve`, { expectedVersion: 2 });
    expect(approved.status).toBe(200);
    expect((await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } })).on_hand_pcs).toBe(6);

    const reviseStock = await seeded();
    const reviseDraft = await created(maker, body(reviseStock, 4, "2.000", 3, "1.500"));
    const reviseSubmit = await maker.call("POST", `/stock-adjustment/${reviseDraft.body.id}/submit`, { expectedVersion: 1 });
    const revised = await approver.call("POST", `/stock-adjustment/${reviseDraft.body.id}/request-revision`, { expectedVersion: reviseSubmit.body.version, note: "recount" });
    expect(revised.body.status).toBe("REVISION_REQUESTED");
    const updatedRevision = await maker.call("PUT", `/stock-adjustment/${reviseDraft.body.id}`, body(reviseStock, 4, "2.000", 3, "1.500", { expectedVersion: revised.body.version }));
    expect(updatedRevision.body.status).toBe("REVISION_REQUESTED");
    const reSubmitted = await maker.call("POST", `/stock-adjustment/${reviseDraft.body.id}/submit`, { expectedVersion: updatedRevision.body.version });
    const revisedPending = await approver.call("GET", "/approval/pending?type=stock-adjustment&limit=10");
    expect(revisedPending.body.items.some((item: any) => item.id === reviseDraft.body.id && item.revisionCount === 1)).toBe(true);
    const rejected = await approver.call("POST", `/stock-adjustment/${reviseDraft.body.id}/reject`, { expectedVersion: reSubmitted.body.version, reason: "not approved" });
    expect(rejected.body.status).toBe("REJECTED");

    const stale = await seeded();
    const staleDraft = await created(maker, body(stale, 4, "2.000", 3, "1.500"));
    await h.ownerDb.stock.update({ where: { id: stale.id }, data: { pcs: 5, on_hand_pcs: 5, version: { increment: 1 } } });
    const staleSubmit = await maker.call("POST", `/stock-adjustment/${staleDraft.body.id}/submit`, { expectedVersion: 1 });
    expect(staleSubmit.status).toBe(409);
    expect(staleSubmit.body.error.code).toBe("STOCK_ADJUSTMENT_STOCK_CHANGED");

    const { result: picker, queries } = await h.measured(() => maker.call("GET", `/stock-adjustment/stock?location=Safe%20A&exclude=${stock.id}&limit=10`));
    expect(picker.status).toBe(200);
    expect(picker.body.items.every((item: any) => item.stockUuid !== stock.id && item.onHandPcs > 0)).toBe(true);
    expect(queries).toBe(1);
    expect((await viewer.call("POST", `/stock-adjustment/${draft.body.id}/approve`, { expectedVersion: 2 })).status).toBe(403);
  });

  it("IT-SAJ-B10 serializes concurrent approvals; exactly one applies and the other reports stale stock", async () => {
    await setting(true);
    const stock = await seeded();
    const draft = await created(maker, body(stock, 4, "2.000", 7, "3.500"));
    const submit = await maker.call("POST", `/stock-adjustment/${draft.body.id}/submit`, { expectedVersion: 1 });
    const outcomes = await Promise.all([
      approver.call("POST", `/stock-adjustment/${draft.body.id}/approve`, { expectedVersion: submit.body.version }),
      approver.call("POST", `/stock-adjustment/${draft.body.id}/approve`, { expectedVersion: submit.body.version }),
    ]);
    expect(outcomes.filter((result) => result.status === 200)).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 409 && result.body.error?.code === "STOCK_ADJUSTMENT_STOCK_CHANGED")).toHaveLength(1);
    expect((await h.ownerDb.stock.findUniqueOrThrow({ where: { id: stock.id } })).on_hand_pcs).toBe(7);
  });
});
