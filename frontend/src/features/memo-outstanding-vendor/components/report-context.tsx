"use client";

import { createContext, useContext } from "react";
import { VENDOR_SPEC, type ReportSpec } from "../model";

/** The report the shared components render (From Vendor by default; From Customer provides its own, ADR-0039). */
export const ReportSpecContext = createContext<ReportSpec>(VENDOR_SPEC);

export const useReportSpec = () => useContext(ReportSpecContext);
