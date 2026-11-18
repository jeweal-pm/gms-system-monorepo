import { readFileSync } from "node:fs";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { Logger } from "@nestjs/common";

/**
 * api-master → backend-api-inventory client (ADR-0052 D16–D19/D21/D22, api-contract "Inventory internal"):
 * - base URL `INVENTORY_INTERNAL_URL` (unset → every call is `InventoryUnavailable("disabled")`: the picker degrades to
 *   Memo Stock only and own-stock saves get 503, the documented rollback switch);
 * - bearer `MASTER_INVENTORY_SERVICE_TOKEN_FILE` (32 random bytes base64url, 43 chars; never logged);
 * - keep-alive agent with ≤ 4 sockets; 2 s for the picker read, 5 s for batch reads and hold PUTs (node:http with one
 *   bounded timer per call, cleared on settle; bodies are always drained, no `AbortSignal.timeout` — see the inventory
 *   license-client note of 2026-11-17);
 * - `503 INVENTORY_BUSY` is retried once after 1 s; anything else unknown → `InventoryUnavailable`.
 * No call is made inside a database transaction (callers' rule, D19).
 */
export const PICKER_TIMEOUT_MS = 2_000;
export const WRITE_TIMEOUT_MS = 5_000;
export const INVENTORY_MAX_SOCKETS = 4;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TOKEN = /^[A-Za-z0-9_-]{43,512}$/;

export class InventoryRefusal extends Error {
  constructor(readonly status: number, readonly code: string, readonly details: Record<string, unknown> | undefined) {
    super(code);
    this.name = "InventoryRefusal";
  }
}
export class InventoryUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "InventoryUnavailable";
  }
}

export type HoldDocType = "reserve" | "memo-out" | "memo-out-return";
export type HoldEntry = { stockUuid: string; pcs: number; weightCt: string };
export type OwnStockRow = {
  stockUuid: string; stockId: string; location: string; priceUnit: "PER_CT" | "PER_PCS";
  stoneCode: string; stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string; lot: string; cerType: string; cerNo: string;
  pcs: number; weightCt: string; availablePcs: number; availableWeightCt: string; stockPrice: string; salePrice: string; currency: string;
  vendor: { id: string; code: string; name: string }; load: { id: string; docNo: string; docDate: string }; itemNote: string;
};
export type OwnStockBatchRow = OwnStockRow & { status: "ACTIVE" | "REVERSED"; stoneCodeId: string | null };
export type AvailableInput = { q?: string; from?: string; to?: string; location?: string; after?: { date: string; stockId: string }; limit: number };
export type HoldResult = { revision: number; replayed: boolean; holds: HoldEntry[]; stocks: { stockUuid: string; stockId: string; availablePcs: number; availableWeightCt: string }[] };
export type CallOptions = { requestId?: string; actorId?: string };

export interface InventoryClient {
  available(input: AvailableInput, options?: CallOptions): Promise<OwnStockRow[]>;
  batch(ids: readonly string[], options?: CallOptions): Promise<OwnStockBatchRow[]>;
  putHolds(type: HoldDocType, id: string, body: { revision: number; documentNo: string | null; holds: HoldEntry[] }, options?: CallOptions): Promise<HoldResult>;
}

/** Reads the token file (trailing newline trimmed); null when unset, unreadable or malformed. */
export function readInventoryToken(path: string | undefined): string | null {
  if (!path || path.length > 512) return null;
  try {
    let token = readFileSync(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    return TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** A plain http(s) base URL without credentials, query or fragment; null when unset or invalid. */
export function inventoryBaseUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createInventoryClient(base: URL | null, token: string | null, logger = new Logger("InventoryClient")): InventoryClient {
  const secure = base?.protocol === "https:";
  const agent = secure
    ? new https.Agent({ keepAlive: true, maxSockets: INVENTORY_MAX_SOCKETS, maxFreeSockets: 2 })
    : new http.Agent({ keepAlive: true, maxSockets: INVENTORY_MAX_SOCKETS, maxFreeSockets: 2 });

  const once = (method: "POST" | "PUT", path: string, body: unknown, timeoutMs: number, options: CallOptions): Promise<{ status: number; json: unknown; retryAfter: boolean }> =>
    new Promise((resolve, reject) => {
      if (!base) return reject(new InventoryUnavailable("disabled"));
      if (!token) {
        logger.error({ event: "master.inventory_token_missing" });
        return reject(new InventoryUnavailable("token_missing"));
      }
      const payload = Buffer.from(JSON.stringify(body), "utf8");
      const headers: Record<string, string> = {
        authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json", "content-length": String(payload.length),
      };
      if (options.requestId) headers["x-request-id"] = options.requestId;
      if (options.actorId) headers["x-actor-user-id"] = options.actorId.slice(0, 64);
      let settled = false;
      const finish = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
      const req = (secure ? https : http).request(new URL(`/internal/v1/master${path}`, base), { method, headers, agent }, (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) { res.destroy(); finish(() => reject(new InventoryUnavailable("response_too_large"))); return; }
          chunks.push(chunk);
        });
        res.on("error", () => finish(() => reject(new InventoryUnavailable("connection"))));
        res.on("end", () => {
          let json: unknown = {};
          try { const text = Buffer.concat(chunks).toString("utf8"); json = text ? JSON.parse(text) : {}; } catch { json = {}; }
          finish(() => resolve({ status: res.statusCode ?? 0, json, retryAfter: res.headers["retry-after"] !== undefined }));
        });
      });
      const timer = setTimeout(() => { req.destroy(); finish(() => reject(new InventoryUnavailable("timeout"))); }, timeoutMs);
      req.on("error", () => finish(() => reject(new InventoryUnavailable("connection"))));
      req.end(payload);
    });

  const call = async <T>(method: "POST" | "PUT", path: string, body: unknown, timeoutMs: number, options: CallOptions = {}): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      const res = await once(method, path, body, timeoutMs, options);
      if (res.status >= 200 && res.status < 300) return res.json as T;
      const envelope = (res.json as { error?: { code?: unknown; details?: unknown } } | null)?.error;
      const code = typeof envelope?.code === "string" ? envelope.code : `HTTP_${res.status}`;
      if (res.status === 503 && code === "INVENTORY_BUSY" && attempt === 0) { await sleep(1_000); continue; }
      if (res.status === 401 || res.status === 403) {
        logger.error({ event: "master.inventory_auth_failed", status: res.status, requestId: options.requestId });
        throw new InventoryUnavailable("auth");
      }
      if (res.status >= 500 || res.status === 0) throw new InventoryUnavailable(`status_${res.status}`);
      throw new InventoryRefusal(res.status, code, envelope?.details && typeof envelope.details === "object" ? (envelope.details as Record<string, unknown>) : undefined);
    }
  };

  return {
    available: async (input, options) => (await call<{ items: OwnStockRow[] }>("POST", "/stock/available", input, PICKER_TIMEOUT_MS, options)).items,
    batch: async (ids, options) => (ids.length === 0 ? [] : (await call<{ items: OwnStockBatchRow[] }>("POST", "/stock/batch", { ids: [...ids] }, WRITE_TIMEOUT_MS, options)).items),
    putHolds: (type, id, body, options) => call<HoldResult>("PUT", `/stock-holds/${type}/${id}`, body, WRITE_TIMEOUT_MS, options),
  };
}

let current: InventoryClient | null = null;
/** The process client, created on first use from the environment (D21 secret + URL). */
export function inventoryClient(): InventoryClient {
  current ??= createInventoryClient(inventoryBaseUrl(process.env.INVENTORY_INTERNAL_URL), readInventoryToken(process.env.MASTER_INVENTORY_SERVICE_TOKEN_FILE));
  return current;
}
/** Tests and the operator script swap the client (null = rebuild from the environment). */
export function setInventoryClient(client: InventoryClient | null): void {
  current = client;
}
