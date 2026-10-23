import { isTRPCClientError } from "@trpc/client";

/**
 * Shared reading of auth/master domain tRPC errors (moved unchanged from
 * features/user-permission/api.ts by FE-CUS-001). The domain errorFormatter
 * puts the domain code in `data.domainCode` and field errors in `data.fieldErrors`.
 */

export type ServerFieldError = { path: string; code: string };
export type DomainErrorInfo = { domainCode: string | null; fieldErrors: ServerFieldError[]; httpStatus: number | null };

const DOMAIN_CODE_PATTERN = /^[A-Z][A-Z_]{1,63}$/;

/**
 * Reads `data.domainCode` / `data.fieldErrors` from the domain errorFormatter (falls back to the
 * message code). A 401 has no domain code ("Authentication required"), so it is reported as "UNAUTHORIZED".
 */
export function readDomainError(error: unknown): DomainErrorInfo {
  if (!isTRPCClientError(error)) return { domainCode: null, fieldErrors: [], httpStatus: null };
  const data = error.data;
  const domainCode =
    data?.domainCode ??
    (DOMAIN_CODE_PATTERN.test(error.message) ? error.message : null) ??
    (data?.code === "UNAUTHORIZED" ? "UNAUTHORIZED" : null);
  return { domainCode, fieldErrors: data?.fieldErrors ?? [], httpStatus: data?.httpStatus ?? null };
}

export function isCallerLicenseCode(code: string | null): boolean {
  return code !== null && /^LICENSE_/.test(code);
}

/** Reads: retry up to twice only for transient failures (no 4xx retries). Mutations are never retried. */
export function retryTransient(failureCount: number, error: unknown): boolean {
  return retryTransientUpTo(failureCount, error, 2);
}

/** Read-only requests that sit behind a service restarting may retry longer, with a fixed bound. */
export function retryServiceRead(failureCount: number, error: unknown): boolean {
  return retryTransientUpTo(failureCount, error, 12);
}

/** Back off to one request every eight seconds while a local API finishes starting. */
export function serviceRestartRetryDelay(attemptIndex: number): number {
  return Math.min(1_000 * 2 ** attemptIndex, 8_000);
}

function retryTransientUpTo(failureCount: number, error: unknown, maxRetries: number): boolean {
  const { httpStatus, domainCode } = readDomainError(error);
  if (domainCode === "UNAUTHORIZED" || isCallerLicenseCode(domainCode)) return false;
  if (httpStatus !== null && httpStatus < 500) return false;
  return failureCount < maxRetries;
}
