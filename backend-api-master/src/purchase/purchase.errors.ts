import { HttpStatus, Logger } from "@nestjs/common";
import { partnerException, type FieldError } from "../common/errors";
import { documentErrors, type DocumentErrors } from "../trade-document/document-errors";

/**
 * purchase SA rev 1 error-handling.md: the shared document codes (`PURCHASE_NOT_FOUND`, `_CHANGED`, `_STATUS_INVALID`,
 * `_REFERENCE_INVALID`, `PARTNER_UNAVAILABLE`) plus the two Purchase factories. A CHECK violation (23514) means a guard
 * has a bug: it is logged as `purchase.check_violation` and returned as `PURCHASE_CHANGED` (never the SQL text).
 */
const base = documentErrors("PURCHASE", "Purchase", "purchase");
const logger = new Logger("Purchase");

/** Approve found a source quantity that is no longer available (409, every short line field). */
export const purchasePendingShort = (fields: FieldError[]) => partnerException("PURCHASE_PENDING_SHORT", HttpStatus.CONFLICT, fields);
/** The shared Stock ID counter reached 9,999 for the year (SA-PU-10). */
export const purchaseStockIdExhausted = () => partnerException("PURCHASE_STOCK_ID_EXHAUSTED", HttpStatus.CONFLICT);

const CHECK_VIOLATION = "23514";

/**
 * True when a database error (Prisma known request error, driver adapter error or its cause) carries SQLSTATE 23514.
 * Walks at most a few nested `cause` / `meta` / `driverAdapterError` objects; reads only codes.
 */
export function isCheckViolation(error: unknown, depth = 0): boolean {
  if (depth > 5 || typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (record.code === CHECK_VIOLATION || record.originalCode === CHECK_VIOLATION || record.kind === "CheckConstraintViolation") return true;
  return ["cause", "meta", "driverAdapterError"].some((key) => isCheckViolation(record[key], depth + 1));
}

export const purchaseErrors: DocumentErrors = {
  ...base,
  map: (error: unknown, operation: string) => {
    if (isCheckViolation(error)) {
      logger.error({ event: "purchase.check_violation", operation });
      return base.changed();
    }
    return base.map(error, operation);
  },
};
