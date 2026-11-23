/* eslint-disable @typescript-eslint/no-explicit-any -- api-master modules are loaded untyped (separate tsconfig with decorators) */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { createApp } from "../../src/app";
import type { ReportGuard } from "../../src/modules/reports/stock-card/guard";
import { createDb, type Db } from "../../src/platform/db";
import { createLogger } from "../../src/platform/logger";
import { MasterApi } from "../../src/platform/master-api";
import { createMasterTransport } from "../../src/platform/master-client";
import { JwksCache } from "../../src/platform/auth/jwks";
import type { AuthorizationRow, LicenseState } from "../../src/platform/auth/principal";

/**
 * Integration harness (load-to-stock testing.md): a disposable PostgreSQL with both schemas migrated, the REAL master
 * internal API (api-master's Nest controller + services, bound to a port, its own token) and the inventory Hono app
 * over that master. JWTs are signed with a test Ed25519 key served through the JWKS cache; the live authorization row
 * and the license decision come from in-memory tables the tests control (the real authz DB reader is covered by
 * authz-db.db.integration.test.ts).
 */
export const testUrl = process.env.INVENTORY_TEST_DATABASE_URL;
export const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
export const ISSUER = "https://auth.test.local";
export const ORIGIN = "https://gms.test.local";

type MasterHandle = { url: string; close(): Promise<void>; prisma: MasterPrisma; services: MasterServices };
type MasterPrisma = any;
type MasterServices = { purchase: any; internal: any; setApproval(type: "purchase", on: boolean): Promise<void> };

/** Loads an api-master module without type-checking it here (the master workspace typechecks itself). */
export function masterModule(relative: string): Promise<any> {
  const path = resolve(__dirname, "../../../backend-api-master", relative);
  return import(/* @vite-ignore */ path);
}

const masterRequests: string[] = [];
export function masterCalls() { return masterRequests; }

export async function startMaster(token: string, storageRoot: string): Promise<MasterHandle> {
  process.env.PARTNER_DATABASE_URL = testUrl;
  process.env.PARTNER_SERVICE_TOKEN = `partner-${randomBytes(24).toString("base64url")}`;
  const tokenFile = join(storageRoot, "master-token");
  writeFileSync(tokenFile, token);
  process.env.INVENTORY_MASTER_SERVICE_TOKEN_FILE = tokenFile;
  process.env.GMS_STORAGE_ROOT = join(storageRoot, "master");
  const { prisma } = await masterModule("src/database/prisma-client");
  const { PurchaseService } = await masterModule("src/purchase/purchase.service");
  const { InventoryInternalService } = await masterModule("src/inventory-internal/inventory-internal.service");
  const { InventoryInternalController } = await masterModule("src/inventory-internal/inventory-internal.controller");
  const { InventoryServiceTokenGuard } = await masterModule("src/inventory-internal/inventory-token.guard");
  const { ServiceTokenGuard } = await masterModule("src/internal-auth/service-token.guard");
  const { EnvelopeExceptionFilter } = await masterModule("src/common/exception.filter");
  const nestCommon = await masterModule("node_modules/@nestjs/common");
  const nestCore = await masterModule("node_modules/@nestjs/core");
  const express = (await masterModule("node_modules/express")).default;
  const internal = new InventoryInternalService();
  internal.clock = () => new Date("2081-06-01T03:00:00Z");
  class TestModule {}
  nestCommon.Module({
    controllers: [InventoryInternalController],
    providers: [{ provide: InventoryInternalService, useValue: internal }, InventoryServiceTokenGuard, { provide: nestCore.APP_GUARD, useClass: ServiceTokenGuard }, { provide: nestCore.APP_FILTER, useClass: EnvelopeExceptionFilter }],
  })(TestModule);
  const app = await nestCore.NestFactory.create(TestModule, { bodyParser: false, logger: false });
  app.use((request: { method: string; url: string }, _response: unknown, next: () => void) => { masterRequests.push(`${request.method} ${request.url.split("?")[0]}`); next(); });
  app.use(express.json({ limit: "256kb" }));
  await app.listen(0, "127.0.0.1");
  const url = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  return {
    url,
    prisma,
    close: () => app.close(),
    services: {
      purchase: new PurchaseService(),
      internal,
      setApproval: async (type, on) => { await prisma.approvalSetting.update({ where: { type }, data: { requireApproval: on, version: { increment: 1 } } }); },
    },
  };
}

export type Harness = Awaited<ReturnType<typeof startHarness>>;

export async function startHarness(options: { stockCard?: { guard?: ReportGuard; statementTimeoutMs?: number } } = {}) {
  // FE-LOT-008: the master modules under test keep accepting item references (Vitest-only seam, see master test/setup.ts).
  process.env.LOT_TEST_ACCEPT_ITEM_REFS = "1";
  const dir = mkdtempSync(join(tmpdir(), "gms-inventory-it-"));
  const token = randomBytes(32).toString("base64url");
  const master = await startMaster(token, dir);
  const queries: string[] = [];
  let counting = false;
  // The service runs as gms_inventory_app when the provisioned role URL is given (proves its grants suffice); fixtures
  // and clean-up use the owner connection (the app role can't delete the append-only stock ledger).
  const appUrl = process.env.INVENTORY_APP_TEST_DATABASE_URL ?? testUrl!;
  const db: Db = createDb(appUrl, { onQuery: (sql) => { if (counting) queries.push(sql); } });
  const ownerDb: Db = createDb(testUrl!, { pool: { max: 2 } });
  const logger = createLogger("silent");
  const masterApi = new MasterApi(createMasterTransport(master.url, token, logger));

  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "EdDSA", use: "sig" };
  const jwks = new JwksCache(new URL("https://auth.test.local/api/auth/jwks"), (async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })) as typeof fetch);
  const sessions = new Map<string, AuthorizationRow>();
  const license = { state: "ELIGIBLE" as LicenseState, authzDown: false };
  const approverIds: string[] = [];
  const { app, service, hub, photos, saleService, salePhotos } = createApp({
    db, master: masterApi, logger, storageRoot: join(dir, "inventory"), trustedOrigins: new Set([ORIGIN]),
    approvers: async () => approverIds, stockCard: options.stockCard,
    auth: {
      issuer: ISSUER, jwks,
      readAuthorization: async (userId, sessionId) => {
        if (license.authzDown) throw new Error("down");
        const row = sessions.get(sessionId);
        return row && row.user_id === userId ? row : null;
      },
      checkLicense: async () => license.state,
    },
  });

  async function user(grants: string[], options: { admin?: boolean; name?: string } = {}) {
    const userId = `u-${randomUUID().slice(0, 12)}`;
    const sessionId = randomUUID();
    sessions.set(sessionId, { session_id: sessionId, user_id: userId, session_expires_at: new Date(Date.now() + 3_600_000), account_active: true, account_role: options.admin ? "admin" : "user", permissions: grants, user_name: options.name ?? userId });
    const jwt = await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "EdDSA", kid: "test-key" }).setSubject(userId).setIssuer(ISSUER).setAudience("gms-domain-api").setIssuedAt().setExpirationTime("15m").sign(privateKey);
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const init: RequestInit = { method, headers: { cookie: `gms_access=${jwt}`, origin: ORIGIN, ...(body !== undefined && !(body instanceof FormData) ? { "content-type": "application/json" } : {}), ...headers } };
      if (body !== undefined) init.body = body instanceof FormData ? body : JSON.stringify(body);
      const response = await app.request(`/api/inventory/v1${path}`, init);
      const text = response.headers.get("content-type")?.includes("json") ? await response.text() : "";
      return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, any>, response };
    };
    return { userId, sessionId, jwt, call };
  }

  async function measured<T>(run: () => Promise<T>) {
    queries.length = 0;
    masterRequests.length = 0;
    counting = true;
    try {
      const result = await run();
      return { result, queries: queries.filter((sql) => !/^\s*(BEGIN|COMMIT|ROLLBACK|SET TRANSACTION|SELECT 1|SELECT set_config)\b/i.test(sql)).length, master: [...masterRequests] };
    } finally {
      counting = false;
    }
  }

  return {
    dir, token, master, db, ownerDb, app, service, photos, saleService, salePhotos, hub, masterApi, sessions, license, approverIds, user, measured,
    async close() {
      await master.close();
      await db.$disconnect();
      await ownerDb.$disconnect();
      await master.prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Master fixtures: a vendor and auto-approved Purchases (approval OFF while saving) with MANUAL lines. */
export async function masterFixtures(harness: Harness, tag: string) {
  const prisma = harness.master.prisma;
  const vendors: string[] = [];
  const { ensureTestLocations } = await masterModule("test/partner-shared/locations");
  await ensureTestLocations(prisma);
  if (!(await prisma.currency.findUnique({ where: { code: "THB" } }))) await prisma.currency.create({ data: { code: "THB", name: "THB", createdBy: tag, updatedBy: tag } });
  if (!(await prisma.currency.findUnique({ where: { code: "USD" } }))) await prisma.currency.create({ data: { code: "USD", name: "USD", createdBy: tag, updatedBy: tag } });
  // Q-LS-23: the header currency is the Company Profile currency; the disposable database may have none yet.
  const createdProfile = !(await prisma.companyProfile.findUnique({ where: { id: 1 } }));
  if (createdProfile) {
    await prisma.companyProfile.create({ data: { id: 1, name: "IT Co.", contactName: "IT", phoneCountry: "TH", phoneE164: "+66800000000", email: "it@example.test", address: "1 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", currencyCode: "THB", updatedBy: tag } });
  }
  async function vendor(name: string) {
    const id = randomUUID();
    const addressId = randomUUID();
    const code = `INV${vendors.length}${tag.slice(-5)}`.toUpperCase();
    await prisma.vendor.create({ data: {
      id, name, nameKey: name.toLowerCase(), code, codeKey: code.toLowerCase(), currencyCode: "THB", firstName: "It", email: "inv-it@example.test", createdBy: tag, updatedBy: tag,
      addresses: { create: [{ id: addressId, position: 1, name: `${name} Co.`, address: "1 Rd", countryCode: "TH", state: "Bangkok", city: "Bangkok", postcode: "10500", isDefault: true }] },
    } });
    vendors.push(id);
    return { id, addressId };
  }
  const line = (patch: Record<string, unknown> = {}) => ({
    source: "MANUAL", stoneCodeId: null, stoneCode: "", stone: "Ruby", shape: "Oval", size: "", color: "Red", clarity: "", cutting: "", quality: "", lot: "LOT",
    location: "Safe A", cerType: "", cerNo: "", pcs: 10, weightCt: "5", priceUnit: "PER_CT", unitPrice: "1000", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [], ...patch,
  });
  async function purchase(v: { id: string; addressId: string }, lines: Record<string, unknown>[], patch: Record<string, unknown> = {}) {
    await harness.master.services.setApproval("purchase", false);
    const saved = await harness.master.services.purchase.create(tag, {
      docDate: "2026-11-04", dueDate: "2026-12-04", currency: "THB", exchangeRate: null, ref: "", documentNote: "", discount: { type: "NONE", value: "0" },
      tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null, vendorId: v.id, addressId: v.addressId, lines, ...patch,
    } as never);
    const rows: { id: string }[] = await prisma.purchaseLine.findMany({ where: { purchaseId: saved.id }, orderBy: { position: "asc" }, select: { id: true } });
    return { id: saved.id as string, docNo: saved.docNo as string, lineIds: rows.map((row) => row.id) };
  }
  /** Removes every inventory row of this suite's vendors, then their master allocations, Purchases and vendors. Stock IDs are never reused, so the counter is left alone. */
  async function cleanup(extraLoadIds: string[] = []) {
    const db = harness.ownerDb;
    const loads = (await db.load_to_stock.findMany({ where: { vendor_id: { in: vendors } }, select: { id: true } })).map((row) => row.id);
    const loadIds = [...new Set([...loads, ...extraLoadIds])];
    const stocks = (await db.stock.findMany({ where: { load_id: { in: loadIds } }, select: { id: true } })).map((row) => row.id);
    await db.stock_movement.deleteMany({ where: { stock_uuid: { in: stocks } } });
    await db.stock_photo.deleteMany({ where: { stock_uuid: { in: stocks } } });
    await db.stock_hold.deleteMany({ where: { stock_uuid: { in: stocks } } });
    await db.stock.deleteMany({ where: { id: { in: stocks } } });
    await db.load_to_stock.deleteMany({ where: { id: { in: loadIds } } });
    await prisma.loadStockId.deleteMany({ where: { loadDocumentId: { in: loadIds } } });
    await prisma.loadAllocation.deleteMany({ where: { loadDocumentId: { in: loadIds } } });
    await prisma.purchase.deleteMany({ where: { vendorId: { in: vendors } } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendors } } });
    await harness.master.services.setApproval("purchase", true);
    if (createdProfile) await prisma.companyProfile.deleteMany({ where: { id: 1, updatedBy: tag } });
  }
  return { vendor, line, purchase, cleanup, loaded: async (lineId: string) => {
    const row = await prisma.purchaseLine.findUniqueOrThrow({ where: { id: lineId }, select: { loadedPcs: true, loadedWeightCt: true } });
    return [row.loadedPcs, row.loadedWeightCt.toFixed(3)];
  } };
}
