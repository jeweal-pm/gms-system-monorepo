import { Logger } from "@nestjs/common";
import type { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { domainError, isDomainCode, sanitizeFieldErrors } from "./domain-error";

type TrpcCode = TRPCError["code"];

/** Gateway -> partner timeouts (customer architecture.md §10). Nothing is retried here. */
export const PARTNER_TIMEOUT_MS = { read: 3_000, write: 5_000 } as const;

const MAX_RESPONSE_BYTES = 1_048_576;
const ACTOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const logger = new Logger("PartnerClient");

type PartnerCall<T> = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  /** Logged route template without IDs or query text, e.g. `GET /customers/:id`. */
  route: string;
  timeoutMs: number;
  actorId: string;
  responseSchema: z.ZodType<T>;
  body?: unknown;
};

class PartnerUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Reads at most 1 MiB of the response body; larger bodies abort the request. */
async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new PartnerUnavailable("oversize");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new PartnerUnavailable("oversize");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function unavailable(route: string, startedAt: number, outcome: string, level: "warn" | "error" = "warn") {
  logger[level]({ event: "partner.unavailable", route, durationMs: Date.now() - startedAt, outcome });
  return domainError("SERVICE_UNAVAILABLE", "PARTNER_UNAVAILABLE");
}

/**
 * Calls a partner internal endpoint with the service token and the caller's user ID
 * (ADR-0018 §1, D-04). Upstream `message` text is never forwarded; partner 401/403 become
 * PARTNER_UNAVAILABLE so a token misconfiguration never logs users out (error-handling.md).
 */
export async function callPartner<T>({ method, path, route, timeoutMs, actorId, responseSchema, body }: PartnerCall<T>): Promise<T> {
  const baseUrl = process.env.PARTNER_SERVICE_URL ?? "http://localhost:3201";
  const token = process.env.PARTNER_SERVICE_TOKEN ?? "";
  const startedAt = Date.now();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (ACTOR_PATTERN.test(actorId)) headers["x-actor-user-id"] = actorId;
  if (body !== undefined) headers["content-type"] = "application/json";

  let response: Response;
  let text: string;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    text = await readBounded(response);
  } catch (error) {
    const outcome = error instanceof PartnerUnavailable ? error.reason
      : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "network";
    throw unavailable(route, startedAt, outcome);
  }

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 401 || status === 403) throw unavailable(route, startedAt, "partner rejected service token", "error");
    if (status === 503) throw unavailable(route, startedAt, "partner 503");
    const trpcCode: TrpcCode = status === 400 ? "BAD_REQUEST"
      : status === 404 ? "NOT_FOUND"
        : status === 409 ? "CONFLICT"
          : status === 413 ? "PAYLOAD_TOO_LARGE"
            : "INTERNAL_SERVER_ERROR";
    if (trpcCode === "INTERNAL_SERVER_ERROR") {
      logger.error({ event: "partner.error", route, status, durationMs: Date.now() - startedAt });
      throw domainError("INTERNAL_SERVER_ERROR", "INTERNAL_SERVER_ERROR");
    }
    if (trpcCode === "PAYLOAD_TOO_LARGE") {
      logger.warn({ event: "partner.payload_too_large", route });
      throw domainError("PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
    }
    const error = typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: { code?: unknown; fieldErrors?: unknown } }).error
      : undefined;
    const upstream = isDomainCode(error?.code) ? error.code : null;
    const fallback = trpcCode === "BAD_REQUEST" ? "VALIDATION_ERROR" : trpcCode === "NOT_FOUND" ? "CUSTOMER_NOT_FOUND" : "CONFLICT";
    const fieldErrors = trpcCode === "NOT_FOUND" ? null : sanitizeFieldErrors(error?.fieldErrors);
    throw domainError(trpcCode, upstream ?? fallback, fieldErrors);
  }

  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) throw unavailable(route, startedAt, "malformed response");
  return parsed.data;
}
