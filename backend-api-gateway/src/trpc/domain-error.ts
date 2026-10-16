import { TRPCError } from "@trpc/server";

type TRPC_ERROR_CODE_KEY = TRPCError["code"];

export type FieldError = { path: string; code: string };

const MAX_FIELD_ERRORS = 50;
const DOMAIN_CODE_PATTERN = /^[A-Z][A-Z_]{1,63}$/;

/** Carries the domain code and bounded field errors to the router `errorFormatter`. */
export class DomainErrorDetails extends Error {
  constructor(readonly domainCode: string, readonly fieldErrors: FieldError[] | null = null) {
    super(domainCode);
    this.name = "DomainErrorDetails";
  }
}

export function domainError(code: TRPC_ERROR_CODE_KEY, domainCode: string, fieldErrors?: FieldError[] | null) {
  return new TRPCError({ code, message: domainCode, cause: new DomainErrorDetails(domainCode, fieldErrors ?? null) });
}

export function isDomainCode(value: unknown): value is string {
  return typeof value === "string" && DOMAIN_CODE_PATTERN.test(value);
}

export function sanitizeFieldErrors(value: unknown): FieldError[] | null {
  if (!Array.isArray(value)) return null;
  const result: FieldError[] = [];
  for (const entry of value.slice(0, MAX_FIELD_ERRORS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { path, code } = entry as { path?: unknown; code?: unknown };
    if (typeof path === "string" && typeof code === "string") result.push({ path: path.slice(0, 128), code: code.slice(0, 64) });
  }
  return result.length > 0 ? result : null;
}

type ValidationIssue = { path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>; code?: unknown; params?: unknown };

/** zod `custom` issues carry their contract code in `params.code` (e.g. ADR-0021 `required`). */
function issueCode(issue: ValidationIssue): string {
  if (issue.code === "custom" && typeof issue.params === "object" && issue.params !== null) {
    const custom = (issue.params as { code?: unknown }).code;
    if (typeof custom === "string" && custom.length > 0) return custom.slice(0, 64);
  }
  return typeof issue.code === "string" ? issue.code.slice(0, 64) : "invalid";
}

/**
 * Builds `{domainCode, fieldErrors}` for the errorFormatter (error-handling.md). Input
 * validation failures (zod or Standard Schema issues) become VALIDATION_ERROR, or
 * PASSWORD_POLICY_VIOLATION when only the password failed its policy.
 */
export function describeError(error: TRPCError): { domainCode: string | null; fieldErrors: FieldError[] | null } {
  const cause: unknown = error.cause;
  if (cause instanceof DomainErrorDetails) return { domainCode: cause.domainCode, fieldErrors: cause.fieldErrors };
  if (error.code === "BAD_REQUEST" && typeof cause === "object" && cause !== null && Array.isArray((cause as { issues?: unknown }).issues)) {
    const issues = (cause as { issues: ValidationIssue[] }).issues;
    const fieldErrors = issues.slice(0, MAX_FIELD_ERRORS).map((issue) => ({
      path: (issue.path ?? []).map((segment) => String(typeof segment === "object" && segment !== null ? segment.key : segment)).join(".").slice(0, 128) || "(root)",
      code: issueCode(issue),
    }));
    const passwordOnly = issues.length > 0 && issues.every((issue) => {
      const first = issue.path?.[0];
      const key = typeof first === "object" && first !== null ? first.key : first;
      return key === "password" && issue.code !== "invalid_type";
    });
    return { domainCode: passwordOnly ? "PASSWORD_POLICY_VIOLATION" : "VALIDATION_ERROR", fieldErrors };
  }
  return { domainCode: isDomainCode(error.message) ? error.message : null, fieldErrors: null };
}
