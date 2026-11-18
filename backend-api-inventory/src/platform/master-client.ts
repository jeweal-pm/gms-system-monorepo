import { readFileSync } from "node:fs";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { AppError } from "./errors";
import type { Logger } from "./logger";

/**
 * Client of api-master `/internal/v1/inventory/*` (ADR-0052 D4, architecture.md "Timeouts, retries, transactions"):
 * keep-alive, ≤ 4 sockets, 1 s connect, 5 s total; reads (GET / POST-read) retry once on a transient failure; the
 * allocation PUT is never retried here (the saga re-drives it with the stored revision). `X-Request-Id` is propagated;
 * `X-Actor-User-Id` is informational (audit only).
 *
 * Outcomes: `MasterRefusal` (a business 4xx with master's envelope), `MasterUnavailable` (timeout, connection, 5xx),
 * `AppError 500` for 401/403 (a configuration fault, logged `inventory.master_auth_failed`, never shown as user auth).
 */
export const MASTER_TIMEOUT_MS = 5_000;
export const MASTER_CONNECT_MS = 1_000;
export const MASTER_MAX_SOCKETS = 4;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class MasterRefusal extends Error {
  constructor(readonly status: number, readonly code: string, readonly details: Record<string, unknown> | undefined) {
    super(code);
    this.name = "MasterRefusal";
  }
}
export class MasterUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "MasterUnavailable";
  }
}

export type CallOptions = { requestId?: string; actorId?: string; retry?: boolean };
export type MasterStream = { status: number; headers: IncomingMessage["headers"]; body: IncomingMessage };

export interface MasterTransport {
  json<T>(method: "GET" | "POST" | "PUT", path: string, body: unknown, options?: CallOptions): Promise<T>;
  stream(path: string, options?: CallOptions): Promise<MasterStream>;
}

/** Reads the token file once (trailing newline trimmed); ≥ 43 printable characters. */
export function readMasterToken(path: string | undefined): string | null {
  if (!path) return null;
  try {
    let token = readFileSync(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    return /^[\x21-\x7E]{43,512}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function createMasterTransport(baseUrl: string, token: string | null, logger: Logger): MasterTransport {
  const base = new URL(baseUrl);
  const secure = base.protocol === "https:";
  const agent = secure
    ? new https.Agent({ keepAlive: true, maxSockets: MASTER_MAX_SOCKETS, maxFreeSockets: 2 })
    : new http.Agent({ keepAlive: true, maxSockets: MASTER_MAX_SOCKETS, maxFreeSockets: 2 });

  const request = (method: string, path: string, body: unknown, options: CallOptions): Promise<IncomingMessage> => new Promise((resolve, reject) => {
    if (!token) {
      reject(new AppError(500, "INTERNAL_ERROR"));
      logger.error({ event: "inventory.master_token_missing" });
      return;
    }
    const url = new URL(`/internal/v1/inventory${path}`, base);
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), "utf8");
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json" };
    if (payload) { headers["content-type"] = "application/json"; headers["content-length"] = String(payload.length); }
    if (options.requestId) headers["x-request-id"] = options.requestId;
    if (options.actorId) headers["x-actor-user-id"] = options.actorId;
    const req = (secure ? https : http).request(url, { method, headers, agent }, (res) => {
      clearTimeout(connectTimer);
      resolve(res);
    });
    const total = setTimeout(() => req.destroy(new MasterUnavailable("timeout")), MASTER_TIMEOUT_MS);
    const connectTimer = setTimeout(() => { if (!req.socket || req.socket.connecting) req.destroy(new MasterUnavailable("connect_timeout")); }, MASTER_CONNECT_MS);
    req.on("error", (error) => { clearTimeout(total); clearTimeout(connectTimer); reject(error instanceof MasterUnavailable ? error : new MasterUnavailable("connection")); });
    req.on("close", () => clearTimeout(total));
    if (payload) req.write(payload);
    req.end();
  });

  const readJson = async (res: IncomingMessage): Promise<unknown> => {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res) {
      size += (chunk as Buffer).length;
      if (size > MAX_RESPONSE_BYTES) { res.destroy(); throw new MasterUnavailable("response_too_large"); }
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
  };

  const once = async <T>(method: string, path: string, body: unknown, options: CallOptions): Promise<T> => {
    let res: IncomingMessage;
    try {
      res = await request(method, path, body, options);
    } catch (error) {
      if (error instanceof AppError || error instanceof MasterUnavailable) throw error;
      throw new MasterUnavailable("connection");
    }
    const status = res.statusCode ?? 0;
    let parsed: unknown;
    try { parsed = await readJson(res); } catch (error) { throw error instanceof MasterUnavailable ? error : new MasterUnavailable("bad_response"); }
    if (status >= 200 && status < 300) return parsed as T;
    if (status === 401 || status === 403) {
      logger.error({ event: "inventory.master_auth_failed", status, requestId: options.requestId });
      throw new AppError(500, "INTERNAL_ERROR");
    }
    if (status >= 500 || status === 0) throw new MasterUnavailable(`status_${status}`);
    const envelope = (parsed as { error?: { code?: unknown; details?: unknown } } | null)?.error;
    const code = typeof envelope?.code === "string" ? envelope.code : `HTTP_${status}`;
    throw new MasterRefusal(status, code, envelope?.details && typeof envelope.details === "object" ? envelope.details as Record<string, unknown> : undefined);
  };

  return {
    async json<T>(method: "GET" | "POST" | "PUT", path: string, body: unknown, options: CallOptions = {}) {
      const retry = options.retry ?? method !== "PUT";
      try {
        return await once<T>(method, path, body, options);
      } catch (error) {
        if (!retry || !(error instanceof MasterUnavailable)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.floor(Math.random() * 100)));
        return once<T>(method, path, body, options);
      }
    },
    async stream(path: string, options: CallOptions = {}) {
      let res: IncomingMessage;
      try { res = await request("GET", path, undefined, options); } catch (error) {
        if (error instanceof AppError || error instanceof MasterUnavailable) throw error;
        throw new MasterUnavailable("connection");
      }
      const status = res.statusCode ?? 0;
      if (status === 401 || status === 403) {
        res.resume();
        logger.error({ event: "inventory.master_auth_failed", status, requestId: options.requestId });
        throw new AppError(500, "INTERNAL_ERROR");
      }
      if (status >= 500) { res.resume(); throw new MasterUnavailable(`status_${status}`); }
      return { status, headers: res.headers, body: res };
    },
  };
}

/** Read-path mapping (error-handling.md "Master internal codes"): unavailable → 503 MASTER_UNAVAILABLE. */
export function mapReadError(error: unknown): unknown {
  if (error instanceof MasterUnavailable) return new AppError(503, "MASTER_UNAVAILABLE", undefined, { "Retry-After": "5" });
  if (error instanceof MasterRefusal) {
    if (error.status === 404) return new AppError(404, "NOT_FOUND");
    return new AppError(500, "INTERNAL_ERROR"); // inventory sent an invalid body: a bug
  }
  return error;
}
