import type { z } from "zod";
import { renewAccess } from "./domain-trpc-fetch";

/**
 * load-to-stock FE-LS-016 (ADR-0052 D2, SA rev 1 api-contract "Conventions"): the typed REST client of
 * `backend-api-inventory`. Browser calls stay same-origin under `/api/inventory/v1` (nginx routes them; no service URL
 * here), send the access cookie only (`credentials: "same-origin"`, never a token header or a token in the URL), read
 * the GMS error envelope `{ error: { code, message, requestId, details? } }` and parse every success body with the
 * caller's Zod schema. A 401 renews the session once (shared with the tRPC clients, INV-20261111-001) and retries once:
 * the service refuses before any write when access has expired (error-handling `UNAUTHENTICATED`).
 */
export const INVENTORY_API_BASE = "/api/inventory/v1";

export type InventoryFieldError = { path: string; code: string; params?: Record<string, unknown> };

/** A refused inventory call: `code` is the envelope code (`LOAD_TO_STOCK_CHANGED`, …) or a client-side code. */
export class InventoryApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: Record<string, unknown> | null;
  readonly fieldErrors: InventoryFieldError[];

  constructor(status: number, code: string, message: string, requestId: string | null = null, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = "InventoryApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.fieldErrors = readFieldErrors(details);
  }
}

export function isInventoryApiError(error: unknown): error is InventoryApiError {
  return error instanceof InventoryApiError;
}

const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

function readFieldErrors(details: Record<string, unknown> | null): InventoryFieldError[] {
  const raw = details?.fieldErrors;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { path, code, params } = entry as { path?: unknown; code?: unknown; params?: unknown };
    if (typeof path !== "string" || typeof code !== "string") return [];
    return [{ path, code, ...(typeof params === "object" && params !== null ? { params: params as Record<string, unknown> } : {}) }];
  });
}

/** No envelope (nginx 502 while the service is down, a proxy page …): a code from the status alone. */
function fallbackCode(status: number): string {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 502 || status === 503 || status === 504) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "INTERNAL_ERROR";
  return "BAD_REQUEST";
}

async function toError(response: Response): Promise<InventoryApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const envelope = (body as { error?: { code?: unknown; message?: unknown; requestId?: unknown; details?: unknown } } | null)?.error;
  const code = typeof envelope?.code === "string" && CODE.test(envelope.code) ? envelope.code : fallbackCode(response.status);
  const message = typeof envelope?.message === "string" ? envelope.message : `Request failed (${response.status})`;
  const requestId = typeof envelope?.requestId === "string" ? envelope.requestId : response.headers.get("x-request-id");
  const details = typeof envelope?.details === "object" && envelope.details !== null && !Array.isArray(envelope.details) ? (envelope.details as Record<string, unknown>) : null;
  return new InventoryApiError(response.status, code, message, requestId, details);
}

export type QueryValue = string | number | boolean | null | undefined;

/** `/load-to-stock` + `{ q: "x", cursor: undefined }` → `/api/inventory/v1/load-to-stock?q=x` (empty values left out). */
export function inventoryUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!path.startsWith("/") || path.startsWith("//") || /^\/?[a-z]+:/i.test(path)) throw new Error("inventory path must be a relative API path");
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${INVENTORY_API_BASE}${path}${search ? `?${search}` : ""}`;
}

export type InventoryRequest<S extends z.ZodType> = {
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, QueryValue>;
  /** JSON body (POST / PUT). */
  body?: unknown;
  /** Multipart body (photo upload); sent as is. */
  form?: FormData;
  schema: S;
  signal?: AbortSignal;
};

export type InventoryClientDeps = { fetch?: typeof fetch; renew?: () => Promise<boolean> };

/** One call: same-origin, envelope errors, Zod-checked result, one renew-and-retry on 401. */
export async function inventoryRequest<S extends z.ZodType>(path: string, request: InventoryRequest<S>, deps: InventoryClientDeps = {}): Promise<z.output<S>> {
  const doFetch = deps.fetch ?? fetch;
  const renew = deps.renew ?? (() => renewAccess());
  const method = request.method ?? "GET";
  const url = inventoryUrl(path, request.query);
  const headers = new Headers({ accept: "application/json", "x-gms-csrf": "1" });
  let body: BodyInit | undefined;
  if (request.form) body = request.form;
  else if (request.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(request.body);
  }
  const send = async () => {
    try {
      return await doFetch(url, { method, headers, body, credentials: "same-origin", cache: "no-store", signal: request.signal });
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") throw error;
      throw new InventoryApiError(0, "NETWORK_ERROR", "The inventory service can't be reached.");
    }
  };
  let response = await send();
  // A single retry only; a second 401 goes back to the caller (no loop).
  if (response.status === 401 && (await renew().catch(() => false))) response = await send();
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return request.schema.parse(undefined);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new InventoryApiError(response.status, "INVALID_RESPONSE", "The inventory service sent an unreadable answer.");
  }
  const parsed = request.schema.safeParse(json);
  if (!parsed.success) throw new InventoryApiError(response.status, "INVALID_RESPONSE", "The inventory service sent an unexpected answer.");
  return parsed.data;
}
