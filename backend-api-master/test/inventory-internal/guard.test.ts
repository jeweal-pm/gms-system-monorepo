import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Reflector } from "@nestjs/core";
import { HttpException, type ExecutionContext } from "@nestjs/common";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { inventoryTokenMatches, InventoryServiceTokenGuard, INVENTORY_INTERNAL_ROUTE, readInventoryTokenDigest } from "../../src/inventory-internal/inventory-token.guard";
import { ServiceTokenGuard } from "../../src/internal-auth/service-token.guard";
import { InventoryInternalController } from "../../src/inventory-internal/inventory-internal.controller";

/** UT-LS-B07 (BE-LS-004, load-to-stock authorization.md "Service-to-service"): the inventory → master credential. */
const dir = mkdtempSync(join(tmpdir(), "gms-inv-token-"));
const partnerToken = "partner-token-for-unit-tests-0123456789-abcdef";
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function tokenFile(value: string) {
  const file = join(dir, randomBytes(4).toString("hex"));
  writeFileSync(file, value);
  return file;
}
const httpContext = (authorization: string | undefined, cls: unknown = InventoryInternalController) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }), getHandler: () => () => undefined, getClass: () => cls }) as unknown as ExecutionContext;
const status = (fn: () => unknown) => {
  try { fn(); return 200; } catch (error) { return error instanceof HttpException ? error.getStatus() : 500; }
};

describe("InventoryServiceTokenGuard", () => {
  it("reads a ≥ 43-character file secret (trailing newline trimmed); missing / short / spaced files are refused", () => {
    const token = randomBytes(32).toString("base64url");
    expect(readInventoryTokenDigest({ INVENTORY_MASTER_SERVICE_TOKEN_FILE: tokenFile(`${token}\n`) })).toBeInstanceOf(Buffer);
    expect(readInventoryTokenDigest({ INVENTORY_MASTER_SERVICE_TOKEN_FILE: tokenFile("short") })).toBeNull();
    expect(readInventoryTokenDigest({ INVENTORY_MASTER_SERVICE_TOKEN_FILE: tokenFile(`${token} x`) })).toBeNull();
    expect(readInventoryTokenDigest({ INVENTORY_MASTER_SERVICE_TOKEN_FILE: join(dir, "missing") })).toBeNull();
    expect(readInventoryTokenDigest({})).toBeNull();
  });

  it("accepts only `Bearer <inventory token>`; the partner token, a wrong token or no header → 401; unconfigured never matches", () => {
    const token = randomBytes(32).toString("base64url");
    vi.stubEnv("PARTNER_SERVICE_TOKEN", partnerToken);
    vi.stubEnv("INVENTORY_MASTER_SERVICE_TOKEN_FILE", tokenFile(token));
    const guard = new InventoryServiceTokenGuard();
    expect(status(() => guard.canActivate(httpContext(`Bearer ${token}`)))).toBe(200);
    expect(status(() => guard.canActivate(httpContext(`Bearer ${partnerToken}`)))).toBe(401);
    expect(status(() => guard.canActivate(httpContext(`Bearer ${token}x`)))).toBe(401);
    expect(status(() => guard.canActivate(httpContext(undefined)))).toBe(401);
    expect(status(() => guard.canActivate(httpContext(token)))).toBe(401);
    expect(inventoryTokenMatches(`Bearer ${token}`, null)).toBe(false);
  });

  it("refuses everything when the inventory token equals the partner token (the two credentials must differ)", () => {
    vi.stubEnv("PARTNER_SERVICE_TOKEN", partnerToken);
    vi.stubEnv("INVENTORY_MASTER_SERVICE_TOKEN_FILE", tokenFile(partnerToken));
    const guard = new InventoryServiceTokenGuard();
    expect(status(() => guard.canActivate(httpContext(`Bearer ${partnerToken}`)))).toBe(401);
  });

  it("the global partner guard skips only the inventory controller; other routes still need the partner token", () => {
    vi.stubEnv("PARTNER_SERVICE_TOKEN", partnerToken);
    const global = new ServiceTokenGuard(new Reflector());
    expect(Reflect.getMetadata(INVENTORY_INTERNAL_ROUTE, InventoryInternalController)).toBe(true);
    expect(status(() => global.canActivate(httpContext(undefined)))).toBe(200);
    class OtherController {}
    expect(status(() => global.canActivate(httpContext("Bearer inventory-token-is-not-the-partner-token-xxxxxxxx", OtherController)))).toBe(401);
    expect(status(() => global.canActivate(httpContext(`Bearer ${partnerToken}`, OtherController)))).toBe(200);
  });
});
