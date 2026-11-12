import { HttpException, HttpStatus } from "@nestjs/common";
import type { z } from "zod";

export type FieldError = { path: string; code: string };

export const MAX_FIELD_ERRORS = 50;

/** Fixed English sentences per code; never forwarded by the gateway (api-contract.md). */
const messages: Record<string, string> = {
  UNAUTHORIZED: "Service authentication required",
  VALIDATION_ERROR: "The request is invalid",
  CUSTOMER_NOT_FOUND: "The customer was not found",
  CUSTOMER_CODE_TAKEN: "This code name is already used",
  CUSTOMER_STALE: "The customer was changed by someone else",
  VENDOR_NOT_FOUND: "The vendor was not found",
  VENDOR_CODE_TAKEN: "This code name is already used",
  VENDOR_STALE: "The vendor was changed by someone else",
  COMPANY_PROFILE_NOT_FOUND: "The company profile was not found",
  STONE_MASTER_NOT_FOUND: "The stone master record was not found",
  STONE_MASTER_CODE_TAKEN: "This code is already used",
  STONE_MASTER_CHANGED: "The record was changed by someone else",
  STONE_MASTER_IN_USE: "The record is used by other records",
  STONE_MASTER_REFERENCE_INVALID: "A selected item is missing or inactive",
  COMPANY_LOGO_NOT_FOUND: "The company logo was not found",
  DOCUMENT_SETUP_NOT_FOUND: "The transaction was not found",
  DOCUMENT_SETUP_CHANGED: "The document setup was changed by someone else",
  DOCUMENT_SETUP_CODE_TAKEN: "This code is already used",
  CURRENCY_NOT_FOUND: "The currency was not found",
  CURRENCY_CHANGED: "The currency was changed by someone else",
  CURRENCY_CODE_TAKEN: "This code is already used",
  CURRENCY_IN_USE: "The currency is used by other records",
  CURRENCY_BASE_LOCKED: "The company currency is always active",
  MEMO_OUT_NOT_FOUND: "The memo out was not found",
  MEMO_OUT_CHANGED: "The memo out was changed by someone else",
  MEMO_OUT_STATUS_INVALID: "The memo out can't be changed in its current status",
  MEMO_OUT_REFERENCE_INVALID: "A selected item is missing or inactive",
  MEMO_OUT_PENDING_SHORT: "Some stock items no longer have enough pending",
  RESERVE_NOT_FOUND: "The reserve was not found",
  RESERVE_CHANGED: "The reserve was changed by someone else",
  RESERVE_STATUS_INVALID: "The reserve can't be changed in its current status",
  RESERVE_REFERENCE_INVALID: "A selected item is missing or inactive",
  RESERVE_PENDING_SHORT: "Some stock items no longer have enough pending",
  MEMO_OUT_RETURN_NOT_FOUND: "The memo out return was not found",
  MEMO_OUT_RETURN_CHANGED: "The memo out return was changed by someone else",
  MEMO_OUT_RETURN_STATUS_INVALID: "The memo out return can't be changed in its current status",
  MEMO_OUT_RETURN_REFERENCE_INVALID: "A selected item is missing or inactive",
  MEMO_RECEIVE_NOT_FOUND: "The memo receive was not found",
  MEMO_RECEIVE_CHANGED: "The memo receive was changed by someone else",
  MEMO_RECEIVE_STATUS_INVALID: "The memo receive can't be changed in its current status",
  MEMO_RECEIVE_REFERENCE_INVALID: "A selected item is missing or inactive",
  MEMO_RECEIVE_STOCK_ID_EXHAUSTED: "The Stock ID limit for this year has been reached",
  MEMO_RECEIVE_PHOTO_INVALID: "A photo is missing or is not a JPEG or PNG image up to 5 MB",
  MEMO_RETURN_NOT_FOUND: "The memo return was not found",
  MEMO_RETURN_CHANGED: "The memo return was changed by someone else",
  MEMO_RETURN_STATUS_INVALID: "The memo return can't be changed in its current status",
  MEMO_RETURN_REFERENCE_INVALID: "A selected item is missing or inactive",
  MEMO_RETURN_PENDING_SHORT: "Some items no longer have enough pending quantity",
  QUOTATION_NOT_FOUND: "The quotation was not found",
  QUOTATION_CHANGED: "The quotation was changed by someone else",
  QUOTATION_STATUS_INVALID: "The quotation can't be changed in its current status",
  QUOTATION_REFERENCE_INVALID: "A selected item is missing or inactive",
  QUOTATION_PHOTO_INVALID: "A photo is missing or is not a JPEG or PNG image up to 5 MB",
  PURCHASE_ORDER_NOT_FOUND: "The purchase order was not found",
  PURCHASE_ORDER_CHANGED: "The purchase order was changed by someone else",
  PURCHASE_ORDER_STATUS_INVALID: "The purchase order can't be changed in its current status",
  PURCHASE_ORDER_REFERENCE_INVALID: "A selected item is missing or inactive",
  PURCHASE_ORDER_PHOTO_INVALID: "A photo is missing or is not a JPEG or PNG image up to 5 MB",
  PURCHASE_NOT_FOUND: "The purchase was not found",
  PURCHASE_CHANGED: "The purchase was changed by someone else",
  PURCHASE_STATUS_INVALID: "The purchase can't be changed in its current status",
  PURCHASE_REFERENCE_INVALID: "A selected item is missing or inactive",
  PURCHASE_PENDING_SHORT: "Some items no longer have enough quantity available",
  PURCHASE_STOCK_ID_EXHAUSTED: "The Stock ID limit for this year has been reached",
  // transaction-soft-delete SA rev 1 (ADR-0045 D8): a write on a deleted document.
  QUOTATION_DELETED: "The quotation was deleted",
  RESERVE_DELETED: "The reserve was deleted",
  MEMO_RECEIVE_DELETED: "The memo receive was deleted",
  MEMO_RETURN_DELETED: "The memo return was deleted",
  MEMO_OUT_DELETED: "The memo out was deleted",
  MEMO_OUT_RETURN_DELETED: "The memo out return was deleted",
  PURCHASE_ORDER_DELETED: "The purchase order was deleted",
  PURCHASE_DELETED: "The purchase was deleted",
  // approval-setup SA rev 1 / ADR-0048.
  APPROVAL_SETTING_HAS_WAITING: "Documents are still waiting for approval or sent back for revision",
  APPROVAL_SETTING_CHANGED: "The approval setting was changed by someone else",
  APPROVAL_TYPE_OFF: "Approval is off for this document type",
  // approval-setup SA rev 1 / ADR-0048: submit while OFF, second Revise, edit / delete of a used auto-approved document.
  QUOTATION_APPROVAL_OFF: "Approval is off for this document type",
  QUOTATION_REVISE_LIMIT: "The quotation was already sent back for revision once",
  QUOTATION_IN_USE: "The quotation is used by another document",
  RESERVE_APPROVAL_OFF: "Approval is off for this document type",
  RESERVE_REVISE_LIMIT: "The reserve was already sent back for revision once",
  RESERVE_IN_USE: "The reserve is used by another document",
  MEMO_RECEIVE_APPROVAL_OFF: "Approval is off for this document type",
  MEMO_RECEIVE_REVISE_LIMIT: "The memo receive was already sent back for revision once",
  MEMO_RECEIVE_IN_USE: "The memo receive is used by another document",
  MEMO_RETURN_APPROVAL_OFF: "Approval is off for this document type",
  MEMO_RETURN_REVISE_LIMIT: "The memo return was already sent back for revision once",
  MEMO_RETURN_IN_USE: "The memo return is used by another document",
  MEMO_OUT_APPROVAL_OFF: "Approval is off for this document type",
  MEMO_OUT_REVISE_LIMIT: "The memo out was already sent back for revision once",
  MEMO_OUT_IN_USE: "The memo out is used by another document",
  MEMO_OUT_RETURN_APPROVAL_OFF: "Approval is off for this document type",
  MEMO_OUT_RETURN_REVISE_LIMIT: "The memo out return was already sent back for revision once",
  MEMO_OUT_RETURN_IN_USE: "The memo out return is used by another document",
  PURCHASE_ORDER_APPROVAL_OFF: "Approval is off for this document type",
  PURCHASE_ORDER_REVISE_LIMIT: "The purchase order was already sent back for revision once",
  PURCHASE_ORDER_IN_USE: "The purchase order is used by another document",
  PURCHASE_APPROVAL_OFF: "Approval is off for this document type",
  PURCHASE_REVISE_LIMIT: "The purchase was already sent back for revision once",
  PURCHASE_IN_USE: "The purchase is used by another document",
  CONFLICT: "The company profile was changed by someone else",
  PAYLOAD_TOO_LARGE: "The request body is too large",
  UNSUPPORTED_MEDIA_TYPE: "The request content type is not supported",
  NOT_FOUND: "The resource was not found",
  PARTNER_UNAVAILABLE: "The service is temporarily unavailable",
  INTERNAL_SERVER_ERROR: "The request could not be completed",
};

/**
 * Small, non-sensitive facts a client needs to explain a refusal (approval-setup api-contract: `HAS_WAITING {pending,
 * revision}`, `<CODE>_IN_USE {usedBy}`). Counts and document numbers only; never notes, names or input echoes.
 */
export type ErrorDetails = Readonly<Record<string, string | number>>;

export function errorBody(code: string, fieldErrors?: FieldError[] | null, details?: ErrorDetails) {
  return {
    error: {
      code,
      message: messages[code] ?? messages.INTERNAL_SERVER_ERROR,
      ...(fieldErrors && fieldErrors.length > 0 ? { fieldErrors: fieldErrors.slice(0, MAX_FIELD_ERRORS) } : {}),
      ...(details ? { details } : {}),
    },
  };
}

/** Partner envelope `{error:{code, message, fieldErrors?, details?}}` (error-handling.md). */
export function partnerException(code: string, status: HttpStatus, fieldErrors?: FieldError[] | null, details?: ErrorDetails) {
  return new HttpException(errorBody(code, fieldErrors, details), status);
}

export function validationException(fieldErrors: FieldError[]) {
  return partnerException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, fieldErrors);
}

/** zod issues -> bounded field errors. Custom issues carry their code in `params.code`. */
export function zodFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.slice(0, MAX_FIELD_ERRORS).map((issue) => {
    const custom = issue.code === "custom" ? (issue.params as { code?: unknown } | undefined)?.code : undefined;
    return {
      path: issue.path.map(String).join(".").slice(0, 128) || "(root)",
      code: (typeof custom === "string" ? custom : issue.code).slice(0, 64),
    };
  });
}

/** Parses or throws `400 VALIDATION_ERROR` with bounded field errors. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationException(zodFieldErrors(parsed.error));
  return parsed.data;
}
