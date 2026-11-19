/* eslint-disable @typescript-eslint/no-explicit-any -- api-master modules are loaded untyped */
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/platform/errors";
import { createLogger } from "../../src/platform/logger";
import { MasterRefusal, MasterUnavailable } from "../../src/platform/master-client";
import type { MasterApi, SalePrepared } from "../../src/platform/master-api";
import { SyncDriver, sweepAll, OP_STORES } from "../../src/platform/sync/saga";
import { flowFlags, isEditable } from "../../src/modules/sale/read";
import { consumptionLines, normalizeSale, prepareRequest } from "../../src/modules/sale/prepare";
import { saleInputSchema, reserveLinesQuerySchema } from "../../src/modules/sale/schemas";
import { calculateTotals, lineAmount, oversizeAmounts } from "../../src/modules/sale/totals";
import { isSaleRefusal, refusalError, salePort, type SaleOpRow } from "../../src/modules/sale/service";
import { parseArgs } from "../../src/scripts/sync-redrive";
import { masterModule } from "../support/harness";

/** UT-SL-B01 (schemas), B02 (flow rules), B03 (totals parity with master), B04 (saga with the Sale store / port) + Save normalisation. */
const RL = "0193a6c0-0000-7000-8000-000000000001";
const MS = "0193a6c0-0000-7000-8000-000000000002";
const MS2 = "0193a6c0-0000-7000-8000-000000000003";
const CUSTOMER = "0193a6c0-0000-7000-8000-0000000000c1";
const ADDR = "0193a6c0-0000-7000-8000-0000000000a1";

const line = (patch: Record<string, unknown> = {}) => ({ source: "STOCK", memoStockId: MS, pcs: 1, weightCt: "0.5", unitPrice: "100", discount: { type: "NONE", value: "0" }, photoIds: [], ...patch });
const input = (lines: unknown[], patch: Record<string, unknown> = {}) => ({
  docDate: "2026-11-19", dueDate: "2026-11-30", customerId: CUSTOMER, shippingAddressId: ADDR, invoiceAddressId: ADDR, currency: "THB", exchangeRate: null,
  discount: { type: "NONE", value: "0" }, tax: { enabled: false, rate: "7", includeInPrice: false }, labor: null, serviceCharges: [], lines, ...patch,
});
const codes = (value: unknown) => {
  const parsed = saleInputSchema.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => `${issue.path.join(".")}:${(issue as { params?: { code?: string } }).params?.code ?? issue.code}`);
};

describe("UT-SL-B01 Sale schemas", () => {
  it("accepts a valid sale; field names follow the Reserve input (tax.includeInPrice, serviceCharges[{type}])", () => {
    expect(codes(input([line(), line({ source: "RESERVE", reserveLineId: RL, memoStockId: undefined })], { tax: { enabled: true, rate: "7", includeInPrice: true }, serviceCharges: [{ type: "SHIPPING", amount: "10" }] }))).toEqual([]);
    expect(codes(input([line()], { tax: { enabled: true, rate: "7", included: true } }))).not.toEqual([]);
    expect(codes(input([line()], { charges: [{ chargeType: "SHIPPING", amount: "1" }] }))).not.toEqual([]);
  });

  it("source shape, one line per reference, quantities, price, decimals, dates, discount, charges, bounds", () => {
    expect(codes(input([line({ source: "RESERVE", memoStockId: undefined })]))).toContain("lines.0.reserveLineId:required");
    expect(codes(input([line({ reserveLineId: RL })]))).toContain("lines.0.reserveLineId:invalid");
    expect(codes(input([line({ memoStockId: undefined })]))).toContain("lines.0.memoStockId:required");
    expect(codes(input([line(), line()]))).toContain("lines.1.memoStockId:duplicate");
    expect(codes(input([line({ source: "RESERVE", reserveLineId: RL }), line({ source: "RESERVE", reserveLineId: RL })]))).toContain("lines.1.reserveLineId:duplicate");
    expect(codes(input([line({ pcs: 0, weightCt: "0" })]))).toContain("lines.0.pcs:required");
    expect(codes(input([line({ unitPrice: "0" })]))).toContain("lines.0.unitPrice:required");
    expect(codes(input([line({ weightCt: "1.0001" })]))).toEqual(["lines.0.weightCt:invalid_format"]);
    expect(codes(input([line({ discount: { type: "PERCENT", value: "101" } })]))).toContain("lines.0.discount.value:too_big");
    expect(codes(input([line()], { dueDate: "2026-11-18" }))).toContain("dueDate:before_doc_date");
    expect(codes(input([line()], { exchangeRate: "0" }))).toContain("exchangeRate:too_small");
    expect(codes(input([line()], { serviceCharges: [{ type: "SHIPPING", amount: "1" }, { type: "SHIPPING", amount: "2" }] }))).toContain("serviceCharges:duplicate");
    expect(codes(input([line()], { documentNote: "x".repeat(251) }))).not.toEqual([]);
    expect(codes(input([]))).not.toEqual([]);
    expect(codes(input(Array.from({ length: 201 }, (_, i) => line({ memoStockId: `0193a6c0-0000-7000-8000-${String(i).padStart(12, "0")}` }))))).not.toEqual([]);
    expect(codes(input([line({ photoIds: [RL, RL] })]))).toContain("lines.0.photoIds:duplicate");
    expect(codes({ ...input([line()]), extra: 1 })).not.toEqual([]);
  });

  it("reserve-lines query: customer + currency required, exclude ≤ 200, date order", () => {
    expect(reserveLinesQuerySchema.safeParse({ customerId: CUSTOMER, currency: "THB" }).data).toMatchObject({ exclude: [], limit: 50 });
    expect(reserveLinesQuerySchema.safeParse({ currency: "THB" }).success).toBe(false);
    expect(reserveLinesQuerySchema.safeParse({ customerId: CUSTOMER, currency: "THB", from: "2026-11-02", to: "2026-11-01" }).success).toBe(false);
    expect(reserveLinesQuerySchema.safeParse({ customerId: CUSTOMER, currency: "THB", exclude: Array.from({ length: 201 }, () => RL) }).success).toBe(false);
  });
});

describe("UT-SL-B02 flow rules", () => {
  const all = { isSuperAdmin: false, grants: new Set(["sale:VIEW", "sale:ADD", "sale:EDIT", "sale:DELETE"]) };
  const row = (patch: Record<string, unknown> = {}) => ({ status: "DRAFT", auto_approved: false, deleted_at: null as Date | null, sync_state: "IDLE", ...patch });
  it("per status, auto-approved, deleted, syncing and grant", () => {
    expect(flowFlags(row(), true, all)).toEqual({ canEdit: true, canDelete: true, canSubmit: true, canRestore: false, usedBy: null });
    expect(flowFlags(row(), false, all)).toMatchObject({ canSubmit: false });
    expect(flowFlags(row({ status: "PENDING_APPROVAL" }), true, all)).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false });
    expect(flowFlags(row({ status: "REVISION_REQUESTED" }), true, all)).toMatchObject({ canEdit: true, canDelete: true, canSubmit: true });
    expect(flowFlags(row({ status: "REJECTED" }), true, all)).toMatchObject({ canEdit: false, canDelete: true, canSubmit: false });
    expect(flowFlags(row({ status: "APPROVED" }), true, all)).toMatchObject({ canEdit: false, canDelete: false });
    expect(flowFlags(row({ status: "APPROVED", auto_approved: true }), false, all)).toMatchObject({ canEdit: true, canDelete: true, canSubmit: false });
    expect(flowFlags(row({ sync_state: "SYNCING" }), true, all)).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false, canRestore: false });
    expect(flowFlags(row({ deleted_at: new Date() }), true, all)).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false, canRestore: true });
    expect(flowFlags(row({ deleted_at: new Date() }), true, { isSuperAdmin: false, grants: new Set(["sale:VIEW"]) })).toMatchObject({ canRestore: false });
    expect(flowFlags(row(), true, { isSuperAdmin: false, grants: new Set(["sale:VIEW"]) })).toMatchObject({ canEdit: false, canDelete: false, canSubmit: false });
    expect(flowFlags(row(), true, { isSuperAdmin: true, grants: new Set() })).toMatchObject({ canEdit: true, canDelete: true, canSubmit: true });
    expect(isEditable(row({ status: "APPROVED", auto_approved: true, sync_state: "SYNCING" }))).toBe(false);
  });
});

describe("UT-SL-B03 totals parity with master quotation.calculate", () => {
  const fixtures = [
    { lines: [{ priceUnit: "PER_CT", pcs: 2, weightCt: "1.235", unitPrice: "1999.99", discount: { type: "PERCENT", value: "7.5" } }, { priceUnit: "PER_PCS", pcs: 3, weightCt: "0", unitPrice: "33.33", discount: { type: "AMOUNT", value: "5" } }],
      discount: { type: "PERCENT", value: "3" }, tax: { enabled: true, rate: "7", includeInPrice: false }, serviceCharges: [{ type: "SHIPPING", amount: "100.5" }], labor: { work: "set", basis: "PCS", qty: "3", rate: "12.345" } },
    { lines: [{ priceUnit: "PER_CT", pcs: 0, weightCt: "0.333", unitPrice: "1000", discount: { type: "NONE", value: "0" } }],
      discount: { type: "AMOUNT", value: "50" }, tax: { enabled: true, rate: "7", includeInPrice: true }, serviceCharges: [], labor: null },
    { lines: [{ priceUnit: "PER_PCS", pcs: 1, weightCt: "0", unitPrice: "10", discount: { type: "AMOUNT", value: "99" } }],
      discount: { type: "AMOUNT", value: "999" }, tax: { enabled: false, rate: "0", includeInPrice: false }, serviceCharges: [{ type: "HANDLING", amount: "1" }, { type: "INSURANCE", amount: "2.25" }], labor: null },
  ] as const;
  it("same amounts at every step for line discounts, header discount, tax included / excluded, labor and charges", async () => {
    const master = await masterModule("src/quotation/quotation.calculate");
    for (const fixture of fixtures) {
      const ours = calculateTotals(fixture as any);
      const theirs = master.calculateTotals(fixture as any);
      for (const key of ["subtotal", "discountAmount", "priceBeforeTax", "taxAmount", "chargesAmount", "laborAmount", "grandTotal"] as const) expect(ours[key].toFixed(2)).toBe(theirs[key].toFixed(2));
      expect(ours.lineAmounts.map((value) => value.toFixed(2))).toEqual(theirs.lineAmounts.map((value: any) => value.toFixed(2)));
      expect(ours.lineDiscounts.map((value) => value.toFixed(2))).toEqual(theirs.lineDiscounts.map((value: any) => value.toFixed(2)));
    }
    expect(lineAmount({ priceUnit: "PER_CT", pcs: 1, weightCt: "1", unitPrice: "100", discount: { type: "AMOUNT", value: "500" } }).toFixed(2)).toBe("0.00");
    expect(oversizeAmounts(calculateTotals({ ...fixtures[1], lines: [{ priceUnit: "PER_CT", pcs: 0, weightCt: "999999999.999", unitPrice: "9999999999999999.99" }] } as any))).toContain("lines.0.unitPrice");
  });
});

describe("Save normalisation (ADR-0054 D3)", () => {
  const prepared = (patch: Partial<SalePrepared> = {}): SalePrepared => ({
    party: { code: "C1", name: "Cust", shippingText: "ship", invoiceText: "inv" }, partyErrors: [], currencyActive: true, companyCurrency: "THB",
    reserveLines: [{ reserveLineId: RL, reserveId: "r1", reserveNo: "RS-1", reserveDate: "2026-11-10", dueDate: "2026-11-20", memoStockId: MS2, stockId: "850001", priceUnit: "PER_CT",
      stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "Memo", cerType: "", cerNo: "",
      netUnitPrice: "2500.0000", openPcs: 2, openWeightCt: "1.000", openAmount: "2500.00", status: "OPEN", customerId: CUSTOMER, currency: "THB" }],
    memoStocks: [{ memoStockId: MS, stockId: "850002", priceUnit: "PER_PCS", attrs: { stoneCode: "", stone: "Sapphire", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "", location: "Memo", cerType: "", cerNo: "" },
      memoReceive: { id: "m1", docNo: "MR-1" }, pendingPcs: 3, pendingWeightCt: "1.500", status: "OK" }],
    ...patch,
  });
  const parsed = (lines: unknown[], patch: Record<string, unknown> = {}) => saleInputSchema.parse(input(lines, patch));
  const ids = (index: number) => `line-${index}`;
  const fail = (run: () => unknown) => { try { run(); } catch (error) { return error as AppError; } throw new Error("expected a refusal"); };

  it("copies item fields, caps and prices from master; computes line amounts and totals; one prepare request", () => {
    const value = parsed([line({ source: "RESERVE", reserveLineId: RL, memoStockId: undefined, pcs: 1, weightCt: "0.5", unitPrice: "3000" }), line({ pcs: 2, weightCt: "0", unitPrice: "100" })]);
    expect(prepareRequest(value, { saleId: "s1", keepCustomerId: CUSTOMER })).toEqual({ party: { customerId: CUSTOMER, shippingAddressId: ADDR, invoiceAddressId: ADDR, keepCustomerId: CUSTOMER }, currency: "THB", reserveLineIds: [RL], memoStockIds: [MS], saleId: "s1" });
    const doc = normalizeSale(value, prepared(), { lineId: ids });
    expect(doc.lines[0]).toMatchObject({ id: "line-0", position: 1, reserveId: "r1", reserveDocNo: "RS-1", memoStockId: MS2, stockId: "850001", priceUnit: "PER_CT", capPcs: 2, capWeightCt: "1.000", reserveNetUnitPrice: "2500.0000", amount: "1500.00" });
    expect(doc.lines[1]).toMatchObject({ memoReceiveDocNo: "MR-1", priceUnit: "PER_PCS", capPcs: 3, amount: "200.00", reserveNetUnitPrice: null });
    expect(doc.totals).toMatchObject({ lineCount: 2, pcs: 3, weightCt: "0.500", subtotal: "1700.00", grandTotal: "1700.00" });
    expect(doc).toMatchObject({ customerCode: "C1", customerName: "Cust", shippingText: "ship", exchangeRate: null });
    expect(consumptionLines(doc.lines)).toEqual([
      { lineId: "line-0", source: "RESERVE", reserveLineId: RL, memoStockId: MS2, pcs: 1, weightCt: "0.500" },
      { lineId: "line-1", source: "STOCK", memoStockId: MS, pcs: 2, weightCt: "0.000" },
    ]);
  });

  it("refusals: party / currency / Selling Rate → VALIDATION_ERROR; closed or foreign reference → SALE_REFERENCE_INVALID; above the cap → exceeds_*", () => {
    expect(fail(() => normalizeSale(parsed([line()]), prepared({ partyErrors: [{ path: "customerId", code: "invalid_reference" }], party: null }), { lineId: ids })).details).toEqual({ fieldErrors: [{ path: "customerId", code: "invalid_reference" }] });
    expect(fail(() => normalizeSale(parsed([line()], { currency: "USD" }), prepared({ currencyActive: true }), { lineId: ids })).details).toEqual({ fieldErrors: [{ path: "exchangeRate", code: "required" }] });
    expect(normalizeSale(parsed([line()], { currency: "USD", exchangeRate: "35.5" }), prepared(), { lineId: ids }).exchangeRate).toBe("35.500000");
    expect(normalizeSale(parsed([line()], { exchangeRate: "1" }), prepared(), { lineId: ids }).exchangeRate).toBeNull();
    expect(fail(() => normalizeSale(parsed([line()]), prepared({ currencyActive: false }), { lineId: ids })).details).toEqual({ fieldErrors: [{ path: "currency", code: "invalid_reference" }] });
    expect(normalizeSale(parsed([line()]), prepared({ currencyActive: false }), { lineId: ids, storedCurrency: "THB" }).currency).toBe("THB");
    const closed = prepared();
    closed.reserveLines[0].status = "CLOSED";
    expect(fail(() => normalizeSale(parsed([line({ source: "RESERVE", reserveLineId: RL, memoStockId: undefined })]), closed, { lineId: ids }))).toMatchObject({ status: 422, code: "SALE_REFERENCE_INVALID", details: { fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] } });
    const foreign = prepared();
    foreign.reserveLines[0].customerId = "someone-else";
    expect(fail(() => normalizeSale(parsed([line({ source: "RESERVE", reserveLineId: RL, memoStockId: undefined })]), foreign, { lineId: ids })).code).toBe("SALE_REFERENCE_INVALID");
    expect(fail(() => normalizeSale(parsed([line()]), prepared({ memoStocks: [] }), { lineId: ids })).code).toBe("SALE_REFERENCE_INVALID");
    const over = fail(() => normalizeSale(parsed([line({ source: "RESERVE", reserveLineId: RL, memoStockId: undefined, pcs: 3, weightCt: "1.001" }), line({ pcs: 4 })]), prepared(), { lineId: ids }));
    expect(over).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect(over.details!.fieldErrors).toEqual([
      { path: "lines.0.pcs", code: "exceeds_open", params: { availablePcs: 2, availableWeightCt: "1.000" } },
      { path: "lines.0.weightCt", code: "exceeds_open", params: { availablePcs: 2, availableWeightCt: "1.000" } },
      { path: "lines.1.pcs", code: "exceeds_pending", params: { availablePcs: 3, availableWeightCt: "1.500" } },
    ]);
  });
});

describe("master refusal mapping (error-handling.md)", () => {
  const index = new Map([["l1", 0], ["l2", 1]]);
  it("EXCEEDS → 409 SALE_SOURCE_SHORT row errors; LINE_UNAVAILABLE → 422 SALE_REFERENCE_INVALID; IN_USE → 409 SALE_IN_USE; only those three are refusals", () => {
    const short = refusalError(new MasterRefusal(409, "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", { lines: [{ lineId: "l2", field: "weightCt", code: "exceeds_pending", availablePcs: 1, availableWeightCt: "0.200" }, { lineId: "zz", field: "pcs", code: "exceeds_open", availablePcs: 0, availableWeightCt: "0" }] }), index);
    expect(short).toMatchObject({ status: 409, code: "SALE_SOURCE_SHORT", details: { fieldErrors: [{ path: "lines.1.weightCt", code: "exceeds_pending", params: { availablePcs: 1, availableWeightCt: "0.200" } }] } });
    expect(refusalError(new MasterRefusal(422, "SALE_CONSUMPTION_LINE_UNAVAILABLE", { lineIds: ["l1"] }), index)).toMatchObject({ status: 422, code: "SALE_REFERENCE_INVALID", details: { fieldErrors: [{ path: "lines.0.reference", code: "unavailable" }] } });
    expect(refusalError(new MasterRefusal(409, "SALE_CONSUMPTION_IN_USE", { stockIds: ["850001"] }), index)).toMatchObject({ status: 409, code: "SALE_IN_USE", details: { stockIds: ["850001"] } });
    expect(isSaleRefusal(new MasterRefusal(409, "SALE_CONSUMPTION_EXCEEDS_AVAILABLE", undefined))).toBe(true);
    expect(isSaleRefusal(new MasterRefusal(422, "SALE_CONSUMPTION_LINE_UNAVAILABLE", undefined))).toBe(true);
    expect(isSaleRefusal(new MasterRefusal(409, "SALE_CONSUMPTION_IN_USE", undefined))).toBe(true);
    expect(isSaleRefusal(new MasterRefusal(409, "SALE_CONSUMPTION_STALE", undefined))).toBe(false);
    expect(isSaleRefusal(new MasterRefusal(409, "LOAD_ALLOCATION_EXCEEDS_REMAINING", undefined))).toBe(false);
    expect(isSaleRefusal(new MasterUnavailable("timeout"))).toBe(false);
  });
});

describe("UT-SL-B04 saga with the Sale store and port", () => {
  const logger = createLogger("silent");
  const op: SaleOpRow = { id: "op", sale_id: "sale-1", revision: 3, kind: "APPROVE", state: "PREPARED", attempts: 0, created_by: "u",
    payload: { consumption: { saleDocNo: "SL-1", customerId: CUSTOMER, currency: "THB", lines: [] }, actor: { id: "u", name: null } } };
  const fakeDb = () => {
    const statements: string[] = [];
    const tx = { $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => { statements.push(strings.map((part, i) => part + (i < values.length ? (values[i] && typeof values[i] === "object" && "strings" in (values[i] as object) ? (values[i] as { strings: string[] }).strings.join("") : "?") : "")).join("")); return 1; }) };
    return { statements, db: { ...tx, $queryRaw: vi.fn(async () => []), $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
  };
  const driver = (db: unknown, master: Partial<MasterApi>, handlers: Record<string, unknown> = {}) =>
    new SyncDriver<any, SaleOpRow, any>(db as never, master as MasterApi, logger, { apply: vi.fn(async () => ({ ok: true })), refuse: vi.fn(async () => undefined), mapRefusal: (_op: SaleOpRow, refusal: MasterRefusal) => refusalError(refusal, new Map()), ...handlers } as never, { store: "sale", port: salePort(master as MasterApi) });

  it("writes only sale_sync_op; DONE + apply; business refusal → refuse; STALE → recovery read (same revision applied, else STUCK); timeout → retry later", async () => {
    const ok = fakeDb();
    const put = vi.fn(async () => ({ revision: 3, replayed: false, lines: [] }));
    expect(await driver(ok.db, { putSaleConsumption: put } as never).drive(op)).toEqual({ outcome: "DONE", result: { ok: true } });
    expect(put).toHaveBeenCalledWith("sale-1", 3, op.payload.consumption, { requestId: undefined, actorId: "u" });
    expect(ok.statements[0]).toContain(`"inventory"."sale_sync_op" SET "state" = 'DONE'`);
    expect(ok.statements.join("\n")).not.toContain("master_sync_op");

    const refused = fakeDb();
    const refuse = vi.fn(async () => undefined);
    const outcome = await driver(refused.db, { putSaleConsumption: async () => { throw new MasterRefusal(409, "SALE_CONSUMPTION_IN_USE", { stockIds: ["1"] }); } } as never, { refuse }).drive(op);
    expect(outcome).toMatchObject({ outcome: "REFUSED", error: { code: "SALE_IN_USE" } });
    expect(refuse).toHaveBeenCalledOnce();

    const stale = fakeDb();
    const recovered = await driver(stale.db, { putSaleConsumption: async () => { throw new MasterRefusal(409, "SALE_CONSUMPTION_STALE", {}); }, getSaleConsumption: async () => ({ revision: 3, lines: [] }) } as never).drive(op);
    expect(recovered.outcome).toBe("DONE");
    const lost = fakeDb();
    expect(await driver(lost.db, { putSaleConsumption: async () => { throw new MasterRefusal(409, "SALE_CONSUMPTION_STALE", {}); }, getSaleConsumption: async () => ({ revision: 2, lines: [] }) } as never).drive(op)).toEqual({ outcome: "PENDING" });
    expect(lost.statements[0]).toContain(`"state" = 'STUCK'`);

    const down = fakeDb();
    expect(await driver(down.db, { putSaleConsumption: async () => { throw new MasterUnavailable("timeout"); } } as never).drive(op)).toEqual({ outcome: "PENDING" });
    expect(down.statements[0]).toContain(`"inventory"."sale_sync_op" SET "attempts" = ?::smallint`);
    expect(OP_STORES.sale.ownerKey).toBe("sale_id");
  });

  it("sweepAll: one ≤ 20 budget across stores, oldest due first", async () => {
    const at = (seconds: number) => new Date(Date.UTC(2026, 10, 19, 0, 0, seconds));
    const load = { dueOps: vi.fn(async () => Array.from({ length: 15 }, (_, i) => ({ id: `l${i}`, next_attempt_at: at(i * 2) }))), redriveAll: vi.fn(async () => undefined) };
    const sale = { dueOps: vi.fn(async () => Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, next_attempt_at: at(i * 2 + 1) }))), redriveAll: vi.fn(async () => undefined) };
    expect(await sweepAll([load, sale])).toBe(20);
    expect(load.redriveAll).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, i) => `l${i}`));
    expect(sale.redriveAll).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, i) => `s${i}`));
    const idle = { dueOps: vi.fn(async () => []), redriveAll: vi.fn(async () => undefined) };
    expect(await sweepAll([idle, idle])).toBe(0);
    expect(idle.redriveAll).not.toHaveBeenCalled();
  });

  it("sync:redrive arguments: `<loadId>` (unchanged) or `sale <saleId>`", () => {
    expect(parseArgs([RL])).toEqual({ type: "load-to-stock", id: RL });
    expect(parseArgs(["sale", RL])).toEqual({ type: "sale", id: RL });
    expect(() => parseArgs(["sale"])).toThrow(/usage/);
    expect(() => parseArgs(["x", RL])).toThrow(/usage/);
  });
});

describe("AppError messages", () => {
  it("every Sale code has a fixed English message", async () => {
    const { MESSAGES } = await import("../../src/platform/errors");
    for (const code of ["SALE_NOT_FOUND", "SALE_CHANGED", "SALE_DELETED", "SALE_STATUS_INVALID", "SALE_BUSY", "SALE_IN_USE", "SALE_REVISE_LIMIT", "SALE_SOURCE_SHORT", "SALE_REFERENCE_INVALID", "SALE_PHOTO_INVALID"]) expect(MESSAGES[code]).toMatch(/\w/);
    expect(new AppError(409, "SALE_BUSY").status).toBe(409);
  });
});
