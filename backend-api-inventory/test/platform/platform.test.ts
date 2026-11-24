import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadConfig, originList, postgresUrl } from "../../src/config";
import { AppError, errorBody, isDbUnavailable } from "../../src/platform/errors";
import { createLogger } from "../../src/platform/logger";
import { MasterApi } from "../../src/platform/master-api";
import { createMasterTransport, MasterRefusal, MasterUnavailable, mapReadError, readMasterToken } from "../../src/platform/master-client";
import { afterFailure, backoffSeconds, isBusinessRefusal, SyncDriver, type OpRow } from "../../src/platform/sync/saga";
import { JwksCache, parseJwks } from "../../src/platform/auth/jwks";
import { accessCookie, authenticate, canApprove, csrfAllowed, hasGrant, requireGrant, type AuthDeps, type Principal } from "../../src/platform/auth/principal";
import { createLicenseClient, readServiceToken } from "../../src/platform/auth/license-client";
import { NotificationHub } from "../../src/platform/notification/hub";
import { cleanSummary, decodeCursor, encodeCursor } from "../../src/platform/notification/store";

/** UT-LS-B04 (saga), UT-LS-B05 (master client), UT-LS-B06 (ported auth), config, errors, hub, notifications. */
const dir = mkdtempSync(join(tmpdir(), "gms-inv-unit-"));
const servers: Server[] = [];
afterAll(async () => {
  for (const server of servers) server.close();
  rmSync(dir, { recursive: true, force: true });
});
const logger = createLogger("silent");

async function server(handler: (method: string, url: string, body: string) => { status: number; body?: unknown }) {
  const calls: string[] = [];
  const instance = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    calls.push(`${request.method} ${request.url} ${request.headers.authorization === "Bearer master-token-0123456789012345678901234567890123" ? "auth" : "noauth"} ${request.headers["x-request-id"] ?? ""}`);
    const result = handler(request.method!, request.url!, Buffer.concat(chunks).toString());
    response.writeHead(result.status, { "content-type": "application/json" });
    response.end(result.body === undefined ? "" : JSON.stringify(result.body));
  });
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  servers.push(instance);
  return { url: `http://127.0.0.1:${(instance.address() as { port: number }).port}`, calls };
}
const TOKEN = "master-token-0123456789012345678901234567890123";

describe("UT-LS-B05 master client", () => {
  it("sends the service token and request id; reads retry once on 5xx; PUT never retries; refusals carry code + details", async () => {
    let first = true;
    const master = await server((method, url) => {
      if (url === "/internal/v1/inventory/reference") {
        if (first) { first = false; return { status: 503, body: { error: { code: "PARTNER_UNAVAILABLE" } } }; }
        return { status: 200, body: { companyCurrency: "THB", stone: {}, locations: ["Safe A"] } };
      }
      if (method === "PUT") return { status: 503 };
      return { status: 409, body: { error: { code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", details: { lines: [] } } } };
    });
    const api = new MasterApi(createMasterTransport(master.url, TOKEN, logger));
    expect((await api.reference({ requestId: "req-12345678" })).locations).toEqual(["Safe A"]);
    expect(master.calls.slice(0, 2)).toEqual(["GET /internal/v1/inventory/reference auth req-12345678", "GET /internal/v1/inventory/reference auth req-12345678"]);
    expect(await api.companyCurrency()).toBe("THB");
    expect(master.calls).toHaveLength(2); // the 60 s copy
    await expect(api.putAllocation("0193a000-0000-7000-8000-000000000001", 1, { vendorId: "v", lines: [], newStockIdCount: 0 })).rejects.toBeInstanceOf(MasterUnavailable);
    expect(master.calls.filter((call) => call.startsWith("PUT"))).toHaveLength(1);
    const refusal = await api.getAllocation("x").catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(MasterRefusal);
    expect(refusal).toMatchObject({ status: 409, code: "LOAD_ALLOCATION_EXCEEDS_REMAINING", details: { lines: [] } });
  });

  it("401/403 is a configuration fault (500, never user auth); a closed port is MASTER_UNAVAILABLE on reads; no token → 500", async () => {
    const master = await server(() => ({ status: 401, body: {} }));
    const api = new MasterApi(createMasterTransport(master.url, TOKEN, logger));
    await expect(api.reference()).rejects.toMatchObject({ status: 500, code: "INTERNAL_ERROR" });
    const closed = new MasterApi(createMasterTransport("http://127.0.0.1:1", TOKEN, logger));
    await expect(closed.reference()).rejects.toMatchObject({ status: 503, code: "MASTER_UNAVAILABLE" });
    const noToken = new MasterApi(createMasterTransport(master.url, null, logger));
    await expect(noToken.reference()).rejects.toMatchObject({ status: 500 });
    expect(mapReadError(new MasterRefusal(404, "NOT_FOUND", undefined))).toMatchObject({ status: 404 });
    expect(mapReadError(new MasterRefusal(400, "VALIDATION_ERROR", undefined))).toMatchObject({ status: 500 });
  });

  it("token file: ≥ 43 printable characters, trailing newline trimmed", () => {
    const file = join(dir, "t1");
    writeFileSync(file, `${TOKEN}\n`);
    expect(readMasterToken(file)).toBe(TOKEN);
    writeFileSync(file, "short");
    expect(readMasterToken(file)).toBeNull();
    expect(readMasterToken(undefined)).toBeNull();
  });
});

describe("UT-LS-B04 saga", () => {
  it("backoff min(2^n, 60) s; STUCK after 10 attempts; only 409 EXCEEDS / 422 UNAVAILABLE are business refusals", () => {
    expect([0, 1, 5, 6, 9].map(backoffSeconds)).toEqual([1, 2, 32, 60, 60]);
    expect(afterFailure(0)).toEqual({ attempts: 1, state: "PREPARED", delaySeconds: 2 });
    expect(afterFailure(9)).toMatchObject({ attempts: 10, state: "STUCK" });
    expect(isBusinessRefusal(new MasterRefusal(409, "LOAD_ALLOCATION_EXCEEDS_REMAINING", undefined))).toBe(true);
    expect(isBusinessRefusal(new MasterRefusal(422, "LOAD_ALLOCATION_LINE_UNAVAILABLE", undefined))).toBe(true);
    expect(isBusinessRefusal(new MasterRefusal(409, "LOAD_ALLOCATION_STALE", undefined))).toBe(false);
    expect(isBusinessRefusal(new MasterUnavailable("timeout"))).toBe(false);
  });

  const op: OpRow = { id: "op", load_id: "load", revision: 2, kind: "UPDATE", state: "PREPARED", payload: { allocation: { vendorId: "v", lines: [], newStockIdCount: 0 }, actor: { id: "u", name: null } }, attempts: 3, created_by: "u" };
  const fakeDb = () => {
    const statements: string[] = [];
    const tx = { $executeRaw: vi.fn(async (strings: TemplateStringsArray) => { statements.push(strings.join("?")); return 1; }) };
    return { statements, db: { ...tx, $queryRaw: vi.fn(), $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) } };
  };
  const driver = (db: unknown, master: Partial<MasterApi>, handlers: Partial<ConstructorParameters<typeof SyncDriver>[3]> = {}) =>
    new SyncDriver(db as never, master as MasterApi, logger, { apply: vi.fn(async () => ({ ok: true })), refuse: vi.fn(async () => undefined), mapRefusal: () => new AppError(409, "LOAD_TO_STOCK_EXCEEDS_REMAINING"), ...handlers } as never);

  it("PREPARED → master OK → tx1 DONE + apply; timeout keeps PREPARED with attempts + 1; refusal → DONE + refuse; stale → reconcile via GET", async () => {
    const ok = fakeDb();
    const apply = vi.fn(async () => ({ ok: true }));
    expect(await driver(ok.db, { putAllocation: async () => ({ revision: 2, stockIds: ["810001"], lines: [], replayed: false }) }, { apply }).drive(op)).toEqual({ outcome: "DONE", result: { ok: true } });
    expect(ok.statements[0]).toContain(`SET "state" = 'DONE'`);
    expect(apply).toHaveBeenCalledWith(expect.anything(), op, { revision: 2, stockIds: ["810001"], lines: [], replayed: false });

    const down = fakeDb();
    expect(await driver(down.db, { putAllocation: async () => { throw new MasterUnavailable("timeout"); } }).drive(op)).toEqual({ outcome: "PENDING" });
    expect(down.statements[0]).toContain(`"attempts" = ?::smallint`);

    const refused = fakeDb();
    const refuse = vi.fn(async () => undefined);
    const outcome = await driver(refused.db, { putAllocation: async () => { throw new MasterRefusal(409, "LOAD_ALLOCATION_EXCEEDS_REMAINING", {}); } }, { refuse }).drive(op);
    expect(outcome).toMatchObject({ outcome: "REFUSED", error: { code: "LOAD_TO_STOCK_EXCEEDS_REMAINING" } });
    expect(refuse).toHaveBeenCalledOnce();

    const stale = fakeDb();
    const reconciled = await driver(stale.db, { putAllocation: async () => { throw new MasterRefusal(409, "LOAD_ALLOCATION_STALE", {}); }, getAllocation: async () => ({ revision: 2, lines: [], stockIds: ["810009"] }) }, { apply }).drive(op);
    expect(reconciled.outcome).toBe("DONE");
    const lost = fakeDb();
    expect(await driver(lost.db, { putAllocation: async () => { throw new MasterRefusal(409, "LOAD_ALLOCATION_STALE", {}); }, getAllocation: async () => ({ revision: 1, lines: [], stockIds: [] }) }).drive(op)).toEqual({ outcome: "PENDING" });
    expect(lost.statements[0]).toContain(`"state" = 'STUCK'`);
  });

  it("tx1 finds the op already finished by another driver → BUSY, nothing applied twice", async () => {
    const db = { $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn({ $executeRaw: async () => 0 })), $executeRaw: vi.fn(), $queryRaw: vi.fn() };
    const apply = vi.fn();
    expect(await driver(db, { putAllocation: async () => ({ revision: 2, stockIds: [], lines: [], replayed: true }) }, { apply }).drive(op)).toEqual({ outcome: "BUSY" });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("UT-LS-B06 ported auth", () => {
  it("cookie parsing, CSRF origin rules, grants, canApprove (APPROVE + VIEW), Super Admin", () => {
    expect(accessCookie("a=b; gms_access=abc.def-ghi")).toBe("abc.def-ghi");
    expect(accessCookie("gms_access=a; gms_access=b")).toBeNull();
    expect(accessCookie(`gms_access=${"a".repeat(9000)}`)).toBeNull();
    const trusted = new Set(["https://gms.test"]);
    expect(csrfAllowed({ origin: "https://gms.test" }, trusted)).toBe(true);
    expect(csrfAllowed({ origin: "https://evil.test" }, trusted)).toBe(false);
    expect(csrfAllowed({ secFetchSite: "same-origin" }, trusted)).toBe(true);
    expect(csrfAllowed({}, trusted)).toBe(false);
    expect(csrfAllowed({ origin: "https://gms.test", secFetchSite: "cross-site" }, trusted)).toBe(false);
    const viewer = { isSuperAdmin: false, grants: new Set(["load-to-stock:VIEW", "load-to-stock:APPROVE"]) };
    expect(canApprove(viewer, "load-to-stock")).toBe(true);
    expect(canApprove({ ...viewer, grants: new Set(["load-to-stock:APPROVE"]) }, "load-to-stock")).toBe(false);
    expect(hasGrant({ isSuperAdmin: true, grants: new Set() }, "load-to-stock", "DELETE")).toBe(true);
    expect(() => requireGrant({ ...viewer, userId: "u", sessionId: "s", displayName: null, accessExpiresAt: null } as Principal, "load-to-stock", "ADD", "EDIT")).toThrow(AppError);
  });

  it("JWKS: ≤ 2 Ed25519 public keys only; unknown kid refreshes at most once per second; fetch failure → 503", async () => {
    const { publicKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    const key = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA", use: "sig" };
    expect(parseJwks({ keys: [key] })).toHaveLength(1);
    expect(parseJwks({ keys: [key, { ...key, kid: "k2" }, { ...key, kid: "k3" }] })).toBeNull();
    expect(parseJwks({ keys: [{ ...key, d: "secret" }] })).toBeNull();
    let fetches = 0;
    let now = 1_000_000;
    const cache = new JwksCache(new URL("https://auth.test/jwks"), (async () => { fetches += 1; return new Response(JSON.stringify({ keys: [key] })); }) as typeof fetch, () => now);
    expect((await cache.key("k1")).kid).toBe("k1");
    await expect(cache.key("unknown")).rejects.toMatchObject({ status: 401 });
    await expect(cache.key("unknown")).rejects.toMatchObject({ status: 401 });
    expect(fetches).toBe(1);
    now += 1_500;
    await expect(cache.key("unknown")).rejects.toMatchObject({ status: 401 });
    expect(fetches).toBe(2);
    const broken = new JwksCache(new URL("https://auth.test/jwks"), (async () => { throw new Error("down"); }) as typeof fetch);
    await expect(broken.key("k1")).rejects.toMatchObject({ status: 503 });
  });

  it("authenticate: valid token + live row + license → principal; bad issuer / expired session / inactive / license → 401 / 403 / 503", async () => {
    const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
    const key = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA", use: "sig" };
    const jwks = new JwksCache(new URL("https://auth.test/jwks"), (async () => new Response(JSON.stringify({ keys: [key] }))) as typeof fetch);
    const sign = (issuer = "https://auth.test") => new SignJWT({ sid: "s1" }).setProtectedHeader({ alg: "EdDSA", kid: "k1" }).setSubject("u1").setIssuer(issuer).setAudience("gms-domain-api").setExpirationTime("5m").sign(privateKey);
    const row = { session_id: "s1", user_id: "u1", session_expires_at: new Date(Date.now() + 60_000), account_active: true, account_role: "user", permissions: ["load-to-stock:VIEW"], user_name: "  Mint  " };
    const deps = (patch: Partial<AuthDeps> = {}): AuthDeps => ({ issuer: "https://auth.test", jwks, readAuthorization: async () => row, checkLicense: async () => "ELIGIBLE", ...patch });
    const principal = await authenticate(`gms_access=${await sign()}`, deps());
    expect(principal).toMatchObject({ userId: "u1", sessionId: "s1", isSuperAdmin: false, displayName: "Mint" });
    await expect(authenticate(undefined, deps())).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(`gms_access=${await sign("https://other")}`, deps())).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ readAuthorization: async () => ({ ...row, account_active: false }) }))).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ readAuthorization: async () => ({ ...row, session_expires_at: new Date(Date.now() - 1) }) }))).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ readAuthorization: async () => ({ ...row, permissions: ["bad key"] }) }))).rejects.toMatchObject({ status: 503 });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ readAuthorization: async () => { throw new Error("db"); } }))).rejects.toMatchObject({ status: 503, code: "AUTH_UNAVAILABLE" });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ checkLicense: async () => "DENIED" }))).rejects.toMatchObject({ status: 403, code: "LICENSE_DENIED" });
    await expect(authenticate(`gms_access=${await sign()}`, deps({ checkLicense: async () => "UNAVAILABLE" }))).rejects.toMatchObject({ status: 503 });
  });

  it("license client: inventory token file, ELIGIBLE / DENIED / UNAUTHENTICATED / UNAVAILABLE mapping", async () => {
    const token = randomBytes(32).toString("base64url");
    const file = join(dir, "auth-token");
    writeFileSync(file, `${token}\n`);
    expect(await readServiceToken(file)).toBe(token);
    let status = 200;
    const auth = await server(() => ({ status, body: status === 200 ? { decision: "ELIGIBLE", status: "VALID", checkedAt: new Date().toISOString(), fallbackUntil: null } : {} }));
    const check = createLicenseClient(auth.url, file);
    expect(await check("u", "s")).toBe("ELIGIBLE");
    expect(auth.calls[0]).toContain("POST /internal/v1/license/current");
    status = 403;
    expect(await check("u", "s")).toBe("DENIED");
    status = 401;
    expect(await check("u", "s")).toBe("UNAUTHENTICATED");
    status = 500;
    expect(await check("u", "s")).toBe("UNAVAILABLE");
    expect(await createLicenseClient(auth.url, join(dir, "missing"))("u", "s")).toBe("UNAVAILABLE");
  });

  it("license client (dev crash 2026-11-17): an unread 401/403/500 body is cancelled and the deadline timer never aborts a finished call", async () => {
    vi.useFakeTimers();
    try {
      const token = randomBytes(32).toString("base64url");
      const file = join(dir, "auth-token-2");
      writeFileSync(file, token);
      for (const status of [401, 403, 500]) {
        let cancelled = false;
        let signal: AbortSignal | undefined;
        const fetcher = (async (_url: unknown, init?: RequestInit) => {
          signal = init?.signal ?? undefined;
          const body = new ReadableStream<Uint8Array>({ pull: () => undefined, cancel: () => { cancelled = true; } });
          return new Response(body, { status });
        }) as typeof fetch;
        await createLicenseClient("http://auth.test", file, fetcher)("u", "s");
        expect(cancelled).toBe(true);
        await vi.advanceTimersByTimeAsync(5_000);
        expect(signal?.aborted).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("config, errors, hub, notifications", () => {
  const env = {
    INVENTORY_DATABASE_URL: "postgresql://app:pw@db:5432/f1_system?schema=inventory", INVENTORY_AUTHZ_DATABASE_URL: "postgresql://reader:pw@db:5432/f1_system",
    AUTH_SERVICE_URL: "http://backend-api-auth:3101", AUTH_ACCESS_JWT_ISSUER: "https://auth", FRONTEND_URL: "http://localhost:3000", MASTER_INTERNAL_URL: "http://api-master:3201",
  };
  it("refuses to start without the required settings; strips ?schema; port 3301 by default", () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({ port: 3301, databaseUrl: "postgresql://app:pw@db:5432/f1_system", masterInternalUrl: "http://api-master:3201" });
    expect(() => loadConfig({ ...env, INVENTORY_DATABASE_URL: "" })).toThrow(/INVENTORY_DATABASE_URL/);
    expect(() => loadConfig({ ...env, MASTER_INTERNAL_URL: "ftp://x" })).toThrow();
    expect(() => postgresUrl({ X: "mysql://a:b@c/d" }, "X")).toThrow();
    expect(originList("https://a.test, http://b.test:8080/")).toEqual(["https://a.test", "http://b.test:8080"]);
  });
  it("error envelope has a fixed message and request id; DB connection errors map to unavailable", () => {
    expect(errorBody("LOAD_TO_STOCK_BUSY", "r1", { retryAfterSeconds: 5 })).toEqual({ error: { code: "LOAD_TO_STOCK_BUSY", message: "Saving in progress", requestId: "r1", details: { retryAfterSeconds: 5 } } });
    for (const code of ["STOCK_ADJUSTMENT_NOT_FOUND", "STOCK_ADJUSTMENT_STOCK_CHANGED", "STOCK_ADJUSTMENT_IN_USE", "STOCK_ADJUSTMENT_STATUS", "STOCK_ADJUSTMENT_LINE_UNAVAILABLE", "STOCK_ADJUSTMENT_REVISE_LIMIT", "LOCATION_INVALID", "NUMBERING_NOT_CONFIGURED", "VERSION_CONFLICT"]) {
      expect(errorBody(code, "r2").error.message).not.toBe("The request could not be completed");
    }
    expect(isDbUnavailable({ code: "P1001" })).toBe(true);
    expect(isDbUnavailable({ cause: { code: "ECONNREFUSED" } })).toBe(true);
    expect(isDbUnavailable({ code: "P2002" })).toBe(false);
  });
  it("hub: ≤ 3 streams per user (oldest closed), process cap, ids-only pushes to recipients", () => {
    const hub = new NotificationHub(3, 4);
    const closed: number[] = [];
    const pushed: unknown[] = [];
    const unregister = [0, 1, 2, 3].map((index) => hub.open({ userId: "a", push: (event) => pushed.push(event), close: () => closed.push(index) }));
    expect(closed).toEqual([0]);
    expect(hub.size).toBe(3);
    hub.open({ userId: "b", push: () => undefined, close: () => undefined });
    expect(hub.isFull()).toBe(true);
    expect(hub.open({ userId: "c", push: () => undefined, close: () => undefined })).toBeNull();
    hub.emit([{ eventId: "e1", type: "document.approved", documentType: "load-to-stock", recipients: ["a"] }]);
    expect(pushed).toHaveLength(3);
    expect(pushed[0]).toEqual({ id: "e1", type: "document.approved", documentType: "load-to-stock" });
    unregister[1]!();
    expect(hub.size).toBe(3);
  });
  it("notification summary is clipped to ≤ 960 bytes; cursors round-trip and refuse tampering", () => {
    const summary = cleanSummary({ partyName: "ก".repeat(400), reason: "ข".repeat(400) });
    expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThanOrEqual(960);
    const at = new Date("2026-11-17T00:00:00.000Z");
    expect(decodeCursor(encodeCursor(at, "0193a000-0000-7000-8000-000000000001"))).toEqual({ createdAt: at, id: "0193a000-0000-7000-8000-000000000001" });
    expect(() => decodeCursor("bad")).toThrow();
  });
});
