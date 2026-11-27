import { vi } from "vitest";
import { stockTransferCalls } from "@/features/stock-transfer-location/api";
import type { StockLot, TransferOut } from "@/features/stock-transfer-location/types";

/** Typed fixtures of the SA rev 1 api-contract with the owner image's numbers (RU-RUBDEXVVS1AAA, BKK-01, 0.62 ct, 85,000.00 USD per ct). */
export const ID = "dddddddd-0000-4000-8000-000000000001";
export const S1 = "eeeeeeee-0000-4000-8000-000000000001";
export const S2 = "eeeeeeee-0000-4000-8000-000000000002";
export const S3 = "eeeeeeee-0000-4000-8000-000000000003";
export const LINE1 = "ffffffff-0000-4000-8000-000000000001";
export const LINE2 = "ffffffff-0000-4000-8000-000000000002";

const attrs = {
  stoneCode: "RU-RUBDEXVVS1AAA",
  stone: "Ruby",
  shape: "Oval",
  size: "5x7",
  color: "Red",
  clarity: "VVS1",
  cutting: "Excellent",
  quality: "AAA",
  lot: "L-2609-014",
  location: "BKK-01",
  cerType: "GIA",
  cerNo: "123",
};

export function stockLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    stockUuid: S1,
    stockId: "260014",
    lotKey: "OS-260014",
    refDocNo: "LSGMS2609001",
    refDocDate: "2026-09-01",
    location: "BKK-01",
    priceUnit: "PER_CT",
    stockPrice: "85000.00",
    currency: "USD",
    onHandPcs: 1,
    onHandWeightCt: "0.620",
    attrs,
    ...overrides,
  };
}

export function transferOut(overrides: Partial<TransferOut> = {}): TransferOut {
  return {
    id: ID,
    docNo: "STGMS2611001",
    docDate: "2026-11-24",
    ref: "Move to safe",
    note: "",
    status: "DRAFT",
    autoApproved: false,
    version: 2,
    deleted: false,
    approval: { requireApproval: true, autoApproved: false, revisionCount: 0, submitted: null, review: null },
    lines: [
      {
        id: LINE2,
        position: 2,
        fromStockUuid: S2,
        stockId: "260015",
        newStockId: null,
        lotKey: "OS-260015",
        refDocNo: "LSGMS2609001",
        fromLocation: "BKK-01",
        toLocation: "Safe A",
        onHandPcs: 4,
        onHandWeightCt: "2.000",
        pcs: 2,
        weightCt: "1.000",
        priceUnit: "PER_PCS",
        stockPrice: "1200.00",
        currency: "USD",
        remark: "",
        attrs: { ...attrs, stoneCode: "SA-BLUE", lot: "L-2" },
      },
      {
        id: LINE1,
        position: 1,
        fromStockUuid: S1,
        stockId: "260014",
        newStockId: null,
        lotKey: "OS-260014",
        refDocNo: "LSGMS2609001",
        fromLocation: "BKK-01",
        toLocation: "Shelf 1",
        onHandPcs: 1,
        onHandWeightCt: "0.620",
        pcs: 1,
        weightCt: "0.620",
        priceUnit: "PER_CT",
        stockPrice: "85000.00",
        currency: "USD",
        remark: "",
        attrs,
      },
    ],
    ...overrides,
  };
}

export type Sent = { url: string; method: string; body: unknown; headers: Headers };

/** A controlled `/api/inventory/v1` server for the real inventory client. */
export function controlled(reply: (sent: Sent) => { status?: number; body: unknown }) {
  const sent: Sent[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const entry = { url: String(input), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) };
    sent.push(entry);
    const { status = 200, body } = reply(entry);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return { calls: stockTransferCalls({ fetch: fetch as unknown as typeof globalThis.fetch, renew: async () => false }), sent };
}

export const envelope = (code: string, details?: Record<string, unknown>) => ({ error: { code, message: code, requestId: "req-1", ...(details ? { details } : {}) } });
