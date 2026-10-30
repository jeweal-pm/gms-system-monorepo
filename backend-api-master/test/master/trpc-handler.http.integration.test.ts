import express from "express";
import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { SignJWT, type JWK } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterTrpcHandler } from "../../src/master/trpc-handler";
import type { QuotationService } from "../../src/quotation/quotation.service";
import type { MemoOutService } from "../../src/trade-document/memo-out.service";
import type { MemoOutReturnService } from "../../src/trade-document/memo-out-return.service";
import type { MemoReceiveService } from "../../src/trade-document/memo-receive.service";
import type { MemoStockService } from "../../src/trade-document/memo-stock.service";
import type { MemoOutstandingService } from "../../src/trade-document/memo-outstanding.service";
import type { DocumentSetupService } from "../../src/document-setup/document-setup.service";
import type { CustomerService } from "../../src/customer/customer.service";
import type { VendorService } from "../../src/vendor/vendor.service";
import type { CompanyProfileService } from "../../src/company-profile/company-profile.service";
import type { StoneMasterService } from "../../src/stone-master/stone-master.service";
import type { CurrencyService } from "../../src/currency/currency.service";
import type { MasterAuthzDatabase } from "../../src/master/authz-database";
import type { MasterLicenseClient } from "../../src/master/license-client";
import { customerBody } from "../partner-shared/fixtures";

const servers: Server[] = [];
const previous = new Map(["AUTH_ACCESS_JWT_ISSUER", "AUTH_SERVICE_URL", "FRONTEND_URL"].map((key) => [key, process.env[key]] as const));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe("IT-MAUTH-07 mounted Express tRPC adapter", () => {
  it("parses a body before the mounted handler and reaches the domain service only after all guards", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const jwk = { ...(publicKey.export({ format: "jwk" }) as JWK), kid: "mounted-test", alg: "EdDSA", use: "sig" };
    const issuer = "http://auth.test";
    process.env.AUTH_ACCESS_JWT_ISSUER = issuer;
    process.env.FRONTEND_URL = "http://localhost:3000";
    const authServer = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => authServer.listen(0, "127.0.0.1", resolve));
    servers.push(authServer);
    const authAddress = authServer.address();
    if (!authAddress || typeof authAddress === "string") throw new Error("test JWKS server did not bind");
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${authAddress.port}`;

    const customer = {
      list: vi.fn(), create: vi.fn(async () => ({ id: "customer-1", code: "C001" })),
      get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), update: vi.fn(), delete: vi.fn(),
    } as unknown as CustomerService;
    const vendor = { list: vi.fn(), create: vi.fn(), get: vi.fn(), options: vi.fn(), nextCode: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as VendorService;
    const companyProfile = { get: vi.fn(async () => ({ profile: null })), options: vi.fn(), save: vi.fn(), removeLogo: vi.fn() } as unknown as CompanyProfileService;
    const stoneMaster = { list: vi.fn(async () => ({ items: [], nextCursor: null, total: 0 })), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as StoneMasterService;
    const authz = { read: vi.fn(async () => ({
      session_id: "sid-1", user_id: "user-1", session_expires_at: new Date(Date.now() + 60_000), account_active: true,
      account_role: "user", permissions: ["customer:ADD", "company-profile:VIEW", "stone-master:VIEW"], location_keys: [],
    })) } as unknown as MasterAuthzDatabase;
    const license = { check: vi.fn(async () => "ELIGIBLE" as const) } as unknown as MasterLicenseClient;
    const documentSetup = { list: vi.fn(), get: vi.fn(), save: vi.fn() } as unknown as DocumentSetupService;
    const currency = { list: vi.fn(), get: vi.fn(), options: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() } as unknown as CurrencyService;
    const handler = new MasterTrpcHandler(customer, vendor, companyProfile, stoneMaster, authz, license, documentSetup, currency, {} as unknown as QuotationService, {} as unknown as MemoOutService, {} as unknown as MemoOutReturnService, {} as unknown as MemoReceiveService, {} as unknown as MemoStockService, {} as unknown as MemoOutstandingService);
    const app = express();
    app.use(express.json({ limit: "256kb" }));
    app.use("/api/master/trpc", handler.handle.bind(handler));
    const server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test master server did not bind");
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sid: "sid-1" }).setProtectedHeader({ alg: "EdDSA", kid: "mounted-test" })
      .setIssuer(issuer).setAudience("gms-domain-api").setSubject("user-1").setIssuedAt(now).setExpirationTime(now + 600).sign(privateKey);

    const response = await fetch(`http://127.0.0.1:${address.port}/api/master/trpc/customer.create`, {
      method: "POST",
      headers: { cookie: `gms_access=${token}`, origin: "http://localhost:3000", "x-gms-csrf": "1", "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify(customerBody()),
    });
    const body = await response.text();
    expect(response.status, body).toBe(200);
    expect(JSON.parse(body) as unknown).toMatchObject({ result: { data: { id: "customer-1", code: "C001" } } });
    expect(authz.read).toHaveBeenCalledWith("user-1", "sid-1");
    expect(license.check).toHaveBeenCalledWith("user-1", "sid-1");
    expect(customer.create).toHaveBeenCalledOnce();

    const profileResponse = await fetch(`http://127.0.0.1:${address.port}/api/master/trpc/companyProfile.get`, {
      headers: { cookie: `gms_access=${token}` },
    });
    expect(profileResponse.status).toBe(200);
    expect(await profileResponse.json()).toMatchObject({ result: { data: { profile: null } } });
    expect(companyProfile.get).toHaveBeenCalledOnce();

    const stonesResponse = await fetch(`http://127.0.0.1:${address.port}/api/master/trpc/stoneMaster.group.list?input=${encodeURIComponent(JSON.stringify({ limit: 10 }))}`, {
      headers: { cookie: `gms_access=${token}` },
    });
    expect(stonesResponse.status).toBe(200);
    expect(await stonesResponse.json()).toMatchObject({ result: { data: { items: [], nextCursor: null, total: 0 } } });
    expect(stoneMaster.list).toHaveBeenCalledWith("group", { limit: 10 });
  });
});
