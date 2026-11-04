import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { DEFAULT_EMPTY_ROWS, emptyLine } from "@/features/quotation/lib/defaults";
import { todayIso } from "@/features/quotation/lib/format";
import { MAX_DOCUMENT_NOTE } from "@/features/quotation/schema";
import { purchaseOrderPhotoUrl, uploadPurchaseOrderPhoto } from "./api";
import type { PurchaseOrderFormValues } from "./schema";

export function emptyPurchaseOrder(): PurchaseOrderFormValues {
  return {
    docDate: todayIso(),
    dueDate: "",
    vendorId: "",
    addressId: "",
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

/**
 * Purchase Order's setting for the shared Quotation components (UI rev 1, owner 2026-11-04): the Quotation typed row
 * with Stone Code and a free-text Location (Q-PO-06), no Stock ID (it comes at Purchase) and no From Stock (Q-PO-05).
 */
export const PURCHASE_ORDER_KIND: DocumentKind = {
  ...QUOTATION_KIND,
  stockId: "none",
  stoneCode: true,
  location: true,
  locations: "text",
  stockQuantity: false,
  emptyRowText: "Empty row · click to key in",
  documentNote: { max: MAX_DOCUMENT_NOTE, hint: "Printed on the purchase order for the vendor" },
  uploadPhoto: async (file) => {
    const id = await uploadPurchaseOrderPhoto(file);
    return { id, name: file.name, url: purchaseOrderPhotoUrl(id) };
  },
};
