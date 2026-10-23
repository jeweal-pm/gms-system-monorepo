import { HttpException, HttpStatus } from "@nestjs/common";
import type { z } from "zod";

export type FieldError = { path: string; code: string };

const MAX_FIELD_ERRORS = 50;

const messages: Record<string, string> = {
  UNAUTHORIZED: "Authentication required",
  CSRF_INVALID: "The request origin could not be verified",
  PERMISSION_DENIED: "You don't have permission for this action",
  PERMISSION_GRANT_NOT_ALLOWED: "You can only grant permissions you hold yourself",
  USER_NOT_MANAGEABLE: "You can't change this user",
  PHOTO_TOO_LARGE: "The photo must be 5 MB or smaller",
  PHOTO_TYPE_NOT_ALLOWED: "The photo must be a JPEG or PNG image",
  PHOTO_NOT_FOUND: "The user has no photo",
  SUPER_ADMIN_LOCKED: "Super Admin permissions, status and password cannot be changed here, and Super Admin or your own account cannot be deleted",
  VALIDATION_ERROR: "The request is invalid",
  PASSWORD_POLICY_VIOLATION: "The password does not meet the policy",
  PERMISSION_UNKNOWN: "A permission is not in the catalog",
  LOCATION_UNKNOWN: "A location is not available",
  USER_NOT_FOUND: "The user was not found",
  USERNAME_TAKEN: "This username is already in use",
  USERNAME_IMMUTABLE: "The username cannot be changed",
  USER_CHANGED: "The user was changed by someone else; reload and try again",
  USER_LIMIT_REACHED: "The user limit has been reached",
  USER_LICENSE_NOT_ELIGIBLE: "This username has no eligible license",
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
