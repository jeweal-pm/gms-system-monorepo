import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterAuthContextAdapter, MasterJwksCache } from "../../src/master/auth-context";
import { createMasterRouter } from "../../src/master/router";
import type { QuotationService } from "../../src/quotation/quotation.service";
import type { MemoOutService } from "../../src/trade-document/memo-out.service";
import type { MemoOutReturnService } from "../../src/trade-document/memo-out-return.service";
import type { MemoReceiveService } from "../../src/trade-document/memo-receive.service";
import type { MemoStockService } from "../../src/trade-document/memo-stock.service";
import type { DocumentSetupService } from "../../src/document-setup/document-setup.service";
import type { CustomerService } from "../../src/customer/customer.service";
import type { VendorService } from "../../src/vendor/vendor.service";
import type { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import type { StoneMasterService } from "../../src/stone-master/stone-master.service";
import type { CurrencyService } from "../../src/currency/currency.service";
import { customerBody } from "../partner-shared/fixtures";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = { ...(publicKey.export({ format: "jwk" }) as JWK), kid: "http-test", alg: "EdDSA", use: "sig" };
const issuer = "http://auth.local";
const origin = "http://localhost:3000";
const serverSet: Server[] = [];

async function startHttp(authReader = vi.fn(async () => ({
  session_id: "sid-1", user_id: "user-1", session_expires_at: new Date("2027-02-01T00:00:00Z"),
  account_active: true, account_role: "user", permissions: ["customer:VIEW", "customer:ADD", "company-profile:VIEW", "stone-master:VIEW"], location_keys: [],
})), licenseState: "ELIGIBLE" | "DENIED" | "UNAVAILABLE" | "UNAUTHENTICATED" = "ELIGIBLE") {
  const now = new Date(1_800_000_050_000);
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 }));
  const jwks = new MasterJwksCache(new URL("http://auth.local/api/auth/jwks"), fetcher as typeof fetch, () => now.getTime());
  const checkLicense = vi.fn(async () => licenseState);
  const adapter = new MasterAuthContextAdapter({
    issuer, trustedOrigin: origin, jwks, authorizationReader: authReader,
    checkLicense, now: () => now,
  });
  const customer = {
    list: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })),
    create: vi.fn(async () => ({ id: "customer-1", code: "C001" })),
    get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  const vendor = {
    list: vi.fn(), create: vi.fn(async () => ({ id: "vendor-1", code: "V001" })),
    get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), update: vi.fn(), delete: vi.fn(),
  };
  const companyProfile = { get: vi.fn(async () => ({ profile: null })), options: vi.fn(), save: vi.fn(), removeLogo: vi.fn() };
  const stoneMaster = { list: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const router = createMasterRouter({
    customer: customer as unknown as CustomerService,
    vendor: vendor as unknown as VendorService,
    companyProfile: companyProfile as unknown as CompanyProfileService,
    stoneMaster: stoneMaster as unknown as StoneMasterService,
    documentSetup: { list: vi.fn(), get: vi.fn(), save: vi.fn() } as unknown as DocumentSetupService,
    currency: { list: vi.fn(), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as CurrencyService,
    quotation: {} as unknown as QuotationService,
    memoOut: {} as unknown as MemoOutService,
    memoOutReturn: {} as unknown as MemoOutReturnService,
    memoReceive: {} as unknown as MemoReceiveService,
    memoStock: {} as unknown as MemoStockService,
  });
  const handler = createHTTPHandler({ router, createContext: ({ req }) => adapter.create(req) });
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverSet.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not bind");
  const token = await new SignJWT({ sid: "sid-1" }).setProtectedHeader({ alg: "EdDSA", kid: "http-test" })
    .setIssuer(issuer).setAudience("gms-domain-api").setSubject("user-1")
    .setIssuedAt(1_800_000_000).setNotBefore(1_800_000_000).setExpirationTime(1_800_000_900).sign(privateKey);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { baseUrl, url: `${baseUrl}/customer.list?input=${encodeURIComponent(JSON.stringify({ limit: 25 }))}`, token, customer, vendor, companyProfile, stoneMaster, authReader, checkLicense, fetcher };
}

afterEach(async () => {
  await Promise.all(serverSet.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  vi.restoreAllMocks();
});

describe("master HTTP/tRPC adapter integration", () => {
  it("IT-GPMT-01 sends a verified request through JWT, live authorization, license and router grant", async () => {
    const app = await startHttp();
    const response = await fetch(app.url, { headers: { cookie: `gms_access=${app.token}` } });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(JSON.parse(body) as unknown).toMatchObject({ result: { data: { items: [], total: 0 } } });
    expect(app.authReader).toHaveBeenCalledWith("user-1", "sid-1");
    expect(app.customer.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 25 }));
  });

  it("IT-GPMT-01 serves companyProfile and stoneMaster via authenticated domain tRPC routes", async () => {
    const app = await startHttp();
    const profile = await fetch(`${app.baseUrl}/companyProfile.get`, { headers: { cookie: `gms_access=${app.token}` } });
    expect(profile.status).toBe(200);
    expect(await profile.json()).toMatchObject({ result: { data: { profile: null } } });
    expect(app.companyProfile.get).toHaveBeenCalledOnce();

    const stone = await fetch(`${app.baseUrl}/stoneMaster.group.list?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`, { headers: { cookie: `gms_access=${app.token}` } });
    expect(stone.status).toBe(200);
    expect(await stone.json()).toMatchObject({ result: { data: { items: [], nextCursor: null, total: 0 } } });
    expect(app.stoneMaster.list).toHaveBeenCalledWith("group", expect.objectContaining({ limit: 10 }));
  });

  it("IT-GPMT-02 denies a stale grant or unavailable license before domain access", async () => {
    const noGrant = await startHttp(vi.fn(async () => ({
      session_id: "sid-1", user_id: "user-1", session_expires_at: new Date("2027-02-01T00:00:00Z"),
      account_active: true, account_role: "user", permissions: [], location_keys: [],
    })));
    const denied = await fetch(noGrant.url, { headers: { cookie: `gms_access=${noGrant.token}` } });
    expect(denied.status).toBe(403);
    expect(noGrant.customer.list).not.toHaveBeenCalled();

    const noLicense = await startHttp(undefined, "UNAVAILABLE");
    const unavailable = await fetch(noLicense.url, { headers: { cookie: `gms_access=${noLicense.token}` } });
    expect(unavailable.status).toBe(503);
    expect(noLicense.customer.list).not.toHaveBeenCalled();

    const staleAuthSession = await startHttp(undefined, "UNAUTHENTICATED");
    const invalidContext = await fetch(staleAuthSession.url, { headers: { cookie: `gms_access=${staleAuthSession.token}` } });
    expect(invalidContext.status).toBe(401);
    expect(staleAuthSession.customer.list).not.toHaveBeenCalled();
  });

  it("IT-MAUTH-03 rejects bad mutation CSRF before JWKS, auth view, license, or customer/vendor services", async () => {
    const cases: Array<Record<string, string>> = [
      {},
      { origin: "http://evil.local", "x-gms-csrf": "1" },
      { origin },
      { origin, "x-gms-csrf": "1", "sec-fetch-site": "cross-site" },
    ];
    for (const csrfHeaders of cases) {
      const app = await startHttp();
      const response = await fetch(`${app.baseUrl}/customer.create`, {
        method: "POST",
        headers: { cookie: `gms_access=${app.token}`, "content-type": "application/json", ...csrfHeaders },
        body: JSON.stringify(customerBody()),
      });
      expect(response.status).toBe(403);
      expect(app.fetcher).not.toHaveBeenCalled();
      expect(app.authReader).not.toHaveBeenCalled();
      expect(app.checkLicense).not.toHaveBeenCalled();
      expect(app.customer.create).not.toHaveBeenCalled();
      expect(app.vendor.create).not.toHaveBeenCalled();
    }
  });

  it("IT-MAUTH-03 permits a valid same-origin mutation only after every auth gate", async () => {
    const app = await startHttp();
    const response = await fetch(`${app.baseUrl}/customer.create`, {
      method: "POST",
      headers: { cookie: `gms_access=${app.token}`, origin, "x-gms-csrf": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify(customerBody()),
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(JSON.parse(body) as unknown).toMatchObject({ result: { data: { id: "customer-1", code: "C001" } } });
    expect(app.fetcher).toHaveBeenCalledOnce();
    expect(app.authReader).toHaveBeenCalledWith("user-1", "sid-1");
    expect(app.checkLicense).toHaveBeenCalledWith("user-1", "sid-1");
    expect(app.customer.create).toHaveBeenCalledOnce();
    expect(app.vendor.create).not.toHaveBeenCalled();
  });
});
