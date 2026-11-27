import { ownStockRowSchema, msOutSchema, type MsOut, type OwnStockRow } from "@/features/merge-split/types";

/** Typed fixtures following the SA rev 1 api-contract (merge-split). The live service check is pending BE-MS-004/005. */
export const STOCK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const STOCK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const STOCK_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const MS_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const attrs = (stoneCode: string, stone: string) => ({
  stoneCodeId: null,
  stoneCode,
  stone,
  shape: "Oval",
  size: "5x7",
  color: "Red",
  clarity: "VS",
  cutting: "Good",
  quality: "A",
  cerType: "GIA",
  cerNo: "C-1",
});

/** A: 4 pcs · 2.000 ct at 10,000 THB per ct = 20,000 (5,000 per pc). */
export const OWN_A: OwnStockRow = ownStockRowSchema.parse({
  stockUuid: STOCK_A,
  stockId: "260001",
  lotKey: `OS${STOCK_A}`,
  location: "Safe A",
  attrs: attrs("RU-1", "Ruby"),
  lot: "L-1",
  priceUnit: "PER_CT",
  unitCostBase: "10000.0000",
  availPcs: 4,
  availWeightCt: "2.000",
  costAmountBase: "20000.00",
  stockPrice: "12000.00",
  salePrice: "15000.00",
  currency: "THB",
  photoCount: 1,
  loadedFrom: { docNo: "LS2611001", docDate: "2026-11-02" },
  syncing: false,
});

/** B: 2 pcs · 3.000 ct at 15,000 THB per ct = 45,000 (22,500 per pc, the suggested source of A + B). */
export const OWN_B: OwnStockRow = ownStockRowSchema.parse({
  ...OWN_A,
  stockUuid: STOCK_B,
  stockId: "260002",
  lotKey: `OS${STOCK_B}`,
  location: "Safe B",
  attrs: attrs("SA-1", "Sapphire"),
  lot: "L-2",
  unitCostBase: "15000.0000",
  availPcs: 2,
  availWeightCt: "3.000",
  costAmountBase: "45000.00",
  stockPrice: "16000.00",
  salePrice: "20000.00",
  photoCount: 2,
  loadedFrom: { docNo: "LS2611002", docDate: "2026-11-03" },
});

/** C: per pcs, 3 pcs · 1.000 ct at 1,000 THB per pcs = 3,000. */
export const OWN_C: OwnStockRow = ownStockRowSchema.parse({
  ...OWN_A,
  stockUuid: STOCK_C,
  stockId: "260003",
  lotKey: `OS${STOCK_C}`,
  priceUnit: "PER_PCS",
  unitCostBase: "1000.0000",
  availPcs: 3,
  availWeightCt: "1.000",
  costAmountBase: "3000.00",
  photoCount: 0,
});

export function msOut(overrides: Record<string, unknown> = {}): MsOut {
  return msOutSchema.parse({
    id: MS_ID,
    docNo: "MSGMS2611001",
    docDate: "2026-11-27",
    mode: "SPLIT",
    ref: "R-1",
    note: "Trays",
    status: "DRAFT",
    autoApproved: false,
    version: 3,
    deleted: false,
    sources: [
      {
        id: "s1", key: "s-a", position: 1, stockUuid: STOCK_A, stockId: "260001", availPcs: 4, availWeightCt: "2.000", location: "Safe A", attrs: OWN_A.attrs, lot: "L-1",
        priceUnit: "PER_CT", unitCostBase: "10000.0000", takeCostBase: "20000.00", refDocNo: "LS2611001", refDocDate: "2026-11-02",
      },
    ],
    results: [1, 2].map((position) => ({
      id: `r${position}`, position, sourceKey: "s-a", attrs: OWN_A.attrs, location: position === 1 ? "Safe A" : "Shelf 1", lot: "L-1", parcel: "", pcs: 2, weightCt: "1.000",
      stockPrice: "12000.00", salePrice: "15000.00", itemNote: "", photoIds: [], priceUnit: "PER_CT", unitCostBase: "10000.0000", costAmountBase: "10000.00",
      stockUuid: null, stockId: null, inUse: false,
    })),
    totals: { source: { pcs: 4, weightCt: "2.000", costBase: "20000.00" }, result: { pcs: 4, weightCt: "2.000", costBase: "20000.00" } },
    approval: { requireApproval: true, autoApproved: false, revisionCount: 0, submitted: null, review: null },
    ...overrides,
  });
}
