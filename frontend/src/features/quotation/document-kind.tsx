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
  /** Stock ID: filled by From Stock only, or a running number assigned on save. */
  stockId: "from-stock" | "auto";
  /** Stone Code field and column; without it the Stock ID leads the row (Memo Receive, owner 2026-10-28). */
  stoneCode: boolean;
  /** Location column and row-panel field; Memo Receive has none (rev 3: its Memo Stock is always `Memo`). */
  location: boolean;
  /** Location choices; null = filled by From Stock only (read-only). */
  locations: Option[] | null;
  emptyRowText: string;
  itemNote: { section: string; max: number; placeholder?: string };
  documentNote: { max: number; hint: string };
  /** Stone choices when they don't come from `quotation.options`. */
  stone?: StoneChoices;
  uploadPhoto: (file: File) => Promise<PhotoRef>;
};

export const QUOTATION_KIND: DocumentKind = {
  stockId: "from-stock",
  stoneCode: true,
  location: true,
  locations: null,
  emptyRowText: "Empty row · click to key in, or use From Stock to fill it",
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
