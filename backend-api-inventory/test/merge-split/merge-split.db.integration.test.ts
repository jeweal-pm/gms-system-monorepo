/* eslint-disable @typescript-eslint/no-explicit-any -- JSON bodies and untyped master modules */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockLoadStocks } from "../../src/modules/stock/stock";
import { canRun, masterModule, startHarness, type Harness } from "../support/harness";
import { cleanupLoads, internalApi, seedLoad, w } from "../stock-card/support";

/**
 * Merge/Split on PostgreSQL through the real HTTP app and the REAL master internal API (merge-split testing.md IT-MS-B01…B11 and the
 * query budgets). Rows are scoped to the loads / documents created here and removed in afterAll.
 */
const LEAF = "merge-split";
const ALL = ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"].map((action) => `${LEAF}:${action}`);
const TAG = `ms-it-${randomUUID().slice(0, 8)}`;
const DATE = "2026-11-27";
type User = Awaited<ReturnType<Harness["user"]>>;
let h: Harness;
let maker: User;
let other: User;
let viewer: User;
let createdSetup = false;
const loads: string[] = [];
const docs: string[] = [];
const attrs = { stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", cerType: "", cerNo: "" };

async function setApproval(on: boolean) {
  await h.ownerDb.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = ${LEAF}`;
}
async function stock(options: { pcs?: number; weightCt?: string; unitCost?: string; priceUnit?: "PER_CT" | "PER_PCS"; location?: string; docDate?: string; currency?: string } = {}) {
  const seeded = await seedLoad(h, { pcs: options.pcs ?? 10, weightCt: options.weightCt ?? "5.000", location: options.location ?? "Safe A", lot: `MS-${randomUUID().slice(0, 6)}`, stoneCode: `MS-${randomUUID().slice(0, 8)}`, docDate: options.docDate, vendorName: "MS Vendor" });
  loads.push(seeded.loadId);
  await h.ownerDb.stock.update({ where: { id: seeded.id }, data: { unit_cost_base: options.unitCost ?? "200", price_unit: options.priceUnit ?? "PER_CT", cost_amount_base: "1000", stock_price: "300", sale_price: "400", currency_code: options.currency ?? "THB" } });
  return seeded;
}
const row = (id: string) => h.ownerDb.stock.findUniqueOrThrow({ where: { id } });
const result = (patch: Record<string, unknown> = {}) => ({ sourceKey: "a", attrs, location: "Safe A", lot: "R", parcel: "", pcs: 5, weightCt: "2.500", stockPrice: "300", salePrice: "450", itemNote: "", photoIds: [], ...patch });
const splitBody = (s: { id: string }, results: Record<string, unknown>[], patch: Record<string, unknown> = {}) => ({
  docDate: DATE, mode: "SPLIT", ref: TAG, note: "", sources: [{ key: "a", stockUuid: s.id, availPcs: 10, availWeightCt: "5.000" }], results, ...patch,
});
const twoWay = (s: { id: string }, patch: Record<string, unknown> = {}) => splitBody(s, [result({ pcs: 4, weightCt: "2.000" }), result({ pcs: 6, weightCt: "3.000" })], patch);
async function create(body: unknown, who = maker) {
  const response = await who.call("POST", "/merge-split", body);
  if (response.body.id) docs.push(response.body.id);
  return response;
}
const detail = async (id: string) => (await maker.call("GET", `/merge-split/${id}`)).body;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function configureNumbering() {
  const prisma = h.master.prisma;
  if (await prisma.documentSetup.findUnique({ where: { transactionKey: LEAF } })) return;
  const { DocumentSetupService } = await masterModule("src/document-setup/document-setup.service");
  await new DocumentSetupService().save(TAG, { transactionKey: LEAF, name: "Merge/Split", code: "MS", startFrom: 1, declaration: "", expectedVersion: null, rows: [{ effectiveDate: "2026-01-01", prefix: "MS", separator: "-", startNo: 1 }] });
  createdSetup = true;
}

describe.runIf(canRun)("IT-MS merge / split on PostgreSQL", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    h = await startHarness();
    const { ensureTestLocations } = await masterModule("test/partner-shared/locations");
    await ensureTestLocations(h.master.prisma, ["Safe A", "Safe B"]);
    if (!(await h.master.prisma.currency.findUnique({ where: { code: "THB" } }))) await h.master.prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: TAG, updatedBy: TAG } });
    await configureNumbering();
    maker = await h.user([...ALL, "stock-card:VIEW"]);
    other = await h.user(ALL);
    viewer = await h.user([`${LEAF}:VIEW`]);
    await setApproval(false);
  }, 120_000);

  afterAll(async () => {
    if (!h) return;
    await h.ownerDb.notification_event.deleteMany({ where: { document_id: { in: docs } } });
    await h.ownerDb.merge_split.deleteMany({ where: { id: { in: docs } } });
    await cleanupLoads(h, loads);
    await h.master.prisma.stockIdIssue.deleteMany({ where: { documentId: { in: docs } } });
    if (createdSetup) await h.master.prisma.documentSetup.deleteMany({ where: { transactionKey: LEAF } });
    await setApproval(true);
    await h.close();
  }, 120_000);

  it("IT-MS-B01 split (approval OFF): source consumed whole, N new stocks with master Stock IDs, inherited ref / vendor / currency, ledger Σ 0", async () => {
    const s = await stock();
    const created = await create(twoWay(s, { results: [result({ pcs: 4, weightCt: "2.000", location: "Safe B" }), result({ pcs: 6, weightCt: "3.000" })] }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "APPROVED", version: 1 });
    expect(created.body.docNo).toMatch(/^MS-\d+$/);
    expect(created.body.stockIds).toHaveLength(2);
    const source = await row(s.id);
    expect([source.pcs, source.on_hand_pcs, w(source.on_hand_weight_ct.toString()), source.consumed_pcs, w(source.consumed_weight_ct.toString()), source.version, source.status]).toEqual([10, 0, "0.000", 10, "5.000", 2, "ACTIVE"]);
    const results = await h.ownerDb.stock.findMany({ where: { stock_id: { in: created.body.stockIds } }, orderBy: { pcs: "asc" } });
    expect(results.map((r) => [r.pcs, w(r.weight_ct.toString()), r.on_hand_pcs, r.cost_amount_base.toFixed(2), r.unit_cost_base.toFixed(4), r.location, r.ref_doc_no, r.load_id, r.vendor_name_snapshot, r.currency_code, r.status, r.version, r.sale_price.toFixed(2)])).toEqual([
      [4, "2.000", 4, "400.00", "200.0000", "Safe B", source.ref_doc_no, s.loadId, "MS Vendor", "THB", "ACTIVE", 1, "450.00"],
      [6, "3.000", 6, "600.00", "200.0000", "Safe A", source.ref_doc_no, s.loadId, "MS Vendor", "THB", "ACTIVE", 1, "450.00"],
    ]);
    expect(results.every((r) => r.lot_key === `OS${r.id}`)).toBe(true);
    const ledger = await h.ownerDb.stock_movement.findMany({ where: { document_id: created.body.id } });
    expect(ledger.map((m) => m.kind).sort()).toEqual(["SPLIT_IN", "SPLIT_IN", "SPLIT_OUT"]);
    expect(ledger.reduce((sum, m) => sum + Number(m.cost_delta_base), 0)).toBe(0);
    expect(ledger.find((m) => m.kind === "SPLIT_OUT")).toMatchObject({ stock_uuid: s.id, pcs_delta: -10, document_type: LEAF, revision: 1 });
    const doc = await detail(created.body.id);
    expect(doc).toMatchObject({ mode: "SPLIT", status: "APPROVED", autoApproved: true, deleted: false, totals: { source: { pcs: 10, weightCt: "5.000", costBase: "1000.00" }, result: { pcs: 10, weightCt: "5.000", costBase: "1000.00" } } });
    expect(doc.sources[0]).toMatchObject({ key: "a", stockUuid: s.id, stockId: s.stockId, availPcs: 10, takeCostBase: "1000.00", unitCostBase: "200.0000", priceUnit: "PER_CT" });
    expect(doc.results.map((r: any) => [r.sourceKey, r.stockId, r.inUse, r.costAmountBase])).toEqual([["a", created.body.stockIds[0], false, "400.00"], ["a", created.body.stockIds[1], false, "600.00"]]);
  });

  it("IT-MS-B02 merge (approval OFF): one stock = Σ pcs / weight / cost, oldest source's ref; MERGE_OUT per source; mixed currency → 422", async () => {
    const a = await stock({ pcs: 2, weightCt: "3.000", unitCost: "10000", docDate: "2026-09-10" });
    const b = await stock({ pcs: 2, weightCt: "2.000", unitCost: "17500", priceUnit: "PER_PCS", docDate: "2026-08-01" });
    const body = { docDate: DATE, mode: "MERGE", ref: TAG, note: "", sources: [{ key: "a", stockUuid: a.id, availPcs: 2, availWeightCt: "3" }, { key: "b", stockUuid: b.id, availPcs: 2, availWeightCt: "2" }], results: [result({ sourceKey: null, pcs: 4, weightCt: "5" })] };
    const created = await create(body);
    expect(created.status).toBe(201);
    const [merged] = await h.ownerDb.stock.findMany({ where: { stock_id: created.body.stockIds[0] } });
    expect([merged.pcs, w(merged.weight_ct.toString()), merged.cost_amount_base.toFixed(2), merged.unit_cost_base.toFixed(4), merged.price_unit, merged.ref_doc_no, merged.load_id]).toEqual([4, "5.000", "65000.00", "13000.0000", "PER_CT", b.docNo, b.loadId]);
    const ledger = await h.ownerDb.stock_movement.findMany({ where: { document_id: created.body.id } });
    expect(ledger.map((m) => m.kind).sort()).toEqual(["MERGE_IN", "MERGE_OUT", "MERGE_OUT"]);
    const usd = await stock({ currency: "USD" });
    const thb = await stock();
    const mixed = await create({ ...body, sources: [{ key: "a", stockUuid: usd.id, availPcs: 10, availWeightCt: "5" }, { key: "b", stockUuid: thb.id, availPcs: 10, availWeightCt: "5" }], results: [result({ sourceKey: null, pcs: 20, weightCt: "10" })] });
    expect(mixed.status).toBe(422);
    expect(mixed.body.error).toMatchObject({ code: "MERGE_SPLIT_CURRENCY_MIXED", details: { currencies: ["THB", "USD"] } });
  });

  it("IT-MS-B03 availability: held part never taken; stale snapshot → 409 STOCK_CHANGED, nothing written; SYNCING load → 409 BUSY", async () => {
    const s = await stock();
    await h.ownerDb.stock.update({ where: { id: s.id }, data: { on_hand_pcs: 6, on_hand_weight_ct: "3.000", reserved_pcs: 4, reserved_weight_ct: "2.000" } });
    const before = await h.ownerDb.merge_split.count();
    const stale = await create(twoWay(s));
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: "MERGE_SPLIT_STOCK_CHANGED", details: { sources: [{ key: "a", stockId: s.stockId, availPcs: 6, availWeightCt: "3.000" }] } });
    expect(await h.ownerDb.merge_split.count()).toBe(before);
    const ok = await create(splitBody(s, [result({ pcs: 3, weightCt: "1.000" }), result({ pcs: 3, weightCt: "2.000" })], { sources: [{ key: "a", stockUuid: s.id, availPcs: 6, availWeightCt: "3.000" }] }));
    expect(ok.status).toBe(201);
    const after = await row(s.id);
    expect([after.on_hand_pcs, after.reserved_pcs, w(after.reserved_weight_ct.toString()), after.consumed_pcs, after.pcs]).toEqual([0, 4, "2.000", 6, 10]);
    const busy = await stock();
    await h.ownerDb.load_to_stock.update({ where: { id: busy.loadId }, data: { sync_state: "SYNCING" } });
    const refused = await create(twoWay(busy));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "MERGE_SPLIT_BUSY", details: { retryAfterSeconds: 5 } });
    expect(refused.response.headers.get("retry-after")).toBe("5");
    await h.ownerDb.load_to_stock.update({ where: { id: busy.loadId }, data: { sync_state: "IDLE" } });
  });

  it("IT-MS-B04 approval ON: DRAFT has no effect and no Stock IDs; submit refuses a source on another PENDING doc; revise once; approve applies; reject is final", async () => {
    await setApproval(true);
    try {
      const s = await stock();
      const { result: draft, master } = await h.measured(() => create(twoWay(s)));
      expect(draft.status).toBe(201);
      expect(draft.body).toMatchObject({ status: "DRAFT", stockIds: [null, null] });
      expect(master.some((call) => call.includes("stock-id-issues"))).toBe(false);
      expect(await h.ownerDb.stock_movement.count({ where: { document_id: draft.body.id } })).toBe(0);
      expect((await row(s.id)).on_hand_pcs).toBe(10);
      const submitted = await maker.call("POST", `/merge-split/${draft.body.id}/submit`, { expectedVersion: 1 });
      expect(submitted.body).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
      // Picker hides the stock from other documents, but not from its own document.
      expect((await maker.call("GET", `/merge-split/stock?q=${s.stockId}`)).body.items).toEqual([]);
      expect((await maker.call("GET", `/merge-split/stock?q=${s.stockId}&excludeDocId=${draft.body.id}`)).body.items).toHaveLength(1);
      const second = await create(twoWay(s));
      expect(second.body.status).toBe("DRAFT");
      const blocked = await maker.call("POST", `/merge-split/${second.body.id}/submit`, { expectedVersion: 1 });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toMatchObject({ code: "MERGE_SPLIT_SOURCE_PENDING", details: { stockIds: [s.stockId], docNos: [draft.body.docNo] } });
      const revise = await other.call("POST", `/merge-split/${draft.body.id}/request-revision`, { expectedVersion: 2, note: "check" });
      expect(revise.body.status).toBe("REVISION_REQUESTED");
      await maker.call("POST", `/merge-split/${draft.body.id}/submit`, { expectedVersion: 3 });
      const again = await other.call("POST", `/merge-split/${draft.body.id}/request-revision`, { expectedVersion: 4, note: "again" });
      expect(again.body.error).toMatchObject({ code: "MERGE_SPLIT_STATUS", details: { reason: "REVISE_LIMIT" } });
      const approved = await other.call("POST", `/merge-split/${draft.body.id}/approve`, { expectedVersion: 4 });
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: "APPROVED", version: 5 });
      expect(approved.body.stockIds).toHaveLength(2);
      expect((await row(s.id)).on_hand_pcs).toBe(0);
      expect((await detail(draft.body.id)).autoApproved).toBe(false);
      // An approver-approved document can't be edited (delete only).
      const edit = await maker.call("PUT", `/merge-split/${draft.body.id}`, { ...twoWay(s), expectedVersion: 5 });
      expect(edit.body.error).toMatchObject({ code: "MERGE_SPLIT_STATUS", details: { status: "APPROVED" } });
      const t = await stock();
      const third = await create(twoWay(t));
      await maker.call("POST", `/merge-split/${third.body.id}/submit`, { expectedVersion: 1 });
      const rejected = await other.call("POST", `/merge-split/${third.body.id}/reject`, { expectedVersion: 2, reason: "no" });
      expect(rejected.body.status).toBe("REJECTED");
      expect((await maker.call("PUT", `/merge-split/${third.body.id}`, { ...twoWay(t), expectedVersion: 3 })).body.error.code).toBe("MERGE_SPLIT_STATUS");
      const summary = await other.call("GET", "/approval/summary");
      expect(summary.body.items.some((item: any) => item.type === LEAF)).toBe(true);
    } finally {
      await setApproval(false);
    }
  });

  it("IT-MS-B05 reverse: delete restores sources and retires results; a used result → 409 IN_USE; edit auto-approved → new Stock IDs; restore → DRAFT", async () => {
    const s = await stock();
    const created = await create(twoWay(s));
    const removed = await maker.call("POST", `/merge-split/${created.body.id}/delete`, { expectedVersion: 1 });
    expect(removed.status).toBe(200);
    const source = await row(s.id);
    expect([source.on_hand_pcs, source.consumed_pcs, w(source.on_hand_weight_ct.toString())]).toEqual([10, 0, "5.000"]);
    const retired = await h.ownerDb.stock.findMany({ where: { stock_id: { in: created.body.stockIds } } });
    expect(retired.map((r) => [r.status, r.on_hand_pcs, r.pcs])).toEqual([["REVERSED", 0, 0], ["REVERSED", 0, 0]]);
    expect((await h.ownerDb.stock_movement.findMany({ where: { document_id: created.body.id, kind: "SPLIT_REVERSAL" } })).length).toBe(3);
    expect((await h.ownerDb.stock_movement.findMany({ where: { document_id: created.body.id } })).reduce((sum, m) => sum + m.pcs_delta, 0)).toBe(0);
    const restored = await maker.call("POST", `/merge-split/${created.body.id}/restore`, { expectedVersion: 2 });
    expect(restored.body).toMatchObject({ status: "DRAFT", version: 3 });
    // Save the restored DRAFT (approval OFF) → applies again with NEW Stock IDs (apply_seq 3).
    const reapplied = await maker.call("PUT", `/merge-split/${created.body.id}`, { ...twoWay(s), expectedVersion: 3 });
    expect(reapplied.body.status).toBe("APPROVED");
    expect(reapplied.body.stockIds.some((id: string) => created.body.stockIds.includes(id))).toBe(false);
    // Edit of the auto-approved document: reverse + re-apply with new Stock IDs.
    const edited = await maker.call("PUT", `/merge-split/${created.body.id}`, { ...splitBody(s, [result({ pcs: 5, weightCt: "2.500" }), result({ pcs: 5, weightCt: "2.500" })]), expectedVersion: 4 });
    expect(edited.status).toBe(200);
    expect(edited.body.stockIds.some((id: string) => reapplied.body.stockIds.includes(id))).toBe(false);
    const live = await h.ownerDb.stock.findMany({ where: { stock_id: { in: edited.body.stockIds } } });
    expect(live.map((r) => r.pcs)).toEqual([5, 5]);
    // A result reserved through the real hold API → in use.
    const internal = internalApi(h);
    const held = await internal.hold("reserve", randomUUID(), [{ stockUuid: live[0].id, pcs: 1, weightCt: "0.500" }]);
    expect(held.status).toBe(200);
    expect((await detail(created.body.id)).results.some((r: any) => r.inUse)).toBe(true);
    const refused = await maker.call("POST", `/merge-split/${created.body.id}/delete`, { expectedVersion: 5 });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "MERGE_SPLIT_IN_USE", details: { stockIds: [live[0].stock_id] } });
    // Re-conversion (Q-MS-16): the untouched result can be split again.
    const again = await create(splitBody(live[1], [result({ pcs: 2, weightCt: "1" }), result({ pcs: 3, weightCt: "1.5" })], { sources: [{ key: "a", stockUuid: live[1].id, availPcs: 5, availWeightCt: "2.5" }] }));
    expect(again.status).toBe(201);
  });

  it("IT-MS-B06 picker: own ACTIVE on-hand stock only, q / location / exclude, keyset paging, ONE statement per page", async () => {
    const tagStock = await stock({ location: "Safe B" });
    const second = await stock({ location: "Safe B" });
    const byId = await maker.call("GET", `/merge-split/stock?q=${tagStock.stockId}`);
    expect(byId.body.items).toHaveLength(1);
    expect(byId.body.items[0]).toMatchObject({ stockUuid: tagStock.id, stockId: tagStock.stockId, availPcs: 10, availWeightCt: "5.000", costAmountBase: "1000.00", unitCostBase: "200.0000", location: "Safe B", currency: "THB", photoCount: 0, syncing: false, loadedFrom: { docNo: tagStock.docNo } });
    expect((await maker.call("GET", `/merge-split/stock?q=${tagStock.stockId}&location=Safe%20A`)).body.items).toEqual([]);
    expect((await maker.call("GET", `/merge-split/stock?q=${tagStock.stockId}&exclude=${tagStock.id}`)).body.items).toEqual([]);
    const page = await h.measured(() => maker.call("GET", "/merge-split/stock?location=Safe%20B&limit=1"));
    expect(page.result.body.items).toHaveLength(1);
    expect(page.result.body.nextCursor).toBeTruthy();
    const next = await maker.call("GET", `/merge-split/stock?location=Safe%20B&limit=1&cursor=${page.result.body.nextCursor}`);
    expect(next.body.items[0].stockUuid).not.toBe(page.result.body.items[0].stockUuid);
    const many = await h.measured(() => maker.call("GET", "/merge-split/stock?limit=50"));
    expect(many.queries).toBe(page.queries);
    expect(page.queries).toBeLessThanOrEqual(1);
    await create(twoWay(second));
    expect((await maker.call("GET", `/merge-split/stock?q=${second.stockId}`)).body.items).toEqual([]);
  });

  it("IT-MS-B07 Stock Card: cross-card split shows OUT on the source card and IN on the result card with the MS number; Σ cost conserved", async () => {
    const s = await stock();
    const created = await create(twoWay(s, { results: [result({ pcs: 4, weightCt: "2.000", location: "Safe B", lot: `B07-${randomUUID().slice(0, 6)}` }), result({ pcs: 6, weightCt: "3.000" })] }));
    const source = await row(s.id);
    const [moved] = await h.ownerDb.stock.findMany({ where: { stock_id: created.body.stockIds[0] } });
    expect(moved.card_key).not.toBe(source.card_key);
    const out = await maker.call("GET", `/stock-card/cards/${source.card_key}/transactions`);
    const outRow = out.body.items.find((item: any) => item.docType === LEAF);
    expect(outRow).toMatchObject({ docId: created.body.id, docNo: created.body.docNo, docDate: DATE, docTypeLabel: "Merge/Split", accountName: "" });
    const inn = await maker.call("GET", `/stock-card/cards/${moved.card_key}/transactions`);
    expect(inn.body.items).toHaveLength(1);
    expect(inn.body.items[0]).toMatchObject({ docId: created.body.id, docNo: created.body.docNo, stockId: moved.stock_id, inPcs: 4, inWeightCt: "2.000" });
    const sums = await h.ownerDb.stock_movement.aggregate({ where: { document_id: created.body.id }, _sum: { cost_delta_base: true } });
    expect(Number(sums._sum.cost_delta_base)).toBe(0);
  });

  it("IT-MS-B08 Load interaction: the source's load is in use while the conversion exists", async () => {
    const s = await stock();
    await create(twoWay(s));
    const locked = await h.db.$transaction((tx) => lockLoadStocks(tx, s.loadId));
    expect(locked.inUse).toContain(s.stockId);
  });

  it("IT-MS-B09 authorization: grants, CSRF and photo access", async () => {
    const s = await stock();
    expect((await viewer.call("POST", "/merge-split", twoWay(s))).status).toBe(403);
    expect((await viewer.call("GET", "/merge-split")).status).toBe(200);
    const none = await h.user(["stock-card:VIEW"]);
    expect((await none.call("GET", "/merge-split/stock")).status).toBe(403);
    expect((await maker.call("POST", "/merge-split", twoWay(s), { origin: "https://evil.example" })).status).toBe(403);
    expect((await viewer.call("POST", `/merge-split/${randomUUID()}/approve`, { expectedVersion: 1 })).status).toBe(403);
    const form = new FormData();
    form.append("file", new File([PNG], "a.png", { type: "image/png" }));
    const uploaded = await maker.call("POST", "/merge-split/photos", form);
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.fileId;
    expect((await maker.call("GET", `/merge-split/photos/${fileId}`)).status).toBe(200);
    expect((await other.call("GET", `/merge-split/photos/${fileId}`)).status).toBe(404);
    const bad = new FormData();
    bad.append("file", new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" }));
    expect((await maker.call("POST", "/merge-split/photos", bad)).status).toBe(415);
    const foreign = await create(twoWay(s, { results: [result({ pcs: 4, weightCt: "2.000", photoIds: [randomUUID()] }), result({ pcs: 6, weightCt: "3.000" })] }));
    expect(foreign.status).toBe(400);
    expect(foreign.body.error).toMatchObject({ code: "VALIDATION_FAILED", details: { fieldErrors: [{ path: "results.0.photoIds", code: "invalid" }] } });
    const linked = await create(twoWay(s, { results: [result({ pcs: 4, weightCt: "2.000", photoIds: [fileId] }), result({ pcs: 6, weightCt: "3.000" })] }));
    expect(linked.status).toBe(201);
    expect((await other.call("GET", `/merge-split/photos/${fileId}`)).status).toBe(200);
    const [withPhoto] = await h.ownerDb.stock.findMany({ where: { stock_id: linked.body.stockIds[0] } });
    expect((await maker.call("GET", `/merge-split/stock/${withPhoto.id}/photos`)).body).toEqual({ fileIds: [fileId] });
    expect((await maker.call("GET", `/merge-split/photos/${randomUUID()}`)).status).toBe(404);
    const invalid = await create({ ...twoWay(s), mode: "MERGE" });
    expect(invalid.status).toBe(400);
  });

  it("IT-MS-B10 concurrency: two saves sharing a source in parallel → one applies, the other 409, no deadlock", async () => {
    const s = await stock();
    const [a, b] = await Promise.all([create(twoWay(s)), create(twoWay(s))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body.error.code).toBe("MERGE_SPLIT_STOCK_CHANGED");
    const source = await row(s.id);
    expect([source.on_hand_pcs, source.consumed_pcs]).toEqual([0, 10]);
  });

  it("IT-MS-B11 master: Stock ID issue replays per (merge-split, document, applySeq); numbering key merge-split returns MS…", async () => {
    const id = randomUUID();
    docs.push(id);
    const first = await h.masterApi.issueStockIds("merge-split", id, 1, 2);
    const replay = await h.masterApi.issueStockIds("merge-split", id, 1, 2);
    expect(replay).toEqual({ ...first, replayed: true });
    const next = await h.masterApi.issueStockIds("merge-split", id, 2, 1);
    expect(first.stockIds).not.toContain(next.stockIds[0]);
    await expect(h.masterApi.issueStockIds("merge-split", id, 1, 1)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const numbering = await h.masterApi.numbering(DATE, false, undefined, "merge-split");
    expect(numbering.numbering?.prefix).toBe("MS");
    expect((await maker.call("GET", `/merge-split/next-number?docDate=${DATE}`)).body.docNo).toMatch(/^MS-\d+$/);
    const options = await maker.call("GET", "/merge-split/options");
    expect(options.body).toMatchObject({ numbering: { configured: true } });
    expect(options.body).toHaveProperty("companyCurrency");
    expect(options.body.locations).toEqual(expect.arrayContaining(["Safe A", "Safe B"]));
  });

  it("NP-MS query budgets: detail 2 statements, daybook / pending 1, apply fixed for 2 vs 10 results", async () => {
    const small = await stock();
    const large = await stock();
    const applySmall = await h.measured(() => create(twoWay(small)));
    const applyLarge = await h.measured(() => create(splitBody(large, Array.from({ length: 10 }, () => result({ pcs: 1, weightCt: "0.500" })))));
    expect(applyLarge.result.status).toBe(201);
    expect(applyLarge.queries).toBe(applySmall.queries);
    const detailSmall = await h.measured(() => maker.call("GET", `/merge-split/${applySmall.result.body.id}`));
    const detailLarge = await h.measured(() => maker.call("GET", `/merge-split/${applyLarge.result.body.id}`));
    expect(detailSmall.queries).toBe(2);
    expect(detailLarge.queries).toBe(2);
    const list = await h.measured(() => maker.call("GET", "/merge-split?limit=50"));
    expect(list.result.body.items.length).toBeGreaterThan(1);
    expect(list.queries).toBe(1);
    const pending = await h.measured(() => other.call("GET", "/approval/pending?type=merge-split"));
    expect(pending.result.status).toBe(200);
    expect(pending.queries).toBe(1);
    const reverse = await h.measured(() => maker.call("POST", `/merge-split/${applyLarge.result.body.id}/delete`, { expectedVersion: 1 }));
    const reverseSmall = await h.measured(() => maker.call("POST", `/merge-split/${applySmall.result.body.id}/delete`, { expectedVersion: 1 }));
    expect(reverse.result.status).toBe(200);
    expect(reverse.queries).toBe(reverseSmall.queries);
    console.info(`NP-MS statements: apply ${applySmall.queries}, reverse ${reverse.queries}, detail 2, list ${list.queries}, pending ${pending.queries}`);
  });

  it("NP-MS 200-result apply: same statement count, latency recorded (target < 500 ms on dev hardware)", async () => {
    const big = await stock({ pcs: 200, weightCt: "100.000" });
    const body = splitBody(big, Array.from({ length: 200 }, () => result({ pcs: 1, weightCt: "0.500" })), { sources: [{ key: "a", stockUuid: big.id, availPcs: 200, availWeightCt: "100.000" }] });
    const started = performance.now();
    const applied = await h.measured(() => create(body));
    const ms = Math.round(performance.now() - started);
    expect(applied.result.status).toBe(201);
    expect(applied.result.body.stockIds).toHaveLength(200);
    const ledger = await h.ownerDb.stock_movement.aggregate({ where: { document_id: applied.result.body.id }, _sum: { cost_delta_base: true, pcs_delta: true } });
    expect([Number(ledger._sum.cost_delta_base), ledger._sum.pcs_delta]).toEqual([0, 0]);
    console.info(`NP-MS 200-result apply: ${applied.queries} statements, ${ms} ms end to end (incl. master calls)`);
  });
});
