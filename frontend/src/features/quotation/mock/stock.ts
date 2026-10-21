import type { QuotationLine } from "../schema";

export type StockItem = Pick<
  QuotationLine,
  | "stockId" | "lot" | "stoneCode" | "locationId" | "stone" | "shape" | "size" | "color" | "clarity"
  | "cutting" | "quality" | "cerType" | "cerNo" | "pcs" | "weightCt" | "priceUnit" | "unitPrice"
> & { note: string; loadedAt: string };

export const stockItems: StockItem[] = [
  { stockId: "STK-000214", lot: "L-2609-014", stoneCode: "ALCS-LBEXVS1AAA", locationId: "BKK-01", stone: "Alexandrite", shape: "Cushion", size: "3.0×4.0 mm", color: "Light Blue", clarity: "VS1", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GIA 5434117820", pcs: "2", weightCt: "0.62", priceUnit: "PER_CT", unitPrice: "48000", note: "Unheated, reserved for client viewing", loadedAt: "2026-09-12" },
  { stockId: "STK-000231", lot: "L-2608-003", stoneCode: "RUOV-PBEXVVS1AAA", locationId: "BKK-01", stone: "Ruby", shape: "Oval", size: "5.0×7.0 mm", color: "Pigeon Blood", clarity: "VVS1", cutting: "Excellent", quality: "AAA", cerType: "GIA", cerNo: "GIA 6234117820", pcs: "1", weightCt: "1.12", priceUnit: "PER_CT", unitPrice: "65000", note: "Unheated, Mogok origin", loadedAt: "2026-08-20" },
  { stockId: "STK-000245", lot: "L-2609-021", stoneCode: "SPPR-PNEXVS1AAA", locationId: "BKK-01", stone: "Spinel", shape: "Pear", size: "4.0×6.0 mm", color: "Pink", clarity: "VS1", cutting: "Excellent", quality: "AAA", cerType: "AIGS", cerNo: "AIGS-26-77310", pcs: "6", weightCt: "2.94", priceUnit: "PER_CT", unitPrice: "9800", note: "Matched set of 6", loadedAt: "2026-09-25" },
  { stockId: "STK-000252", lot: "L-2609-030", stoneCode: "SACU-RBVGVS1AA", locationId: "BKK-02", stone: "Sapphire", shape: "Cushion", size: "6.0×6.0 mm", color: "Royal Blue", clarity: "VS1", cutting: "Very Good", quality: "AA", cerType: "GRS", cerNo: "GRS2026-081233", pcs: "1", weightCt: "1.52", priceUnit: "PER_CT", unitPrice: "12500", note: "Heated", loadedAt: "2026-09-28" },
  { stockId: "STK-000260", lot: "L-2610-002", stoneCode: "RUOV-PBEXVVS1AAA", locationId: "CTB-01", stone: "Ruby", shape: "Oval", size: "5.0×7.0 mm", color: "Pigeon Blood", clarity: "VVS1", cutting: "Excellent", quality: "AAA", cerType: "GIT", cerNo: "GIT-1026-5521", pcs: "1", weightCt: "1.05", priceUnit: "PER_CT", unitPrice: "61000", note: "", loadedAt: "2026-10-02" },
  { stockId: "STK-000263", lot: "L-2610-004", stoneCode: "SPPR-PNEXVS1AAA", locationId: "BKK-02", stone: "Spinel", shape: "Pear", size: "4.0×6.0 mm", color: "Pink", clarity: "VS1", cutting: "Excellent", quality: "AAA", cerType: "AIGS", cerNo: "AIGS-26-80114", pcs: "12", weightCt: "5.88", priceUnit: "PER_PCS", unitPrice: "4200", note: "Calibrated parcel", loadedAt: "2026-10-05" },
];
