"use client";

import { createContext, useContext } from "react";
import type { QuotationOptions } from "./api";

/** `quotation.options` loaded once by QuotationForm and shared with the header fields and item editor. */
export const QuotationOptionsContext = createContext<QuotationOptions | undefined>(undefined);

export function useOptions(): QuotationOptions | undefined {
  return useContext(QuotationOptionsContext);
}
