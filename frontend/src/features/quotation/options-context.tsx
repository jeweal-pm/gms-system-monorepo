"use client";

import { createContext, useContext } from "react";
import { photoUrl, uploadQuotationPhoto, type QuotationOptions } from "./api";

/** `quotation.options` loaded once by QuotationForm and shared with the header fields and item editor. */
export const QuotationOptionsContext = createContext<QuotationOptions | undefined>(undefined);

export function useOptions(): QuotationOptions | undefined {
  return useContext(QuotationOptionsContext);
}

/**
 * What the shared item editor needs from a document's options: the stone lists. Memo out / memo out return
 * (ADR-0033) provide it here; the quotation page keeps using `QuotationOptionsContext`.
 */
export type LineOptions = { stone: QuotationOptions["stone"] };
export const LineOptionsContext = createContext<LineOptions | undefined>(undefined);

export function useLineOptions(): LineOptions | undefined {
  const line = useContext(LineOptionsContext);
  const quotation = useContext(QuotationOptionsContext);
  return line ?? quotation;
}

/**
 * Where the shared row-panel photos upload to and read from; defaults to the quotation photo route. A document
 * without photos yet (memo out / memo out return rev 1) passes `upload: null`.
 */
export type LinePhotoTarget = { upload: ((file: File) => Promise<string>) | null; url: (id: string) => string };
export const LinePhotoContext = createContext<LinePhotoTarget>({ upload: uploadQuotationPhoto, url: photoUrl });

export function useLinePhotoTarget(): LinePhotoTarget {
  return useContext(LinePhotoContext);
}
