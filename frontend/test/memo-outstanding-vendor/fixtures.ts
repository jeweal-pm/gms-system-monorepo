import type { VendorItem, VendorListRow } from "@/features/memo-outstanding-vendor/model";

/** Shared fixtures for memo-outstanding-vendor (UT-MOV-F1/F2), shaped like the api-contract responses. */

export const DOC_A = "11111111-1111-4111-8111-111111111111";
export const DOC_B = "22222222-2222-4222-8222-222222222222";
export const VENDOR = "33333333-3333-4333-8333-333333333333";

const qty = (pcs: number, weightCt: string) => ({ pcs, weightCt });

export function row(overrides: Partial<VendorListRow> = {}): VendorListRow {
  return {
    memoReceiveId: DOC_A,
    docNo: "MR-1",
    docDate: "2026-10-27",
    dueDate: "2026-10-31",
    dueInDays: 2,
    vendor: { id: VENDOR, code: "V001", name: "Sapphire Gems Co., Ltd." },
    currency: "AED",
    openValue: "12000.00",
    memo: qty(30, "30.000"),
    return: qty(0, "0.000"),
    sold: qty(0, "0.000"),
    reserve: qty(0, "0.000"),
    outstanding: qty(30, "30.000"),
    ...overrides,
  };
}

export function item(overrides: Partial<VendorItem> = {}): VendorItem {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    memoReceiveId: DOC_A,
    position: 1,
    stockId: "MS26-000001",
    lot: "L-7",
    location: "Memo",
    stone: "Blue Sapphire",
    shape: "Oval",
    size: "9×7 mm",
    color: "Royal Blue",
    clarity: "VS",
    cutting: "Excellent",
    quality: "AAA",
    cerType: "GIA",
    cerNo: "2245180932",
    itemNote: "Unheated, reserved for client viewing",
    photoCount: 3,
    priceUnit: "CTS",
    netUnitPrice: "1850.0000",
    currency: "USD",
    openValue: "3977.50",
    memo: qty(4, "8.600"),
    return: qty(1, "2.100"),
    sold: qty(2, "4.350"),
    reserve: qty(1, "2.150"),
    outstanding: qty(0, "0.000"),
    ...overrides,
  };
}
