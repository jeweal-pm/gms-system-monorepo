"use client";

import { createContext, useContext } from "react";
import { photoUrl, uploadQuotationPhoto, type QuotationOptions } from "./api";
import type { Option } from "./components/ui";
import { MAX_DOCUMENT_NOTE, type PhotoRef } from "./schema";

/** Stone choices for the row panel, in the shape `quotation.options` returns. */
export type StoneChoices = QuotationOptions["stone"];

/**
 * What differs between documents that reuse the Quotation item table, row panel, photos, note and
 * Summary Value (ADR-0033 D5). The default is exactly the Quotation page; Memo Receive provides its own.
 */
export type DocumentKind = {
  /**
   * Stock ID: filled by From Stock only, a running number assigned on save, or none at all (Purchase Order rev 1: Stock
   * IDs come later, at Purchase).
   */
  stockId: "from-stock" | "auto" | "none";
  /** Stone Code field and column; without it the Stock ID leads the row (Memo Receive, owner 2026-10-28). */
  stoneCode: boolean;
  /** Location column and row-panel field; Memo Receive has none (rev 3: its Memo Stock is always `Memo`). */
  location: boolean;
  /** Location choices; null = filled by From Stock only (read-only); "text" = typed freely (Purchase Order, Q-PO-06). */
  locations: Option[] | null | "text";
  emptyRowText: string;
  itemNote: { section: string; max: number; placeholder?: string };
  documentNote: { max: number; hint: string };
  /**
   * From Stock rows take part or all of a real stock item (memo-out rev 2, Q-MO-10): Pcs / Weight stay editable up to the
   * item's pending (Pcs fills Weight in proportion), the price unit stays the item's, and Duplicate is hidden (an item
   * appears once per document). Quotation rev 2 (Q-QTS-03) uses it too.
   */
  stockQuantity?: boolean;
  /**
   * Rows come only from the picker (memo-out rev 3, owner 2026-10-31): no Add row button, and clicking an empty row opens
   * the picker instead of the row panel, so nothing can be keyed in by hand.
   */
  pickOnly?: boolean;
  /**
   * Title of the price column and the row-panel price field (purchase Q-PU-14: "Price", a buying cost). Default
   * "Sale Price", which every customer and memo document keeps.
   */
  priceTitle?: string;
  /**
   * From Stock rows take no line discount: the row panel's discount pair is locked on them (purchase FE-PU-010, SA D8).
   * Default false, so every other document keeps its editable discount.
   */
  lockStockDiscount?: boolean;
  /** Stone choices when they don't come from `quotation.options`. */
  stone?: StoneChoices;
  uploadPhoto: (file: File) => Promise<PhotoRef>;
};

/** The price title of a kind without its own (`DocumentKind.priceTitle`). */
export const DEFAULT_PRICE_TITLE = "Sale Price";

export const QUOTATION_KIND: DocumentKind = {
  stockId: "from-stock",
  stoneCode: true,
  location: true,
  locations: null,
  emptyRowText: "Empty row · click to key in, or use From Stock to fill it",
  stockQuantity: true,
  itemNote: { section: "Item Note", max: 500 },
  documentNote: { max: MAX_DOCUMENT_NOTE, hint: "Printed on the quotation for the customer" },
  uploadPhoto: async (file) => {
    const id = await uploadQuotationPhoto(file);
    return { id, name: file.name, url: photoUrl(id) };
  },
};

export const DocumentKindContext = createContext<DocumentKind>(QUOTATION_KIND);

export function useDocumentKind(): DocumentKind {
  return useContext(DocumentKindContext);
}
