import { isInventoryApiError } from "@/lib/inventory-client";
import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { AdjustmentLine } from "./form";

export type AdjustmentWriteOutcome = { message: string; rowErrors: { key: string; message: string }[]; refetch: boolean };

/** Stable UI mapping for errors from the approved Stock Adjustment API contract. */
export function mapAdjustmentWriteError(error: unknown, lines: readonly AdjustmentLine[]): AdjustmentWriteOutcome {
  const { domainCode } = readDomainError(error);
  const details = isInventoryApiError(error) ? error.details : null;
  const row = (id: unknown) => lines.find((line) => line.id === id || line.stockUuid === id);
  if (domainCode === "STOCK_ADJUSTMENT_STOCK_CHANGED") {
    const changed = Array.isArray(details?.lines) ? details.lines as { lineId?: unknown; onHandPcs?: unknown; onHandWeightCt?: unknown }[] : [];
    const affected = changed.map((line) => ({ line, row: row(line.lineId) })).filter((item) => item.row);
    const rowErrors = affected.map(({ line, row: found }) => ({ key: found!.key, message: `Stock changed since picked (now ${String(line.onHandPcs ?? "?")} pcs / ${String(line.onHandWeightCt ?? "?")} cts). Remove and pick again.` }));
    const firstIndex = affected.length ? lines.indexOf(affected[0]!.row!) : -1;
    return { message: firstIndex >= 0 ? `Row ${firstIndex + 1}: ${rowErrors[0]!.message}` : "Stock changed since picked. Remove and pick again.", rowErrors, refetch: false };
  }
  if (domainCode === "STOCK_ADJUSTMENT_LINE_UNAVAILABLE") {
    const ids = Array.isArray(details?.lineIds) ? details.lineIds : [];
    const unavailable = ids.map(row).filter((value): value is AdjustmentLine => Boolean(value));
    return { message: unavailable.length ? `Row ${lines.indexOf(unavailable[0]!) + 1}: No longer in stock at this location.` : "A row is no longer in stock at this location. Remove it and pick again.", rowErrors: unavailable.map((line) => ({ key: line.key, message: "No longer in stock at this location" })), refetch: true };
  }
  if (domainCode === "STOCK_ADJUSTMENT_IN_USE") return { message: "Cannot edit or delete: these stones were used by a later document", rowErrors: [], refetch: true };
  if (domainCode === "VERSION_CONFLICT") return { message: "This document was changed by someone else. Refresh.", rowErrors: [], refetch: true };
  if (domainCode === "STOCK_ADJUSTMENT_STATUS") return { message: "This Stock Adjustment can't be changed in its current status. Refresh.", rowErrors: [], refetch: true };
  if (domainCode === "LOCATION_INVALID") return { message: "Choose an active Main Location.", rowErrors: [], refetch: false };
  if (domainCode === "NUMBERING_NOT_CONFIGURED") return { message: "Configure the Stock Adjustment document number first.", rowErrors: [], refetch: false };
  if (domainCode === "FORBIDDEN" || domainCode === "PERMISSION_DENIED") return { message: "You don't have permission to do this.", rowErrors: [], refetch: false };
  if (domainCode === "UNAUTHORIZED") return { message: "Your session has ended. Sign in again.", rowErrors: [], refetch: false };
  if (isInventoryApiError(error) && error.status >= 500) return { message: "The inventory service can't be reached. Try again in a moment.", rowErrors: [], refetch: false };
  if (isCallerLicenseCode(domainCode)) return { message: "Your license doesn't allow this right now.", rowErrors: [], refetch: false };
  return { message: "Couldn't save. Try again.", rowErrors: [], refetch: false };
}
