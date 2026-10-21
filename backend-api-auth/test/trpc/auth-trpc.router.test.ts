import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createAuthTrpcRouter, shortcutGroupsFor, type AuthTrpcContext } from "../../src/trpc/auth-trpc.router";
import { UserAdminService } from "../../src/user-admin/user-admin.service";
import { LicenseDomainError, LicenseService } from "../../src/license/license.service";
import { userAdminException } from "../../src/user-admin/user-admin.errors";

const actor = { id: "actor-1", isSuperAdmin: true, permissions: [] };
const ctx: AuthTrpcContext = {
  req: { headers: { cookie: "better-auth.session_token=opaque" }, method: "GET" } as AuthTrpcContext["req"],
  session: { user: { id: "actor-1", username: "admin", email: "admin@users.invalid", name: "Admin", role: "admin" } },
  license: { state: "VALID" },
  authz: { isSuperAdmin: true, permissions: [] },
};

function setup() {
  const userAdmin = {
    requireAccess: vi.fn().mockResolvedValue(actor),
    catalog: vi.fn().mockReturnValue({ version: 2, actions: [], nodes: [], applicableCount: 0 }),
    locationOptions: vi.fn().mockReturnValue({ items: [] }),
    list: vi.fn().mockResolvedValue({ items: [], usage: { used: 1, limit: 20 } }),
    get: vi.fn().mockResolvedValue({ id: "target-1" }),
    create: vi.fn().mockResolvedValue({ id: "target-2", updatedAt: "2026-10-21T00:00:00.000Z" }),
    update: vi.fn().mockResolvedValue({ id: "target-1", updatedAt: "2026-10-21T00:00:00.000Z" }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
    removePhoto: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as UserAdminService;
  const licenseService = {
    resolveStatus: vi.fn().mockResolvedValue({ state: "VALID", type: "trial" }),
    activate: vi.fn().mockResolvedValue({ state: "VALID", type: "trial" }),
  } as unknown as LicenseService;
  return { router: createAuthTrpcRouter({ userAdmin, licenseService }), userAdmin, licenseService };
}

describe("auth-owned tRPC compatibility router", () => {
  it("retains session, license, permission and dashboard output behavior", async () => {
    const { router, licenseService, userAdmin } = setup();
    const caller = router.createCaller(ctx);
    expect(await caller.session.current()).toEqual(ctx.session);
    expect(await caller.license.status()).toEqual({ state: "VALID", type: "trial" });
    expect(await caller.license.activate({ licenseKey: "  valid-key  " })).toEqual({ state: "VALID", type: "trial" });
    expect(licenseService.activate).toHaveBeenCalledWith("actor-1", "admin", "valid-key");
    expect(await caller.permission.mine()).toEqual({ isSuperAdmin: true, permissions: "ALL" });
    expect(await caller.permission.catalog()).toEqual({ version: 2, actions: [], nodes: [], applicableCount: 0 });
    expect(userAdmin.requireAccess).toHaveBeenCalledWith(ctx.req, "VIEW");
    expect((await caller.dashboard.shortcutGroups()).length).toBeGreaterThan(0);
  });

  it("preserves the existing license activation-required status result", async () => {
    const { router, licenseService } = setup();
    (licenseService.resolveStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new LicenseDomainError("LICENSE_REQUIRED", 403));
    const result = await router.createCaller(ctx).license.status();
    expect(result).toMatchObject({ state: "REQUIRED", checkedAt: expect.any(String) });
  });

  it("enforces current license and requires service authorization before user-admin operations", async () => {
    const { router, userAdmin } = setup();
    const caller = router.createCaller(ctx);
    await caller.userAdmin.list();
    await caller.userAdmin.get({ id: "target-1" });
    await caller.userAdmin.create({ username: "user1", password: "password123", name: "User", phone: null, locationKeys: ["main"], active: true, permissions: [] });
    await caller.userAdmin.update({ id: "target-1", name: "Updated" });
    await caller.userAdmin.delete({ id: "target-1" });
    await caller.userAdmin.removePhoto({ id: "target-1" });
    await caller.userAdmin.locationOptions();
    expect(userAdmin.requireAccess.mock.calls.map(([request, action]) => action)).toEqual(["VIEW", "VIEW", "ADD", "EDIT", "DELETE", "EDIT", "VIEW"]);
    expect(userAdmin.update).toHaveBeenCalledWith(actor, "target-1", { name: "Updated" });

    await expect(router.createCaller({ ...ctx, license: { state: "REVOKED" } }).dashboard.shortcutGroups()).rejects.toMatchObject({ code: "FORBIDDEN", message: "LICENSE_REVOKED" });
    const denied = setup();
    (denied.userAdmin.requireAccess as ReturnType<typeof vi.fn>).mockRejectedValue(userAdminException("PERMISSION_DENIED", 403));
    await expect(denied.router.createCaller(ctx).userAdmin.list()).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    expect(denied.userAdmin.list).not.toHaveBeenCalled();
  });

  it("filters dashboard shortcuts by the current grants", () => {
    const result = shortcutGroupsFor({ isSuperAdmin: false, permissions: ["dashboard:VIEW", "customer:VIEW"] });
    expect(result).toEqual([{ title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }] }, { title: "Master Code", items: [{ label: "Customer", slug: "customer", href: "/setup/customer" }] }]);
    expect(shortcutGroupsFor({ isSuperAdmin: false, permissions: [] })).toEqual([]);
  });

  it("serves an auth procedure through the actual Express tRPC HTTP boundary", async () => {
    const { router, userAdmin } = setup();
    const app = express();
    app.use("/api/auth/trpc", createExpressMiddleware({ router, createContext: () => ctx, maxBodySize: 1_048_576 }));
    const server = createServer(app);
    await listen(server);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("test server did not bind");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/trpc/userAdmin.list`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ result: { data: { items: [], usage: { used: 1, limit: 20 } } } });
      expect(userAdmin.list).toHaveBeenCalledOnce();
    } finally { await close(server); }
  });
});

function listen(server: Server) { return new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); }
function close(server: Server) { return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

afterEach(() => vi.clearAllMocks());
