import type { QuotationFormValues, QuotationLine } from "../schema";
import { todayIso } from "./format";

export const DEFAULT_EMPTY_ROWS = 5;

let keySeq = 0;
export const newKey = (): string => `line-${Date.now().toString(36)}-${(keySeq++).toString(36)}`;

export function emptyLine(): QuotationLine {
  return {
    key: newKey(),
    source: "MANUAL",
    stockId: "",
    lot: "",
    stoneCodeId: "",
    stoneCode: "",
    locationId: "",
    stone: "",
    shape: "",
    size: "",
    color: "",
    clarity: "",
    cutting: "",
    quality: "",
    cerType: "",
    cerNo: "",
    pcs: "",
    weightCt: "",
    priceUnit: "PER_CT",
    unitPrice: "",
    discountPercent: "",
    discountAmount: "",
    photos: [],
    itemNote: "",
  };
}

export function emptyQuotation(): QuotationFormValues {
  const today = todayIso();
  return {
    status: "DRAFT",
    docDate: today,
    // Owner 2026-10-26 (Q-QT-08): the user picks the due date.
    dueDate: "",
    customerId: "",
    shippingAddressId: "",
    invoiceAddressId: "",
    // Filled with the company currency once the options load (new documents only).
    currency: "",
    exchangeRate: "",
    ref: "",
    lines: Array.from({ length: DEFAULT_EMPTY_ROWS }, emptyLine),
    discount: { enabled: false, type: "PERCENT", value: "" },
    tax: { enabled: false, rate: "7", includeInPrice: false },
    serviceCharges: [],
    labor: { enabled: false, work: "", basis: "PCS", qty: "", rate: "" },
    documentNote: "",
  };
}
