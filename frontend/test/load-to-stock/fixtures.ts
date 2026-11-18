import type { LoadOut, PurchaseLineRef } from "@/features/load-to-stock/types";

/**
 * Typed fixtures of the SA rev 1 api-contract with the design's numbers (source 02/03/05): three PU lines of two
 * Purchases in USD at 36.20 → THB. 1,450 × 36.20 = 52,490/ct × 12.40 = 650,876.00; 980 × 36.20 = 35,476 × 9.60 =
 * 340,569.60; 1,500 × 36.20 = 54,300 × 7.30 = 396,390.00. Σ 1,387,835.60 ÷ 29.30 ct = 47,366.40; per piece 65,087.60 /
 * 14,190.40 / 66,065.00 → PU2610-038 is the highest.
 */
export const VENDOR = { id: "11111111-1111-4111-8111-111111111111", code: "V001", name: "Siam Gems" };
export const L1 = "aaaaaaaa-0000-4000-8000-000000000001";
export const L2 = "aaaaaaaa-0000-4000-8000-000000000002";
export const L3 = "aaaaaaaa-0000-4000-8000-000000000003";
export const LOAD_ID = "bbbbbbbb-0000-4000-8000-000000000001";

const PU31 = { id: "cccccccc-0000-4000-8000-000000000031", docNo: "PU2610-031", docDate: "2026-10-02", currency: "USD", rate: "36.20" };
const PU38 = { id: "cccccccc-0000-4000-8000-000000000038", docNo: "PU2610-038", docDate: "2026-10-12", currency: "USD", rate: "36.20" };

const attrs = {
  stoneCodeId: null,
  stoneCode: "SA-RBLDEXVS1AAA",
  stone: "Sapphire",
  shape: "Oval",
  size: "5.0×7.0 mm",
  color: "Royal Blue",
  clarity: "VS1",
  cutting: "Excellent",
  quality: "AAA",
  lot: "",
  cerType: "GIA",
  cerNo: "2231870541",
};

export function line(overrides: Partial<PurchaseLineRef> = {}): PurchaseLineRef {
  return {
    ...attrs,
    purchaseLineId: L1,
    purchase: PU31,
    location: "BKK-01",
    priceUnit: "PER_CT",
    unitPrice: "1450.00",
    netUnitPrice: "1450.0000",
    unitCostBase: "52490.0000",
    pcs: 10,
    weightCt: "12.40",
    remainingPcs: 10,
    remainingWeightCt: "12.400",
    remainingAmountBase: "650876.00",
    photoCount: 2,
    itemNote: "",
    ...overrides,
  };
}

export const LINE1 = line();
export const LINE2 = line({
  purchaseLineId: L2,
  stoneCode: "RU-RUBDVGVS2AA",
  stone: "Ruby",
  shape: "Cushion",
  size: "3.0×4.0 mm",
  color: "Pigeon Blood",
  clarity: "VS2",
  cutting: "Very Good",
  quality: "AA",
  cerType: "",
  cerNo: "",
  unitPrice: "980.00",
  netUnitPrice: "980.0000",
  unitCostBase: "35476.0000",
  pcs: 24,
  weightCt: "9.60",
  remainingPcs: 24,
  remainingWeightCt: "9.600",
  remainingAmountBase: "340569.60",
  photoCount: 0,
});
export const LINE3 = line({
  purchaseLineId: L3,
  purchase: PU38,
  cerType: "GRS",
  cerNo: "GRS2026-118803",
  unitPrice: "1500.00",
  netUnitPrice: "1500.0000",
  unitCostBase: "54300.0000",
  pcs: 6,
  weightCt: "7.30",
  remainingPcs: 6,
  remainingWeightCt: "7.300",
  remainingAmountBase: "396390.00",
  photoCount: 1,
});
export const LINES = [LINE1, LINE2, LINE3];

export function loadOut(overrides: Partial<LoadOut> = {}): LoadOut {
  return {
    id: LOAD_ID,
    docNo: "LSGMS2609001",
    status: "DRAFT",
    version: 3,
    docDate: "2026-11-17",
    vendor: VENDOR,
    currency: "THB",
    ref: "",
    documentNote: "",
    mode: "NONE",
    sources: [LINE1],
    rows: [
      {
        id: "dddddddd-0000-4000-8000-000000000001",
        position: 1,
        stockId: null,
        sources: [{ purchaseLineId: L1, pcs: 7, weightCt: "8.700", costAmountBase: "456663.00" }],
        location: "Safe A",
        parcel: "",
        attrs: { ...attrs },
        stockPrice: "60000.00",
        salePrice: "80000.00",
        itemNote: "",
        photoIds: [],
        priceUnit: "PER_CT",
        pcs: 7,
        weightCt: "8.700",
        unitCostBase: "52490.0000",
        costAmountBase: "456663.00",
      },
    ],
    totals: { rowCount: 1, pcs: 7, weightCt: "8.700", costAmountBase: "456663.00" },
    approval: { requireApproval: true, autoApproved: false, revisionCount: 0, submitted: null, review: null },
    inUse: false,
    syncing: false,
    deleted: null,
    created: { at: "2026-11-17T02:00:00.000Z", by: "u1" },
    updated: { at: "2026-11-17T02:00:00.000Z", by: "u1" },
    ...overrides,
  };
}

/** A controlled `/api/inventory/v1` server: records each call; `respond` answers by method + path. */
export type InventoryCall = { method: string; path: string; query: Record<string, string>; body: unknown; credentials: RequestCredentials | undefined; csrf: string | null; contentType: string | null };
export function controlledInventory(respond: (call: InventoryCall) => { status?: number; body?: unknown }) {
  const calls: InventoryCall[] = [];
  const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const headers = new Headers(init?.headers);
    const raw = init?.body;
    const call: InventoryCall = {
      method: init?.method ?? "GET",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: typeof raw === "string" ? JSON.parse(raw) : raw instanceof FormData ? "multipart" : undefined,
      credentials: init?.credentials,
      csrf: headers.get("x-gms-csrf"),
      contentType: headers.get("content-type"),
    };
    calls.push(call);
    const reply = respond(call);
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch: fetchStub as typeof fetch };
}

export const envelope = (code: string, details?: Record<string, unknown>) => ({ error: { code, message: code, requestId: "req-1", ...(details ? { details } : {}) } });
