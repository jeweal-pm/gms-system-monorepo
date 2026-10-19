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
  415: "UNSUPPORTED_MEDIA_TYPE",
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
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  timeoutMs: number;
  responseSchema: z.ZodType<T>;
  body?: unknown;
  /** Raw bytes instead of JSON (user photo upload, user-photo.md PH-04). */
  raw?: { data: Buffer; contentType: string };
};

/**
 * Calls an auth internal endpoint with the caller's cookie. Auth re-validates the session and
 * Super Admin itself. Upstream `message` text is never forwarded; only a validated domain code
 * and bounded field errors are.
 */
export async function callAuth<T>({ cookie, method, path, timeoutMs, responseSchema, body, raw }: AuthCall<T>): Promise<T> {
  if (!cookie) throw domainError("UNAUTHORIZED", "UNAUTHORIZED");
  const authUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
  const headers: Record<string, string> = { cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (raw) headers["content-type"] = raw.contentType;
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${authUrl}${path}`, {
      method,
      headers,
      body: raw ? new Uint8Array(raw.data) : body === undefined ? undefined : JSON.stringify(body),
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

  if (!response.ok) throw authHttpError(response.status, payload);

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
  return parsed.data;
}

/** Maps an auth error status + envelope to the gateway domain error; upstream text is never forwarded. */
function authHttpError(status: number, payload: unknown) {
  const trpcCode = statusToTrpc[status] ?? "INTERNAL_SERVER_ERROR";
  const error = typeof payload === "object" && payload !== null && "error" in payload
    ? (payload as { error?: { code?: unknown; fieldErrors?: unknown } }).error
    : undefined;
  const rawCode = error?.code;
  const upstreamCode = isDomainCode(rawCode) ? rawCode : null;
  const domainCode = trpcCode === "INTERNAL_SERVER_ERROR" ? "INTERNAL_SERVER_ERROR" : upstreamCode ?? fallbackDomainCode[trpcCode] ?? trpcCode;
  return domainError(trpcCode, domainCode, trpcCode === "INTERNAL_SERVER_ERROR" ? null : sanitizeFieldErrors(error?.fieldErrors));
}

/**
 * GET of a binary auth resource (user photo, user-photo.md PH-04) with the caller's cookie. Reads at
 * most `maxBytes`; a larger or unreachable response is USER_SERVICE_UNAVAILABLE.
 */
export async function getAuthBinary({ cookie, path, maxBytes }: { cookie: string | null; path: string; maxBytes: number }) {
  if (!cookie) throw domainError("UNAUTHORIZED", "UNAUTHORIZED");
  const authUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
  let response: Response;
  let data: Buffer;
  try {
    response = await fetch(`${authUrl}${path}`, { method: "GET", headers: { cookie }, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS.write), redirect: "error" });
    data = await readBoundedBytes(response, response.ok ? maxBytes : MAX_RESPONSE_BYTES);
  } catch {
    throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
  }
  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(data.toString("utf8"));
    } catch {
      payload = null;
    }
    throw authHttpError(response.status, payload);
  }
  return { data, contentType: response.headers.get("content-type") ?? "application/octet-stream", version: response.headers.get("x-photo-version") ?? "" };
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("oversize");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error("oversize");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
