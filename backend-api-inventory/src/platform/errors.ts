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
  LOAD_TO_STOCK_PHOTO_INVALID: "A photo is missing or is not a ready Load to Stock photo",
  RATE_LIMITED: "Too many requests; try again shortly",
  MASTER_UNAVAILABLE: "Purchase data is temporarily unavailable",
  SYNC_PENDING: "Saving in progress; refresh shortly",
  AUTH_UNAVAILABLE: "Sign-in can't be checked right now",
  DB_UNAVAILABLE: "The service is temporarily unavailable",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable",
  INTERNAL_ERROR: "The request could not be completed",
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
