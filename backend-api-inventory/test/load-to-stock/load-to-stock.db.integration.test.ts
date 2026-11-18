import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canRun, masterFixtures, startHarness, type Harness } from "../support/harness";

/**
 * Load to Stock end to end on PostgreSQL with the real master internal API (load-to-stock SA rev 1 testing.md):
 * IT-LS-B03 (partial load, owner example), B04 (approval ON lifecycle + notifications), B05 (modes), B06 (concurrent
 * approves), B07 (crash / timeout recovery), B09 (edit / delete until used), B11 (gap-free numbers under parallel
 * creates), B12 (200-row apply measurement), B14 (approval settings), B17 (Approve Center), B18 (stock CHECKs),
 * B19 (locations), B20 (company currency) and the N+1 budgets NP-LS-02/03/04/05.
 * Opt-in: INVENTORY_TEST_DATABASE_URL (= the master's disposable database, both schemas migrated).
 */
const TAG = `ls-it-${randomUUID().slice(0, 8)}`;
const LOADS: string[] = [];
const ALL = ["load-to-stock:VIEW", "load-to-stock:ADD", "load-to-stock:EDIT", "load-to-stock:DELETE", "load-to-stock:APPROVE", "approval-setup:VIEW", "approval-setup:EDIT"];

let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let vendor: { id: string; addressId: string };
let maker: Awaited<ReturnType<Harness["user"]>>;
let approver: Awaited<ReturnType<Harness["user"]>>;

const attrs = (patch: Record<string, unknown> = {}) => ({ stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "L1", cerType: "", cerNo: "", ...patch });
const row = (sources: { purchaseLineId: string; pcs: number; weightCt: string }[], patch: Record<string, unknown> = {}) => ({ sources, location: "Safe A", attrs: attrs(), stockPrice: "100", salePrice: "200", photoIds: [], ...patch });
const doc = (rows: unknown[], mode = "NONE", patch: Record<string, unknown> = {}) => ({ docDate: "2026-11-17", vendorId: vendor.id, mode, rows, ...patch });

async function setting(on: boolean) {
  await h.db.$executeRaw`UPDATE "inventory"."approval_setting" SET "require_approval" = ${on}, "version" = "version" + 1 WHERE "type" = 'load-to-stock'`;
}
async function created(body: unknown, user = maker) {
  const response = await user.call("POST", "/load-to-stock", body);
  if (response.body.id) LOADS.push(response.body.id);
  return response;
}

describe.runIf(canRun)("IT-LS load to stock on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    vendor = await fx.vendor(`LS Inv Vendor ${TAG}`);
    maker = await h.user(ALL.filter((grant) => !grant.endsWith("APPROVE")), { name: "Maker" });
    approver = await h.user(ALL, { name: "Approver" });
    h.approverIds.push(approver.userId);
    await h.db.$executeRaw`DELETE FROM "inventory"."load_to_stock" WHERE "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED')`;
  }, 60_000);

  afterAll(async () => {
    if (!h) return;
    await setting(true);
    await fx.cleanup(LOADS);
    await h.close();
  });

  it("IT-LS-B03 partial load (owner example, OFF): 7 of 10 → PU remaining 3, stock with a YY#### id; 3 more closes the line, which leaves the picker", async () => {
    await setting(false);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5", lot: `B03-${TAG}` })]);
    const first = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 7, weightCt: "3.5" }])]));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: "APPROVED", version: 1, stockIds: [expect.stringMatching(/^81\d{4}$/)] });
    expect(await fx.loaded(pu.lineIds[0])).toEqual([7, "3.500"]);
    const picker = await maker.call("POST", "/load-to-stock/purchase-lines/search", { q: `B03-${TAG}` });
    expect(picker.body.items).toEqual([expect.objectContaining({ purchaseLineId: pu.lineIds[0], remainingPcs: 3, remainingWeightCt: "1.500" })]);
    const stock = await h.db.stock.findFirstOrThrow({ where: { load_id: first.body.id } });
    expect(stock).toMatchObject({ stock_id: first.body.stockIds[0], pcs: 7, on_hand_pcs: 7, status: "ACTIVE", location: "Safe A", currency_code: "THB" });
    const movements = await h.db.stock_movement.findMany({ where: { stock_uuid: stock.id } });
    expect(movements.map((movement) => movement.kind)).toEqual(["LOAD_IN"]);
    const second = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 3, weightCt: "1" }])]));
    expect(second.status).toBe(201);
    expect(await fx.loaded(pu.lineIds[0])).toEqual([10, "4.500"]); // 0.5 ct written off on the closed line
    expect((await maker.call("POST", "/load-to-stock/purchase-lines/search", { q: `B03-${TAG}` })).body.items).toEqual([]);
    const detail = await maker.call("GET", `/load-to-stock/${first.body.id}`);
    expect(detail.body).toMatchObject({ status: "APPROVED", inUse: false, syncing: false, approval: { autoApproved: true }, currency: "THB", rows: [{ stockId: first.body.stockIds[0], pcs: 7, weightCt: "3.500", costAmountBase: "3500.00" }] });
    expect(detail.body.sources).toEqual([expect.objectContaining({ purchaseLineId: pu.lineIds[0], remainingPcs: 7 })]); // own allocation counts back
  });

  it("IT-LS-B04 approval ON: Draft holds nothing; Submit → Pending (locked); Revise once → edit → Submit; second Revise refused; Approve applies; Reject changes nothing; notifications", async () => {
    await setting(true);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5" })]);
    const saved = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 4, weightCt: "2" }])]));
    expect(saved.body).toMatchObject({ status: "DRAFT", version: 1, stockIds: [null] });
    expect(await fx.loaded(pu.lineIds[0])).toEqual([0, "0.000"]);
    const sent = await maker.call("POST", `/load-to-stock/${saved.body.id}/submit`, { expectedVersion: 1 });
    expect(sent.body).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    expect((await maker.call("PUT", `/load-to-stock/${saved.body.id}`, { ...doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 4, weightCt: "2" }])]), expectedVersion: 2 })).body.error.code).toBe("LOAD_TO_STOCK_STATUS_INVALID");
    expect((await maker.call("POST", `/load-to-stock/${saved.body.id}/approve`, { expectedVersion: 2 })).status).toBe(403);
    const revise = await approver.call("POST", `/load-to-stock/${saved.body.id}/request-revision`, { expectedVersion: 2, note: "fix the price" });
    expect(revise.body).toMatchObject({ status: "REVISION_REQUESTED", version: 3 });
    const detail = await maker.call("GET", `/load-to-stock/${saved.body.id}`);
    const edited = await maker.call("PUT", `/load-to-stock/${saved.body.id}`, { ...doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 5, weightCt: "2.5" }], { id: detail.body.rows[0].id })]), expectedVersion: 3 });
    expect(edited.body).toMatchObject({ status: "REVISION_REQUESTED", version: 4 });
    await maker.call("POST", `/load-to-stock/${saved.body.id}/submit`, { expectedVersion: 4 });
    expect((await approver.call("POST", `/load-to-stock/${saved.body.id}/request-revision`, { expectedVersion: 5, note: "again" })).body.error.code).toBe("LOAD_TO_STOCK_REVISE_LIMIT");
    const approved = await approver.call("POST", `/load-to-stock/${saved.body.id}/approve`, { expectedVersion: 5 });
    expect(approved.body).toMatchObject({ status: "APPROVED", version: 6, stockIds: [expect.stringMatching(/^81\d{4}$/)] });
    expect(await fx.loaded(pu.lineIds[0])).toEqual([5, "2.500"]);
    // Notifications: approver got "pending" (twice), the maker got revision_requested + approved.
    const mine = await maker.call("GET", "/notifications?scope=for-me");
    expect(mine.body.items.map((item: { type: string }) => item.type)).toEqual(expect.arrayContaining(["document.approved", "document.revision_requested"]));
    expect((await approver.call("GET", "/notifications/unread-count")).body.count).toBeGreaterThanOrEqual(2);
    // Reject path: nothing applied.
    const other = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "0.5" }])]));
    await maker.call("POST", `/load-to-stock/${other.body.id}/submit`, { expectedVersion: 1 });
    expect((await approver.call("POST", `/load-to-stock/${other.body.id}/reject`, { expectedVersion: 2, reason: "no" })).body.status).toBe("REJECTED");
    expect(await fx.loaded(pu.lineIds[0])).toEqual([5, "2.500"]);
    const daybook = await maker.call("GET", "/load-to-stock?status=REJECTED");
    expect(daybook.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: other.body.id, reviewNote: "no" })]));
  });

  it("IT-LS-B05 modes: SPLIT one line → 3 rows / 3 Stock IDs / own locations; MERGE 2 lines (mixed units) → 1 row, full remaining, both lines closed; shape errors", async () => {
    await setting(false);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 9, weightCt: "4.5" }), fx.line({ pcs: 2, weightCt: "1", priceUnit: "PER_PCS", unitPrice: "300" }), fx.line({ pcs: 3, weightCt: "3" })]);
    const split = await created(doc([1, 2, 3].map((n) => row([{ purchaseLineId: pu.lineIds[0], pcs: 3, weightCt: "1.5" }], { location: n === 2 ? "safe b" : "Safe A" })), "SPLIT"));
    expect(split.body.stockIds).toHaveLength(3);
    expect(new Set(split.body.stockIds).size).toBe(3);
    const splitDetail = await maker.call("GET", `/load-to-stock/${split.body.id}`);
    expect(splitDetail.body.rows.map((r: { location: string }) => r.location)).toEqual(["Safe A", "Safe B", "Safe A"]);
    const merge = await created(doc([row([{ purchaseLineId: pu.lineIds[1], pcs: 0, weightCt: "0" }, { purchaseLineId: pu.lineIds[2], pcs: 0, weightCt: "0" }])], "MERGE"));
    expect(merge.status).toBe(201);
    expect(merge.body.stockIds).toHaveLength(1);
    const mergeDetail = await maker.call("GET", `/load-to-stock/${merge.body.id}`);
    expect(mergeDetail.body.rows[0]).toMatchObject({ pcs: 5, weightCt: "4.000", priceUnit: "PER_CT", costAmountBase: "3600.00", sources: [expect.objectContaining({ pcs: 2 }), expect.objectContaining({ pcs: 3 })] });
    expect(await fx.loaded(pu.lineIds[1])).toEqual([2, "1.000"]);
    expect(await fx.loaded(pu.lineIds[2])).toEqual([3, "3.000"]);
    const bad = await maker.call("POST", "/load-to-stock", doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "1" }])], "MERGE"));
    expect(bad.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: { fieldErrors: [expect.objectContaining({ code: "mode_shape" })] } });
  });

  it("IT-LS-B19 / B20 locations and currency: inactive or unknown name → LOCATION_INACTIVE; options list active names; header currency = company currency, cost at the PU rate", async () => {
    await setting(true);
    const usd = await fx.purchase(vendor, [fx.line({ pcs: 2, weightCt: "1", unitPrice: "100" })], { currency: "USD", exchangeRate: "35.5" });
    const options = await maker.call("GET", "/load-to-stock/options");
    expect(options.body.locations).toEqual(expect.arrayContaining(["Safe A", "Safe B"]));
    const inactive = await maker.call("POST", "/load-to-stock", doc([row([{ purchaseLineId: usd.lineIds[0], pcs: 1, weightCt: "0.5" }], { location: "Nowhere" })]));
    expect(inactive.body.error).toMatchObject({ code: "LOCATION_INACTIVE", details: { rowPaths: ["rows.0"] } });
    const saved = await created(doc([row([{ purchaseLineId: usd.lineIds[0], pcs: 1, weightCt: "0.5" }])]));
    const detail = await maker.call("GET", `/load-to-stock/${saved.body.id}`);
    const company = await h.master.prisma.companyProfile.findUnique({ where: { id: 1 } });
    if (company) expect(detail.body.currency).toBe(company.currencyCode);
    if (company && company.currencyCode !== "USD") expect(detail.body.rows[0]).toMatchObject({ unitCostBase: "3550.0000", costAmountBase: "1775.00" });
  });

  it("IT-LS-B09 edit / delete until used (OFF): pcs up / down, remove row (REVERSED, id retired), add row (new id); in-use refused; delete restores PU remaining; no restore route", async () => {
    await setting(false);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5" }), fx.line({ pcs: 4, weightCt: "2" })]);
    const saved = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 5, weightCt: "2" }]), row([{ purchaseLineId: pu.lineIds[1], pcs: 2, weightCt: "1" }])]));
    const [keptId, removedId] = saved.body.stockIds as string[];
    const detail = await maker.call("GET", `/load-to-stock/${saved.body.id}`);
    const edit = await maker.call("PUT", `/load-to-stock/${saved.body.id}`, { ...doc([
      row([{ purchaseLineId: pu.lineIds[0], pcs: 8, weightCt: "3" }], { id: detail.body.rows[0].id }),
      row([{ purchaseLineId: pu.lineIds[1], pcs: 1, weightCt: "0.5" }]),
    ]), expectedVersion: 1 });
    expect(edit.status).toBe(200);
    expect(edit.body.stockIds[0]).toBe(keptId);
    expect(edit.body.stockIds[1]).not.toBe(removedId);
    expect(await fx.loaded(pu.lineIds[0])).toEqual([8, "3.000"]);
    expect(await fx.loaded(pu.lineIds[1])).toEqual([1, "0.500"]);
    const removed = await h.db.stock.findFirstOrThrow({ where: { stock_id: removedId } });
    expect(removed).toMatchObject({ status: "REVERSED", on_hand_pcs: 0, load_row_id: null });
    const kept = await h.db.stock.findFirstOrThrow({ where: { stock_id: keptId } });
    expect(kept).toMatchObject({ pcs: 8, on_hand_pcs: 8 });
    expect((await h.db.stock_movement.findMany({ where: { stock_uuid: kept.id }, orderBy: { created_at: "asc" } })).map((m) => [m.kind, m.pcs_delta])).toEqual([["LOAD_IN", 5], ["LOAD_ADJUST", 3]]);
    // In use (a bucket other than on-hand > 0) → refused; editable again after it returns.
    await h.db.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = "on_hand_pcs" - 1, "reserved_pcs" = 1 WHERE "id" = ${kept.id}::uuid`;
    const used = await maker.call("POST", `/load-to-stock/${saved.body.id}/delete`, { expectedVersion: 2 });
    expect(used.body.error).toMatchObject({ code: "LOAD_TO_STOCK_IN_USE", details: { stockIds: [keptId] } });
    expect((await maker.call("GET", `/load-to-stock/${saved.body.id}`)).body.inUse).toBe(true);
    await h.db.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = "on_hand_pcs" + 1, "reserved_pcs" = 0 WHERE "id" = ${kept.id}::uuid`;
    const deleted = await maker.call("POST", `/load-to-stock/${saved.body.id}/delete`, { expectedVersion: 2 });
    expect(deleted.body).toEqual({ id: saved.body.id, version: 3 });
    expect(await fx.loaded(pu.lineIds[0])).toEqual([0, "0.000"]);
    expect(await h.db.stock.count({ where: { load_id: saved.body.id, status: "ACTIVE" } })).toBe(0);
    expect((await maker.call("GET", "/load-to-stock?deleted=true")).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.body.id, deleted: true })]));
    expect((await maker.call("POST", `/load-to-stock/${saved.body.id}/restore`, { expectedVersion: 3 })).status).toBe(404);
  });

  it("INV-20261117-003 F2: stock used between tx0 and tx1 of an applied edit → 409 IN_USE, nothing reversed or overwritten, op parked STUCK (load stays SYNCING); after the hold is released sync:redrive completes", async () => {
    await setting(false);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5" })]);
    const saved = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 5, weightCt: "2" }])]));
    const detail = await maker.call("GET", `/load-to-stock/${saved.body.id}`);
    const stock = await h.db.stock.findFirstOrThrow({ where: { load_id: saved.body.id } });
    const realPut = h.masterApi.putAllocation.bind(h.masterApi);
    // A future consumer takes 1 pc while master applies the edit (between tx0 and tx1).
    h.masterApi.putAllocation = async (...args: Parameters<typeof realPut>) => {
      const result = await realPut(...args);
      await h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = "on_hand_pcs" - 1, "reserved_pcs" = 1 WHERE "id" = ${stock.id}::uuid`;
      return result;
    };
    try {
      const edit = await maker.call("PUT", `/load-to-stock/${saved.body.id}`, { ...doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 6, weightCt: "2" }], { id: detail.body.rows[0].id })]), expectedVersion: 1 });
      expect(edit.status).toBe(409);
      expect(edit.body.error).toMatchObject({ code: "LOAD_TO_STOCK_IN_USE", details: { stockIds: [saved.body.stockIds[0]] } });
    } finally {
      h.masterApi.putAllocation = realPut;
    }
    expect(await h.db.stock.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({ pcs: 5, on_hand_pcs: 4, reserved_pcs: 1, status: "ACTIVE" });
    expect((await h.db.load_to_stock.findUniqueOrThrow({ where: { id: saved.body.id } })).sync_state).toBe("SYNCING");
    const [op] = await h.db.$queryRaw<{ state: string; last_error: string }[]>`SELECT "state", "last_error" FROM "inventory"."master_sync_op" WHERE "load_id" = ${saved.body.id}::uuid AND "revision" = 2`;
    expect(op).toEqual({ state: "STUCK", last_error: "in_use" });
    expect((await maker.call("POST", `/load-to-stock/${saved.body.id}/delete`, { expectedVersion: 2 })).body.error.code).toBe("LOAD_TO_STOCK_BUSY");
    // The hold is released → the operator re-drive applies the stored revision (master replays it).
    await h.ownerDb.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_pcs" = "on_hand_pcs" + 1, "reserved_pcs" = 0 WHERE "id" = ${stock.id}::uuid`;
    expect((await h.service.sync.unstick(saved.body.id))?.outcome).toBe("DONE");
    expect(await h.db.stock.findUniqueOrThrow({ where: { id: stock.id } })).toMatchObject({ pcs: 6, on_hand_pcs: 6 });
    expect((await h.db.load_to_stock.findUniqueOrThrow({ where: { id: saved.body.id } })).sync_state).toBe("IDLE");
    expect(await fx.loaded(pu.lineIds[0])).toEqual([6, "2.000"]);
  });

  it("IT-LS-B06 concurrent approves: two pending loads of 7 on a 10-pc line → one APPROVED, the other stays PENDING with EXCEEDS_REMAINING; the same load twice → one success", async () => {
    await setting(true);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5" })]);
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const saved = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: i < 2 ? 7 : 1, weightCt: "1" }])]));
      await maker.call("POST", `/load-to-stock/${saved.body.id}/submit`, { expectedVersion: 1 });
      ids.push(saved.body.id);
    }
    const race = await Promise.all(ids.slice(0, 2).map((id) => approver.call("POST", `/load-to-stock/${id}/approve`, { expectedVersion: 2 })));
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = race.find((r) => r.status === 409)!;
    expect(loser.body.error).toMatchObject({ code: "LOAD_TO_STOCK_EXCEEDS_REMAINING", details: { lines: [{ purchaseLineId: pu.lineIds[0], rowPaths: ["rows.0"], remainingPcs: 3 }] } });
    const loserId = ids[race.indexOf(loser)];
    expect((await maker.call("GET", `/load-to-stock/${loserId}`)).body).toMatchObject({ status: "PENDING_APPROVAL", syncing: false });
    const twice = await Promise.all([1, 2].map(() => approver.call("POST", `/load-to-stock/${ids[2]}/approve`, { expectedVersion: 2 })));
    expect(twice.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(["LOAD_TO_STOCK_CHANGED", "LOAD_TO_STOCK_BUSY"]).toContain(twice.find((r) => r.status === 409)!.body.error.code);
  });

  it("IT-LS-B07 crash / timeout recovery: an op left PREPARED (process died after tx0, or master committed but tx1 never ran) converges by re-drive with the same Stock IDs; a refused op deletes the provisional document", async () => {
    await setting(false);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 10, weightCt: "5" })]);
    // (a) master unreachable: tx0 commits, the request answers 503 SYNC_PENDING, the document is SYNCING.
    const realPut = h.masterApi.putAllocation.bind(h.masterApi);
    const { MasterUnavailable } = await import("../../src/platform/master-client");
    h.masterApi.putAllocation = async () => { throw new MasterUnavailable("timeout"); };
    const pending = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 2, weightCt: "1" }])]));
    expect(pending.status).toBe(503);
    expect(pending.body.error).toMatchObject({ code: "SYNC_PENDING", details: { id: expect.any(String) } });
    const loadId = pending.body.error.details.id as string;
    LOADS.push(loadId);
    expect((await maker.call("GET", "/load-to-stock")).body.items.map((item: { id: string }) => item.id)).not.toContain(loadId); // provisional: hidden
    // (b) master commits, then the process "dies" before tx1: call master directly with the stored op, keep the op PREPARED.
    h.masterApi.putAllocation = realPut;
    const [op] = await h.db.$queryRaw<{ id: string; revision: number; payload: { allocation: never } }[]>`SELECT "id", "revision", "payload" FROM "inventory"."master_sync_op" WHERE "load_id" = ${loadId}::uuid`;
    const committed = await realPut(loadId, op.revision, op.payload.allocation);
    await h.db.$executeRaw`UPDATE "inventory"."master_sync_op" SET "next_attempt_at" = now() - interval '1 second' WHERE "id" = ${op.id}::uuid`;
    // Re-drive on access (GET) converges: master replays the same Stock IDs, one stock, document visible.
    const detail = await maker.call("GET", `/load-to-stock/${loadId}`);
    expect(detail.body).toMatchObject({ status: "APPROVED", syncing: false, rows: [{ stockId: committed.stockIds[0] }] });
    expect(await h.db.stock.count({ where: { load_id: loadId } })).toBe(1);
    expect(await fx.loaded(pu.lineIds[0])).toEqual([2, "1.000"]);
    // Sweep path: another stalled op is picked up by the bounded sweep.
    h.masterApi.putAllocation = async () => { throw new MasterUnavailable("timeout"); };
    const stalled = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "0.5" }])]));
    const stalledId = stalled.body.error.details.id as string;
    LOADS.push(stalledId);
    h.masterApi.putAllocation = realPut;
    await h.db.$executeRaw`UPDATE "inventory"."master_sync_op" SET "next_attempt_at" = now() - interval '1 second' WHERE "load_id" = ${stalledId}::uuid`;
    expect(await h.service.sync.sweep()).toBeGreaterThanOrEqual(1);
    expect((await h.db.load_to_stock.findUniqueOrThrow({ where: { id: stalledId } })).sync_state).toBe("IDLE");
    // Refused: more than remaining → 409, the provisional document is gone, nothing applied.
    const refused = await maker.call("POST", "/load-to-stock", doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 8, weightCt: "1" }])]));
    expect(refused.body.error.code).toBe("VALIDATION_ERROR"); // caught by Save validation before any write
    expect(await fx.loaded(pu.lineIds[0])).toEqual([3, "1.500"]);
  });

  it("IT-LS-B11 numbering: 10 parallel creates get gap-free running numbers; preview does not reserve", async () => {
    await setting(true);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 20, weightCt: "20" })]);
    const preview = await maker.call("GET", "/load-to-stock/next-number?docDate=2026-11-17");
    const saved = await Promise.all(Array.from({ length: 10 }, () => created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "1" }])]))));
    expect(saved.every((r) => r.status === 201)).toBe(true);
    const numbers = saved.map((r) => r.body.docNo as string).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(numbers).toContain(preview.body.docNo);
    const runs = (await h.db.load_to_stock.findMany({ where: { id: { in: saved.map((r) => r.body.id) } }, select: { running_no: true } })).map((r) => r.running_no).sort((a, b) => a - b);
    expect(runs[9] - runs[0]).toBe(9);
  });

  it("IT-LS-B14 approval settings: list / put; OFF refused while documents wait (counts); counts only with approval-setup:VIEW; Save follows the committed switch", async () => {
    await setting(true);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 2, weightCt: "1" })]);
    const waiting = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "1" }])]));
    await maker.call("POST", `/load-to-stock/${waiting.body.id}/submit`, { expectedVersion: 1 });
    const list = await approver.call("GET", "/approval-settings");
    const item = list.body.items.find((entry: { type: string }) => entry.type === "load-to-stock");
    expect(item).toMatchObject({ requireApproval: true, waitingCount: { pending: expect.any(Number), revision: expect.any(Number) } });
    const viewer = await h.user(["load-to-stock:VIEW"]);
    expect((await viewer.call("GET", "/approval-settings")).body.items[0].waitingCount).toBeUndefined();
    expect((await viewer.call("PUT", "/approval-settings/load-to-stock", { requireApproval: false, expectedVersion: item.version })).status).toBe(403);
    const refused = await approver.call("PUT", "/approval-settings/load-to-stock", { requireApproval: false, expectedVersion: item.version });
    expect(refused.body.error).toMatchObject({ code: "APPROVAL_SETTING_HAS_WAITING", details: { pending: expect.any(Number) } });
    await approver.call("POST", `/load-to-stock/${waiting.body.id}/reject`, { expectedVersion: 2, reason: "x" });
    await h.db.$executeRaw`UPDATE "inventory"."load_to_stock" SET "status" = 'REJECTED', "review_action" = 'REJECT', "review_note" = 'x', "reviewed_at" = now(), "reviewed_by" = 'it' WHERE "status" IN ('PENDING_APPROVAL', 'REVISION_REQUESTED')`;
    const off = await approver.call("PUT", "/approval-settings/load-to-stock", { requireApproval: false, expectedVersion: item.version });
    expect(off.body).toMatchObject({ requireApproval: false, version: item.version + 1 });
    expect((await approver.call("PUT", "/approval-settings/load-to-stock", { requireApproval: true, expectedVersion: item.version })).body.error.code).toBe("APPROVAL_SETTING_CHANGED");
    const applied = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "0.5" }])]));
    expect(applied.body.status).toBe("APPROVED");
  });

  it("IT-LS-B17 Approve Center: summary count (APPROVE + VIEW only), pending sort / search / keyset; NP-LS-03 one statement for 1 or 50 rows", async () => {
    await setting(true);
    const pu = await fx.purchase(vendor, [fx.line({ pcs: 50, weightCt: "50" })]);
    for (let i = 0; i < 3; i += 1) {
      const saved = await created(doc([row([{ purchaseLineId: pu.lineIds[0], pcs: 1, weightCt: "1" }])], "NONE", { ref: `AC-${TAG}` }));
      await maker.call("POST", `/load-to-stock/${saved.body.id}/submit`, { expectedVersion: 1 });
    }
    expect((await maker.call("GET", "/approval/summary")).body.items).toEqual([]);
    expect((await approver.call("GET", "/approval/summary")).body).toMatchObject({ items: [{ type: "load-to-stock", count: expect.any(Number) }], countCap: 100 });
    expect((await maker.call("GET", "/approval/pending?type=load-to-stock")).status).toBe(403);
    const first = await approver.call("GET", `/approval/pending?type=load-to-stock&q=AC-${TAG}&sort=docNo&dir=desc&limit=2`);
    expect(first.body.items).toHaveLength(2);
    const second = await approver.call("GET", `/approval/pending?type=load-to-stock&q=AC-${TAG}&sort=docNo&dir=desc&limit=2&cursor=${first.body.nextCursor}`);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    const { approvalPending, listDocuments } = await import("../../src/modules/load-to-stock/read");
    const one = await h.measured(() => approvalPending(h.db, { q: `AC-${TAG}`, sort: "submittedAt", dir: "asc", limit: 1 }));
    const many = await h.measured(() => approvalPending(h.db, { sort: "submittedAt", dir: "asc", limit: 50 }));
    expect([one.queries, many.queries]).toEqual([1, 1]);
    const listOne = await h.measured(() => listDocuments(h.db, { limit: 1 }));
    const listMany = await h.measured(() => listDocuments(h.db, { limit: 50 }));
    expect([listOne.queries, listMany.queries]).toEqual([1, 1]);
  });

  it("IT-LS-B18 stock CHECKs: pcs / weight must equal on-hand + buckets (23514); a reversed stock has nothing on hand; stock_hold unique per (document, stock)", async () => {
    const [stock] = await h.db.stock.findMany({ where: { load_id: { in: LOADS }, status: "ACTIVE" }, take: 1 });
    const state = (sql: Promise<unknown>) => sql.then(() => "accepted", (error: unknown) => {
      const text = JSON.stringify(error, Object.getOwnPropertyNames(error));
      // Matched on the driver message only: Prisma's error text also quotes the test source (which names both codes).
      return /violates check constraint/i.test(text) ? "23514" : /P2002|Unique constraint failed|violates unique constraint/i.test(text) ? "23505" : text;
    });
    expect(await state(h.db.$executeRaw`UPDATE "inventory"."stock" SET "reserved_pcs" = 1 WHERE "id" = ${stock.id}::uuid`)).toBe("23514");
    expect(await state(h.db.$executeRaw`UPDATE "inventory"."stock" SET "on_hand_weight_ct" = "on_hand_weight_ct" + 0.001 WHERE "id" = ${stock.id}::uuid`)).toBe("23514");
    expect(await state(h.db.$executeRaw`UPDATE "inventory"."stock" SET "status" = 'REVERSED' WHERE "id" = ${stock.id}::uuid`)).toBe("23514");
    // SA rev 2 (D18): one hold per (document type, document, stock); zero holds and a kind that does not match the type are refused.
    const documentId = randomUUID();
    await h.db.stock_hold_document.create({ data: { document_type: "reserve", document_id: documentId, applied_revision: 1, request_hash: "0".repeat(64) } });
    const hold = { document_type: "reserve", document_id: documentId, stock_uuid: stock.id, kind: "RESERVED", pcs: 1, weight_ct: "0", revision: 1 };
    await h.db.stock_hold.create({ data: { id: randomUUID(), ...hold } });
    expect(await state(h.db.stock_hold.create({ data: { id: randomUUID(), ...hold } }))).toBe("23505");
    const otherId = randomUUID();
    await h.db.stock_hold_document.create({ data: { document_type: "reserve", document_id: otherId, applied_revision: 1, request_hash: "0".repeat(64) } });
    expect(await state(h.db.stock_hold.create({ data: { id: randomUUID(), ...hold, document_id: otherId, pcs: 0 } }))).toBe("23514");
    expect(await state(h.db.stock_hold.create({ data: { id: randomUUID(), ...hold, document_id: otherId, kind: "MEMO_OUT" } }))).toBe("23514");
    await h.db.stock_hold_document.deleteMany({ where: { document_id: { in: [documentId, otherId] } } });
    expect(await h.db.stock_hold.count({ where: { stock_uuid: stock.id } })).toBe(0);
  });

  it("NP-LS-02/04/05 N+1 budgets and IT-LS-B12 measurement: GET ≤ 4 statements + 1 master batch; create ON ≤ 8 + 3 master calls; OFF apply bounded — the same for 1 and 200 rows", async () => {
    const pu = await fx.purchase(vendor, Array.from({ length: 200 }, (_, i) => fx.line({ pcs: 2, weightCt: "1", lot: `NP-${i}` })));
    const small = await fx.purchase(vendor, [fx.line({ pcs: 2, weightCt: "1" })]);
    const rows200 = pu.lineIds.map((id) => row([{ purchaseLineId: id, pcs: 1, weightCt: "0.5" }]));
    await setting(true);
    const one = await h.measured(() => created(doc([row([{ purchaseLineId: small.lineIds[0], pcs: 1, weightCt: "0.5" }])])));
    const many = await h.measured(() => created(doc(rows200)));
    expect(many.result.status).toBe(201);
    expect(one.queries).toBe(many.queries);
    expect(many.queries).toBeLessThanOrEqual(8);
    expect(many.master.filter((call) => call.startsWith("POST"))).toHaveLength(3);
    const getOne = await h.measured(() => maker.call("GET", `/load-to-stock/${one.result.body.id}`));
    const getMany = await h.measured(() => maker.call("GET", `/load-to-stock/${many.result.body.id}`));
    expect(getMany.result.body.rows).toHaveLength(200);
    expect([getOne.queries, getMany.queries]).toEqual([getOne.queries, getOne.queries]);
    expect(getMany.queries).toBeLessThanOrEqual(4);
    expect(getMany.master).toEqual(["POST /internal/v1/inventory/purchase-lines/batch"]);
    // OFF apply of 200 rows (create): tx0 + master PUT + tx1, bounded statements; measured latency (dev host).
    await setting(false);
    const pu2 = await fx.purchase(vendor, Array.from({ length: 200 }, (_, i) => fx.line({ pcs: 2, weightCt: "1", lot: `NP2-${i}` })));
    const applyOne = await h.measured(() => created(doc([row([{ purchaseLineId: small.lineIds[0], pcs: 1, weightCt: "0.5" }])])));
    const started = performance.now();
    const rss = process.memoryUsage().rss;
    const applyMany = await h.measured(() => created(doc(pu2.lineIds.map((id) => row([{ purchaseLineId: id, pcs: 1, weightCt: "0.5" }])))));
    const elapsed = Math.round(performance.now() - started);
    expect(applyMany.result.status).toBe(201);
    expect(applyMany.result.body.stockIds).toHaveLength(200);
    expect(applyOne.queries).toBe(applyMany.queries);
    expect(applyMany.queries).toBeLessThanOrEqual(22);
    console.info(`NP-LS evidence: create ON 1/200 rows = ${one.queries}/${many.queries} statements, master ${many.master.length} calls; GET 1/200 = ${getOne.queries}/${getMany.queries} + ${getMany.master.length} master; OFF apply 1/200 = ${applyOne.queries}/${applyMany.queries}; IT-LS-B12 200-row OFF save ${elapsed} ms, RSS delta ${Math.round((process.memoryUsage().rss - rss) / 1048576)} MiB`);
  }, 60_000);
});
