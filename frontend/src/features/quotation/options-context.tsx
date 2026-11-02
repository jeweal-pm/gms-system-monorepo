"use client";

import { useQueryClient, type Query } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
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

/** Option lists fetched within this window are fresh enough; opening a dropdown again doesn't refetch them. */
const OPTIONS_REFRESH_MS = 3_000;

/** A document's option query (`quotation.options`, `memoOut.options`, …) not fetched in the last few seconds. */
export function isStaleOptionsQuery(query: Pick<Query, "queryKey" | "state">, now = Date.now()): boolean {
  const path = query.queryKey[0];
  return Array.isArray(path) && path[path.length - 1] === "options" && now - query.state.dataUpdatedAt >= OPTIONS_REFRESH_MS;
}

/**
 * Owner 2026-11-02: the row panel's stone lists show the latest master data, so a stone code added while the
 * document is open (e.g. in another tab) appears the next time a stone dropdown opens. Only queries on screen
 * refetch; hidden tabs' queries are just marked stale.
 */
export function useRefreshLineOptions(): () => void {
  const client = useQueryClient();
  return useCallback(() => void client.invalidateQueries({ predicate: (query) => isStaleOptionsQuery(query) }), [client]);
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
