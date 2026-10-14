import type { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { domainError, isDomainCode, sanitizeFieldErrors } from "./domain-error";

type TrpcCode = TRPCError["code"];

/** Gateway -> auth timeouts (architecture.md §9). Mutations are never retried. */
export const AUTH_TIMEOUT_MS = { read: 3_500, create: 6_000, write: 5_000 } as const;

const MAX_RESPONSE_BYTES = 1_048_576;

const statusToTrpc: Record<number, TrpcCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "UNPROCESSABLE_CONTENT",
  429: "TOO_MANY_REQUESTS",
  503: "SERVICE_UNAVAILABLE",
};

const fallbackDomainCode: Partial<Record<TrpcCode, string>> = {
  BAD_REQUEST: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "USER_NOT_FOUND",
  SERVICE_UNAVAILABLE: "USER_SERVICE_UNAVAILABLE",
};

type AuthCall<T> = {
  cookie: string | null;
  method: "GET" | "POST" | "DELETE";
  path: string;
  timeoutMs: number;
  responseSchema: z.ZodType<T>;
  body?: unknown;
};

/**
 * Calls an auth internal endpoint with the caller's cookie. Auth re-validates the session and
 * Super Admin itself. Upstream `message` text is never forwarded; only a validated domain code
 * and bounded field errors are.
 */
export async function callAuth<T>({ cookie, method, path, timeoutMs, responseSchema, body }: AuthCall<T>): Promise<T> {
  if (!cookie) throw domainError("UNAUTHORIZED", "UNAUTHORIZED");
  const authUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${authUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await response.text();
  } catch {
    throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
  }
  if (text.length > MAX_RESPONSE_BYTES) throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const trpcCode = statusToTrpc[response.status] ?? "INTERNAL_SERVER_ERROR";
    const error = typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: { code?: unknown; fieldErrors?: unknown } }).error
      : undefined;
    const rawCode = error?.code;
    const upstreamCode = isDomainCode(rawCode) ? rawCode : null;
    const domainCode = trpcCode === "INTERNAL_SERVER_ERROR" ? "INTERNAL_SERVER_ERROR" : upstreamCode ?? fallbackDomainCode[trpcCode] ?? trpcCode;
    throw domainError(trpcCode, domainCode, trpcCode === "INTERNAL_SERVER_ERROR" ? null : sanitizeFieldErrors(error?.fieldErrors));
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
  return parsed.data;
}
