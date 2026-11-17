import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterLicenseController } from "../../src/license/master-license.controller";
import { LicenseService } from "../../src/license/license.service";
import { prisma } from "../../src/database/prisma-client";

const originalTokenFile = process.env.MASTER_AUTH_SERVICE_TOKEN_FILE;
const originalInventoryTokenFile = process.env.INVENTORY_AUTH_SERVICE_TOKEN_FILE;
const servers: Server[] = [];
const dirs: string[] = [];

async function start(options: { master?: boolean; inventory?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "gms-master-license-"));
  dirs.push(dir);
  const token = randomBytes(32).toString("base64url");
  const tokenFile = join(dir, "service-token");
  await writeFile(tokenFile, `${token}\n`, { mode: 0o600 });
  if (options.master === false) delete process.env.MASTER_AUTH_SERVICE_TOKEN_FILE;
  else process.env.MASTER_AUTH_SERVICE_TOKEN_FILE = tokenFile;
  // BE-LS-001 (ADR-0052): backend-api-inventory has its own token file for the same endpoint.
  const inventoryToken = randomBytes(32).toString("base64url");
  if (options.inventory) {
    const inventoryFile = join(dir, "inventory-token");
    await writeFile(inventoryFile, `${inventoryToken}\n`, { mode: 0o600 });
    process.env.INVENTORY_AUTH_SERVICE_TOKEN_FILE = inventoryFile;
  } else {
    delete process.env.INVENTORY_AUTH_SERVICE_TOKEN_FILE;
  }
  const query = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{
    user_id: "user-1", session_id: "session-1", session_expires_at: new Date(Date.now() + 60_000), account_active: true,
  }] as never);
  const license = { resolveCurrentStatus: vi.fn(async () => ({ state: "VALID", checkedAt: "2026-10-21T00:00:00.000Z" })) };
  const controller = new MasterLicenseController(license as unknown as LicenseService);
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    try {
      const result = await controller.current(request as never, body ? JSON.parse(body) as unknown : undefined, response as never);
      response.statusCode = 200;
      response.end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      response.statusCode = status;
      response.end(JSON.stringify(error instanceof HttpException ? error.getResponse() : { error: { code: "INTERNAL", message: "Request failed" } }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return { url: `http://127.0.0.1:${address.port}/internal/v1/license/current`, token, inventoryToken, query, license };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  if (originalTokenFile === undefined) delete process.env.MASTER_AUTH_SERVICE_TOKEN_FILE;
  else process.env.MASTER_AUTH_SERVICE_TOKEN_FILE = originalTokenFile;
  if (originalInventoryTokenFile === undefined) delete process.env.INVENTORY_AUTH_SERVICE_TOKEN_FILE;
  else process.env.INVENTORY_AUTH_SERVICE_TOKEN_FILE = originalInventoryTokenFile;
});

describe("private current-license HTTP boundary", () => {
  it("IT-MAUTH-04 authenticates service token, verifies exact live user/session, and returns no token material", async () => {
    const app = await start();
    const response = await fetch(app.url, {
      method: "POST", headers: { authorization: `Bearer ${app.token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ decision: "ELIGIBLE", status: "VALID", fallbackUntil: null });
    expect(app.query).toHaveBeenCalledTimes(1);
    expect(app.license.resolveCurrentStatus).toHaveBeenCalledWith("user-1");
  });

  it("IT-MAUTH-05 rejects bad credentials and malformed context before database or license checks", async () => {
    const app = await start();
    const unauthorized = await fetch(app.url, { method: "POST", headers: { authorization: "Bearer invalid", "content-type": "application/json" }, body: "{}" });
    expect(unauthorized.status).toBe(401);
    const malformed = await fetch(app.url, { method: "POST", headers: { authorization: `Bearer ${app.token}`, "content-type": "application/json" }, body: JSON.stringify({ userId: "user-1", sessionId: "session-1", username: "untrusted" }) });
    expect(malformed.status).toBe(400);
    expect(app.query).not.toHaveBeenCalled();
    expect(app.license.resolveCurrentStatus).not.toHaveBeenCalled();
  });

  it("IT-MAUTH-06 rejects stale session or account before resolving license", async () => {
    const app = await start();
    app.query.mockResolvedValueOnce([{
      user_id: "user-1", session_id: "different-session", session_expires_at: new Date(Date.now() + 60_000), account_active: true,
    }] as never);
    const response = await fetch(app.url, {
      method: "POST", headers: { authorization: `Bearer ${app.token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }),
    });
    expect(response.status).toBe(401);
    expect(app.license.resolveCurrentStatus).not.toHaveBeenCalled();
  });

  it("IT-LS-AUTH-01 (BE-LS-001) accepts the inventory token beside the master token; any other token stays refused", async () => {
    const app = await start({ inventory: true });
    const ask = (token: string) => fetch(app.url, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }),
    });
    expect((await ask(app.inventoryToken)).status).toBe(200);
    expect((await ask(app.token)).status).toBe(200);
    expect((await ask(randomBytes(32).toString("base64url"))).status).toBe(401);
    expect(app.license.resolveCurrentStatus).toHaveBeenCalledTimes(2);
  });

  it("IT-LS-AUTH-02 (BE-LS-001) works with only the inventory file configured; no file at all is 503, never open", async () => {
    const onlyInventory = await start({ master: false, inventory: true });
    const response = await fetch(onlyInventory.url, {
      method: "POST", headers: { authorization: `Bearer ${onlyInventory.inventoryToken}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }),
    });
    expect(response.status).toBe(200);
    const none = await start({ master: false, inventory: false });
    none.query.mockClear();
    const refused = await fetch(none.url, {
      method: "POST", headers: { authorization: `Bearer ${none.token}`, "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }),
    });
    expect(refused.status).toBe(503);
    expect(none.query).not.toHaveBeenCalled();
  });
});
