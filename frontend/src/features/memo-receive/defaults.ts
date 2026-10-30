import { QUOTATION_KIND, type DocumentKind } from "@/features/quotation/document-kind";
import { DEFAULT_EMPTY_ROWS, emptyLine } from "@/features/quotation/lib/defaults";
import { todayIso } from "@/features/quotation/lib/format";
import { memoReceivePhotoUrl, uploadMemoReceivePhoto } from "./api";
import { MAX_MEMO_NOTE, type MemoReceiveFormValues } from "./schema";

export function emptyMemoReceive(): MemoReceiveFormValues {
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
 * Memo Receive's setting for the shared Quotation components (ADR-0033 D5). Rev 2 (owner 2026-10-28): Quantity &
 * Price and both discounts as on Quotation; no Stone Code, the Stock ID leads instead. Rev 3 (owner 2026-10-29,
 * ADR-0034): the server assigns the Stock ID on save, and there is no Location (Memo Stock stores `Memo`). Rev 4
 * (SA revision 2): row photos upload to and load from the Memo Receive photo route.
 */
export const MEMO_RECEIVE_KIND: DocumentKind = {
  ...QUOTATION_KIND,
  stockId: "auto",
  stoneCode: false,
  location: false,
  locations: null,
  emptyRowText: "Empty row · click to key in",
  itemNote: { section: "Note", max: MAX_MEMO_NOTE, placeholder: "e.g. Unheated, reserved for client viewing" },
  documentNote: { max: MAX_MEMO_NOTE, hint: "Notes for this memo receive" },
  uploadPhoto: async (file) => {
    const id = await uploadMemoReceivePhoto(file);
    return { id, name: file.name, url: memoReceivePhotoUrl(id) };
  },
};
