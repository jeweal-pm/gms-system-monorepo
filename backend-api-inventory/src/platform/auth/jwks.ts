import { discardBody } from "./license-client";
import type { JWK } from "jose";
import { AppError, authUnavailable, unauthenticated } from "../errors";

/**
 * Bounded auth JWKS cache, ported from api-master `MasterJwksCache` (load-to-stock dependencies.md "Code reused by
 * porting"): ≤ 2 Ed25519 keys, ≤ 16 KiB, 10 min TTL, an unknown key id refreshes at most once per second.
 */
const MAX_JWKS_BYTES = 16_384;
const MAX_JWKS_KEYS = 2;
const JWKS_TTL_MS = 10 * 60_000;
const UNKNOWN_KID_REFRESH_INTERVAL_MS = 1_000;

export class JwksCache {
  private cached: JWK[] = [];
  private expiresAt = 0;
  private lastFetchAt = 0;
  private pending: Promise<JWK[]> | null = null;

  constructor(private readonly url: URL, private readonly fetcher: typeof fetch = fetch, private readonly now: () => number = Date.now) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash) throw new Error("Invalid JWKS URL");
  }

  async key(kid: string): Promise<JWK> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(kid)) throw unauthenticated();
    if (this.expiresAt <= this.now()) await this.refresh();
    let selected = this.cached.find((candidate) => candidate.kid === kid);
    if (!selected) {
      if (this.now() - this.lastFetchAt < UNKNOWN_KID_REFRESH_INTERVAL_MS) throw unauthenticated();
      await this.refresh();
      selected = this.cached.find((candidate) => candidate.kid === kid);
    }
    if (!selected) throw unauthenticated();
    return selected;
  }

  private async refresh(): Promise<JWK[]> {
    if (this.pending) return this.pending;
    this.pending = (async () => {
      this.lastFetchAt = this.now();
      let response: Response;
      // Cleared once the body is settled (see license-client: a late AbortSignal.timeout crashed undici).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      let payload: unknown;
      try {
        try {
          response = await this.fetcher(this.url, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal, redirect: "error" });
        } catch {
          throw authUnavailable();
        }
        const declared = Number(response.headers.get("content-length") ?? 0);
        if (!response.ok || (Number.isFinite(declared) && declared > MAX_JWKS_BYTES)) {
          await discardBody(response);
          throw authUnavailable();
        }
        try { payload = JSON.parse(await readBounded(response, MAX_JWKS_BYTES)); } catch { throw authUnavailable(); }
      } finally {
        clearTimeout(timer);
      }
      const keys = parseJwks(payload);
      if (!keys) throw authUnavailable();
      this.cached = keys;
      this.expiresAt = this.now() + JWKS_TTL_MS;
      return keys;
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }
}

export function parseJwks(value: unknown): JWK[] | null {
  if (!value || typeof value !== "object" || !Array.isArray((value as { keys?: unknown }).keys)) return null;
  const keys = (value as { keys: JWK[] }).keys;
  if (keys.length < 1 || keys.length > MAX_JWKS_KEYS) return null;
  const ids = new Set<string>();
  for (const key of keys) {
    if (!key || key.kty !== "OKP" || key.crv !== "Ed25519" || key.alg !== "EdDSA" || key.use !== "sig" || typeof key.kid !== "string" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(key.kid) || typeof key.x !== "string" || "d" in key || ids.has(key.kid)) return null;
    ids.add(key.kid);
  }
  return keys;
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new AppError(503, "AUTH_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}
