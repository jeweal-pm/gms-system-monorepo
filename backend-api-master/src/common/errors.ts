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
  CONFLICT: "The company profile was changed by someone else",
  PAYLOAD_TOO_LARGE: "The request body is too large",
  UNSUPPORTED_MEDIA_TYPE: "The request content type is not supported",
  NOT_FOUND: "The resource was not found",
  PARTNER_UNAVAILABLE: "The service is temporarily unavailable",
  INTERNAL_SERVER_ERROR: "The request could not be completed",
};

export function errorBody(code: string, fieldErrors?: FieldError[] | null) {
  return {
    error: {
      code,
      message: messages[code] ?? messages.INTERNAL_SERVER_ERROR,
      ...(fieldErrors && fieldErrors.length > 0 ? { fieldErrors: fieldErrors.slice(0, MAX_FIELD_ERRORS) } : {}),
    },
  };
}

/** Partner envelope `{error:{code, message, fieldErrors?}}` (error-handling.md). */
export function partnerException(code: string, status: HttpStatus, fieldErrors?: FieldError[] | null) {
  return new HttpException(errorBody(code, fieldErrors), status);
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
