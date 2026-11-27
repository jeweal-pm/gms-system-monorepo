/**
 * Public error envelope `{ error: { code, message, requestId, details? } }` (load-to-stock SA rev 1 error-handling.md).
 * `message` is a fixed English text per code — never SQL, stacks, paths, prices or other users' data; `details` holds
 * field paths, ids and quantities only.
 */
export type FieldError = { path: string; code: string; params?: Record<string, string | number> };
export type ErrorDetails = Record<string, unknown>;

export const MESSAGES: Record<string, string> = {
  BAD_REQUEST: "The request is malformed",
  NOT_FOUND: "The resource was not found",
  METHOD_NOT_ALLOWED: "The method is not allowed",
  UNSUPPORTED_MEDIA_TYPE: "The request content type is not supported",
  UNAUTHENTICATED: "Sign in again",
  PERMISSION_DENIED: "You do not have permission for this action",
  CSRF_INVALID: "The request did not come from a trusted page",
  LICENSE_DENIED: "An eligible license is required",
  LOAD_TO_STOCK_NOT_FOUND: "Load to Stock not found",
  PHOTO_NOT_FOUND: "The photo was not found",
  LOAD_TO_STOCK_CHANGED: "The Load to Stock was changed by someone else",
  LOAD_TO_STOCK_STATUS_INVALID: "The Load to Stock can't be changed in its current status",
  LOAD_TO_STOCK_BUSY: "Saving in progress",
  LOAD_TO_STOCK_IN_USE: "Some stock from this load is already used; it can't be changed",
  LOAD_TO_STOCK_EXCEEDS_REMAINING: "Some purchase lines do not have enough remaining quantity",
  LOAD_TO_STOCK_REVISE_LIMIT: "The Load to Stock was already sent back for revision once",
  APPROVAL_SETTING_CHANGED: "The approval setting was changed by someone else",
  APPROVAL_SETTING_HAS_WAITING: "Documents are still waiting for approval or sent back for revision",
  LOCATION_INACTIVE: "A location is not an active location",
  PHOTO_TOO_LARGE: "A photo can be at most 5 MB",
  PHOTO_TYPE_INVALID: "A photo must be a JPEG or PNG image",
  PAYLOAD_TOO_LARGE: "The request body is too large",
  VALIDATION_ERROR: "The request is invalid",
  LOAD_TO_STOCK_LINE_UNAVAILABLE: "Some purchase lines can no longer be loaded",
  // stock-adjustment SA rev 1 error-handling.md (ADR-0059).
  STOCK_ADJUSTMENT_NOT_FOUND: "Stock Adjustment not found",
  STOCK_ADJUSTMENT_STOCK_CHANGED: "Stock changed since it was picked",
  STOCK_ADJUSTMENT_IN_USE: "Some stock has been used since this adjustment; it can't be changed",
  STOCK_ADJUSTMENT_STATUS: "The Stock Adjustment can't be changed in its current status",
  STOCK_ADJUSTMENT_LINE_UNAVAILABLE: "Some stock is no longer available at this location",
  STOCK_ADJUSTMENT_REVISE_LIMIT: "The Stock Adjustment was already sent back for revision once",
  LOCATION_INVALID: "Select an active location",
  NUMBERING_NOT_CONFIGURED: "Document numbering is not configured",
  VERSION_CONFLICT: "The document was changed by someone else",
  LOAD_TO_STOCK_PHOTO_INVALID: "A photo is missing or is not a ready Load to Stock photo",
  RATE_LIMITED: "Too many requests; try again shortly",
  MASTER_UNAVAILABLE: "Purchase data is temporarily unavailable",
  SYNC_PENDING: "Saving in progress; refresh shortly",
  AUTH_UNAVAILABLE: "Sign-in can't be checked right now",
  DB_UNAVAILABLE: "The service is temporarily unavailable",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable",
  INTERNAL_ERROR: "The request could not be completed",
  // sale SA rev 1 error-handling.md (ADR-0054)
  SALE_NOT_FOUND: "Sale not found",
  SALE_CHANGED: "The sale was changed by someone else",
  SALE_DELETED: "The sale was deleted",
  SALE_STATUS_INVALID: "The sale can't be changed in its current status",
  SALE_BUSY: "Saving in progress",
  SALE_IN_USE: "Items of this sale are already purchased from the vendor; it can't be changed",
  SALE_REVISE_LIMIT: "The sale was already sent back for revision once",
  SALE_SOURCE_SHORT: "Some items no longer have enough available quantity",
  SALE_REFERENCE_INVALID: "Some items are no longer available",
  SALE_PHOTO_INVALID: "A photo is missing or is not a ready Sale photo",
  // stock-transfer-location api-contract "Errors" (ADR-0060)
  // merge-split SA rev 1 error-handling.md
  MERGE_SPLIT_NOT_FOUND: "Merge/Split not found",
  MERGE_SPLIT_STATUS: "The Merge/Split can't be changed in its current status",
  MERGE_SPLIT_STOCK_CHANGED: "Some stocks changed since they were picked",
  MERGE_SPLIT_SOURCE_PENDING: "Some stocks are on another Merge/Split waiting for approval",
  MERGE_SPLIT_BUSY: "Some stocks are being updated; retry shortly",
  MERGE_SPLIT_IN_USE: "Stock created by this Merge/Split is already used; it can't be changed",
  MERGE_SPLIT_SOURCE_UNAVAILABLE: "Some stocks are no longer available",
  MERGE_SPLIT_CURRENCY_MIXED: "Stocks with different currencies can't be merged",
  MASTER_DATA_INVALID: "Select active master data",
  STOCK_TRANSFER_NOT_FOUND: "Stock Transfer Location not found",
  STOCK_TRANSFER_STATUS: "The Stock Transfer Location can't be changed in its current status",
  STOCK_TRANSFER_EXCEEDS_ON_HAND: "Some stocks no longer have enough on-hand quantity",
  STOCK_TRANSFER_IN_USE: "Stock moved by this transfer is already used; it can't be changed",
  STOCK_TRANSFER_LINE_UNAVAILABLE: "Some stocks can no longer be transferred",
  STOCK_TRANSFER_APPROVAL_OFF: "Approval is turned off for Stock Transfer Location; save the document instead",
  VALIDATION_FAILED: "The request is invalid",
  STOCK_TRANSFER_REVISE_LIMIT: "The Stock Transfer Location was already sent back for revision once",
  // Internal API for api-master (ADR-0052 D18/D21, error-handling "Inventory internal codes").
  SERVICE_UNAUTHENTICATED: "The service credential is missing or invalid",
  INVENTORY_BUSY: "Too many internal requests; retry shortly",
  STOCK_HOLD_STALE: "The hold revision is older than the applied one",
  STOCK_HOLD_EXCEEDS_AVAILABLE: "Some stocks do not have enough available quantity",
  STOCK_HOLD_EXCEEDS_MEMO_OUT: "Some stocks do not have enough quantity out on memo",
  STOCK_HOLD_IN_USE: "Some held quantity is already used",
  STOCK_HOLD_BUSY: "Some stocks belong to a load that is being saved",
  STOCK_HOLD_UNAVAILABLE: "Some stocks are no longer in stock",
  // lot-based-stock SA rev 1 error-handling.md (ADR-0055)
  STOCK_LOT_TOO_LARGE: "A lot has too many stocks to pick in one document",
  // stock-card SA rev 1 error-handling.md (ADR-0056)
  STOCK_CARD_NOT_FOUND: "This stock card no longer exists",
  STOCK_CARD_TOO_LARGE: "The stock card has too many transactions; narrow the date range",
  STOCK_CARD_BUSY: "The report is busy; retry shortly",
  STOCK_CARD_TIMEOUT: "The report took too long; narrow the date range or search",
  // stock-value SA rev 1 error-handling.md (ADR-0057)
  STOCK_VALUE_NOT_FOUND: "This stock card no longer exists",
  STOCK_VALUE_TOO_LARGE: "The stock card has too many transactions; narrow the date range",
  STOCK_VALUE_BUSY: "The report is busy; retry shortly",
  STOCK_VALUE_TIMEOUT: "The report took too long; narrow the date range or search",
};

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: ErrorDetails,
    readonly headers?: Record<string, string>,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export const MAX_FIELD_ERRORS = 50;

export const unauthenticated = () => new AppError(401, "UNAUTHENTICATED");
export const permissionDenied = () => new AppError(403, "PERMISSION_DENIED");
export const authUnavailable = () => new AppError(503, "AUTH_UNAVAILABLE");
export const notFound = (code = "LOAD_TO_STOCK_NOT_FOUND") => new AppError(404, code);
export const validationError = (fieldErrors: FieldError[]) => new AppError(422, "VALIDATION_ERROR", { fieldErrors: fieldErrors.slice(0, MAX_FIELD_ERRORS) });
export const masterUnavailable = () => new AppError(503, "MASTER_UNAVAILABLE", undefined, { "Retry-After": "5" });

export function errorBody(code: string, requestId: string, details?: ErrorDetails) {
  return { error: { code, message: MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR, requestId, ...(details ? { details } : {}) } };
}

/** SQLSTATE / Prisma codes that mean the database is not reachable (→ 503 DB_UNAVAILABLE). */
const UNAVAILABLE = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "ECONNREFUSED", "57P01", "57P03", "08006", "08001"]);

export function isDbUnavailable(error: unknown, depth = 0): boolean {
  if (depth > 4 || typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string" && UNAVAILABLE.has(record.code)) return true;
  if (typeof record.message === "string" && /timed out fetching a new connection|Connection terminated|ECONNREFUSED/i.test(record.message)) return true;
  return ["cause", "meta", "driverAdapterError"].some((key) => isDbUnavailable(record[key], depth + 1));
}

/** SQLSTATE of a database error (walks a few nested causes; reads codes only). */
export function sqlState(error: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  for (const key of ["originalCode", "code"]) {
    const value = record[key];
    if (typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)) return value;
  }
  for (const key of ["cause", "meta", "driverAdapterError"]) {
    const found = sqlState(record[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}
