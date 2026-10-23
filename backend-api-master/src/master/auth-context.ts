import { jwtVerify, importJWK, type JWK, type JWTPayload } from "jose";
import { TRPCError } from "@trpc/server";
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_COOKIE_NAME } from "./auth-contract";
import type { MasterContext } from "./authorization";

const MAX_JWKS_BYTES = 16_384;
const MAX_JWKS_KEYS = 2;
const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_AUTHORIZATION_GRANTS = 576;
const JWKS_TTL_MS = 10 * 60_000;
const UNKNOWN_KID_REFRESH_INTERVAL_MS = 1_000;

export type MasterLicenseState = "ELIGIBLE" | "DENIED" | "UNAVAILABLE" | "UNAUTHENTICATED";
export type MasterLicenseCheck = (userId: string, sessionId: string) => Promise<MasterLicenseState>;
export type MasterRequest = { method?: string; headers: Record<string, string | string[] | undefined> };

type CurrentAuthorizationRow = {
  session_id: string;
  user_id: string;
  session_expires_at: Date | string;
  account_active: boolean;
  account_role: string;
  permissions: string[];
  location_keys: string[];
};

type JwksDocument = { keys: JWK[] };

/** Bounded public-key cache. Unknown key IDs cause at most one fetch per second. */
export class MasterJwksCache {
  private cached: JWK[] = [];
  private expiresAt = 0;
  private lastFetchAt = 0;
  private pending: Promise<JWK[]> | null = null;

  constructor(
    private readonly url: URL,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
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
      try {
        response = await this.fetcher(this.url, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(2_000) });
      } catch {
        throw authorizationUnavailable();
      }
      if (!response.ok) throw authorizationUnavailable();
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_JWKS_BYTES) throw authorizationUnavailable();
      let payload: unknown;
      try { payload = JSON.parse(await readBoundedBody(response, MAX_JWKS_BYTES)); }
      catch { throw authorizationUnavailable(); }
      const keys = parseJwks(payload);
      if (!keys) throw authorizationUnavailable();
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

/** Builds user identity from a configured access JWT and fresh auth-owned view row per request. */
export class MasterAuthContextAdapter {
  constructor(
    private readonly options: {
      issuer: string;
      audience?: string;
      trustedOrigin: string;
      /** Extra origins accepted for cookie mutations, e.g. a LAN address of the dev preview (opt-in, default none). */
      extraTrustedOrigins?: readonly string[];
      jwks: MasterJwksCache;
      checkLicense?: MasterLicenseCheck;
      authorizationReader: (userId: string, sessionId: string) => Promise<CurrentAuthorizationRow | null>;
      now?: () => Date;
    },
  ) {
    if (!options.issuer || !URL.canParse(options.issuer) || !options.trustedOrigin || !URL.canParse(options.trustedOrigin)) {
      throw new Error("Invalid master authentication configuration");
    }
    for (const extra of options.extraTrustedOrigins ?? []) {
      if (!URL.canParse(extra) || !/^https?:$/.test(new URL(extra).protocol)) throw new Error("Invalid master authentication configuration");
    }
    this.trustedOrigins = new Set([options.trustedOrigin, ...(options.extraTrustedOrigins ?? [])].map((value) => new URL(value).origin));
  }

  private readonly trustedOrigins: ReadonlySet<string>;

  async create(request: MasterRequest): Promise<MasterContext> {
    const token = accessCookie(request.headers.cookie);
    if (!token) throw unauthenticated();
    const mutation = request.method !== undefined && !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
    if (mutation && !verifyCsrfHeaders(request.headers, this.trustedOrigins)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, async (protectedHeader) => {
        if (protectedHeader.alg !== "EdDSA" || typeof protectedHeader.kid !== "string") throw unauthenticated();
        const jwk = await this.options.jwks.key(protectedHeader.kid);
        return importJWK(jwk, "EdDSA");
      }, {
        algorithms: ["EdDSA"],
        issuer: this.options.issuer,
        audience: this.options.audience ?? ACCESS_TOKEN_AUDIENCE,
        clockTolerance: 5,
        currentDate: this.options.now?.(),
      });
      payload = verified.payload;
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof Error && error.message === "AUTHORIZATION_UNAVAILABLE") throw authorizationUnavailable();
      throw unauthenticated();
    }
    if (typeof payload.sub !== "string" || !payload.sub || typeof payload.sid !== "string" || !payload.sid) throw unauthenticated();

    let row: CurrentAuthorizationRow | null;
    try {
      row = await this.options.authorizationReader(payload.sub, payload.sid);
    } catch {
      throw authorizationUnavailable();
    }
    if (!row) throw unauthenticated();
    const expiresAt = row.session_expires_at instanceof Date ? row.session_expires_at : new Date(row.session_expires_at);
    if (row.user_id !== payload.sub || row.session_id !== payload.sid || !row.account_active || !Number.isFinite(expiresAt.getTime()) || expiresAt <= (this.options.now?.() ?? new Date())) {
      throw unauthenticated();
    }
    if (!Array.isArray(row.permissions) || row.permissions.length > MAX_AUTHORIZATION_GRANTS || !row.permissions.every(isPermissionKey)) {
      throw authorizationUnavailable();
    }
    if (!Array.isArray(row.location_keys) || row.location_keys.length > 20 || !row.location_keys.every((key) => typeof key === "string" && /^[a-z0-9_-]{1,64}$/.test(key))) {
      throw authorizationUnavailable();
    }

    const checkLicense = this.options.checkLicense;
    let license: MasterLicenseState = "UNAVAILABLE";
    if (checkLicense) {
      try { license = await checkLicense(payload.sub, payload.sid); } catch { license = "UNAVAILABLE"; }
    }
    if (license === "UNAUTHENTICATED") throw new TRPCError({ code: "UNAUTHORIZED", message: "AUTHORIZATION_CONTEXT_INVALID" });
    return {
      principal: {
        userId: payload.sub,
        sessionId: payload.sid,
        isSuperAdmin: row.account_role === "admin",
        grants: [...row.permissions],
      },
      authorization: "CURRENT",
      license,
      csrfVerified: true,
    };
  }
}

function parseJwks(value: unknown): JWK[] | null {
  if (!value || typeof value !== "object" || !("keys" in value) || !Array.isArray((value as { keys?: unknown }).keys)) return null;
  const keys = (value as JwksDocument).keys;
  if (keys.length < 1 || keys.length > MAX_JWKS_KEYS) return null;
  const ids = new Set<string>();
  for (const key of keys) {
    if (!key || key.kty !== "OKP" || key.crv !== "Ed25519" || key.alg !== "EdDSA" || key.use !== "sig" || typeof key.kid !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(key.kid) || typeof key.x !== "string" || "d" in key || ids.has(key.kid)) return null;
    ids.add(key.kid);
  }
  return keys;
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) throw new Error("JWKS response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("JWKS response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

function accessCookie(header: string | string[] | undefined): string | null {
  if (typeof header !== "string" || Buffer.byteLength(header) > MAX_COOKIE_HEADER_BYTES) return null;
  const matches = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(ACCESS_TOKEN_COOKIE_NAME.length + 1);
  return token.length > 0 && token.length <= 8_192 && /^[A-Za-z0-9._-]+$/.test(token) ? token : null;
}

function verifyCsrfHeaders(headers: MasterRequest["headers"], trustedOrigins: ReadonlySet<string>) {
  const origin = singleHeader(headers.origin);
  const marker = singleHeader(headers["x-gms-csrf"]);
  const fetchSite = singleHeader(headers["sec-fetch-site"]);
  return origin !== undefined && trustedOrigins.has(origin) && marker === "1" && (fetchSite === undefined || fetchSite === "same-origin" || fetchSite === "same-site");
}

function singleHeader(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function isPermissionKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^([a-z0-9-]{1,64}):(VIEW|ADD|EDIT|DELETE|CANCEL|APPROVE|PRICE|PRINT|EXCEL)$/.exec(value);
  return match !== null;
}

function unauthenticated() { return new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" }); }
function authorizationUnavailable() { return new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" }); }
