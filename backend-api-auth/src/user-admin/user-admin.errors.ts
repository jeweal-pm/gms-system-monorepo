import { HttpException, HttpStatus } from "@nestjs/common";
import type { z } from "zod";

export type FieldError = { path: string; code: string };

const MAX_FIELD_ERRORS = 50;

const messages: Record<string, string> = {
  UNAUTHORIZED: "Authentication required",
  SUPER_ADMIN_REQUIRED: "Super Admin access is required",
  SUPER_ADMIN_READ_ONLY: "Super Admin accounts cannot be changed here",
  VALIDATION_ERROR: "The request is invalid",
  PASSWORD_POLICY_VIOLATION: "The password does not meet the policy",
  PERMISSION_UNKNOWN: "A permission is not in the catalog",
  LOCATION_UNKNOWN: "A location is not available",
  USER_NOT_FOUND: "The user was not found",
  EMAIL_ALREADY_EXISTS: "This email is already registered",
  USER_LIMIT_REACHED: "The user limit has been reached",
  USER_LICENSE_NOT_ELIGIBLE: "This email has no eligible license",
  USER_LICENSE_UNVERIFIABLE: "The license cannot be verified right now",
  LICENSE_REQUIRED: "An eligible license is required",
  LICENSE_EXPIRED: "The license has expired",
  LICENSE_REVOKED: "The license is not active",
  LICENSE_UNVERIFIABLE: "The license cannot be verified right now",
};

/** Auth envelope `{error:{code, message, fieldErrors?}}` (error-handling.md). */
export function userAdminException(code: string, status: HttpStatus, fieldErrors?: FieldError[], extra?: Record<string, unknown>) {
  return new HttpException({
    error: {
      code,
      message: messages[code] ?? "The request could not be completed",
      ...(fieldErrors && fieldErrors.length > 0 ? { fieldErrors: fieldErrors.slice(0, MAX_FIELD_ERRORS) } : {}),
      ...extra,
    },
  }, status);
}

export function zodFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.slice(0, MAX_FIELD_ERRORS).map((issue) => ({
    path: issue.path.map(String).join(".").slice(0, 128) || "(root)",
    code: issue.code,
  }));
}
