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
    photos: [],
    itemNote: "",
  };
}

export function emptyQuotation(): QuotationFormValues {
  const today = todayIso();
  return {
    status: "DRAFT",
    docDate: today,
    dueDate: today,
    customerId: "",
    shippingAddressId: "",
    invoiceAddressId: "",
    currency: "USD",
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
