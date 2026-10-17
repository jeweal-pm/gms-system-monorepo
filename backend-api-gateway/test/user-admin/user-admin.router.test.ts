import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callAuth } from "../../src/trpc/auth-client";
import { describeError } from "../../src/trpc/domain-error";
import { appRouter, type TrpcContext } from "../../src/trpc/router";
import { userDetailOutputSchema } from "../../src/trpc/user-admin-schemas";

/** UT-DA-G01…G06: `userAdmin.*` / `permission.catalog` follow `user-and-permission:<action>` (delegated-admin.md DA-01). Auth is mocked. */

vi.mock("../../src/trpc/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/trpc/auth-client")>()),
  callAuth: vi.fn(),
}));

function caller(permissions: string[], superAdmin = false) {
  const ctx: TrpcContext = {
    session: { user: { id: "user-1", username: "admin", email: "x@users.invalid", name: "Admin" } },
    license: { state: "VALID" },
    authz: { isSuperAdmin: superAdmin, permissions },
    cookie: "session=1",
    activateLicense: null,
  };
  return appRouter.createCaller(ctx);
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return { code: error.code, domainCode: describeError(error).domainCode };
    throw error;
  }
  throw new Error("expected the call to fail");
}

const createInput = { username: "new.user", password: "pass1234", name: "New", phone: null, locationKeys: ["primary"], active: true, permissions: [] };
const ID = { id: "00000000-0000-4000-8000-000000000002" };

beforeEach(() => {
  vi.mocked(callAuth).mockReset();
  vi.mocked(callAuth).mockResolvedValue({});
});

describe("userAdmin router permissions", () => {
  it("UT-DA-G01 a user without user-and-permission:VIEW gets PERMISSION_DENIED and auth is never called", async () => {
    const api = caller(["vendor:VIEW"]);
    for (const call of [api.userAdmin.list(), api.userAdmin.get(ID), api.userAdmin.locationOptions(), api.permission.catalog()]) {
      expect(await failure(call)).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    }
    expect(callAuth).not.toHaveBeenCalled();
  });

  it("UT-DA-G02 VIEW allows the reads", async () => {
    const api = caller(["user-and-permission:VIEW"]);
    await api.userAdmin.list();
    await api.userAdmin.get(ID);
    await api.userAdmin.locationOptions();
    await api.permission.catalog();
    expect(callAuth).toHaveBeenCalledTimes(4);
  });

  it("UT-DA-G03 VIEW alone can't create, update or delete", async () => {
    const api = caller(["user-and-permission:VIEW"]);
    expect(await failure(api.userAdmin.create(createInput))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    expect(await failure(api.userAdmin.update({ ...ID, name: "X" }))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    expect(await failure(api.userAdmin.delete(ID))).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    expect(callAuth).not.toHaveBeenCalled();
  });

  it("UT-DA-G04 each mutation needs its own action (ADD, EDIT, DELETE)", async () => {
    await caller(["user-and-permission:ADD"]).userAdmin.create(createInput);
    await caller(["user-and-permission:EDIT"]).userAdmin.update({ ...ID, name: "X" });
    await caller(["user-and-permission:DELETE"]).userAdmin.delete(ID);
    expect(vi.mocked(callAuth).mock.calls.map(([call]) => call.method)).toEqual(["POST", "PATCH", "DELETE"]);
  });

  it("UT-DA-G05 Super Admin passes every procedure", async () => {
    const api = caller([], true);
    await api.userAdmin.list();
    await api.userAdmin.create(createInput);
    await api.userAdmin.delete(ID);
    expect(callAuth).toHaveBeenCalledTimes(3);
  });
});

describe("userDetailOutputSchema", () => {
  it("UT-DA-G06 requires the manageable flag from auth", () => {
    const detail = {
      id: "u", name: "U", username: "u", isSuperAdmin: false, active: true, hasPhoto: false, updatedAt: "2026-10-17T00:00:00.000Z",
      phone: null, locationKeys: ["primary"], permissions: ["vendor:VIEW"], photoVersion: null, readOnly: false,
    };
    expect(userDetailOutputSchema.safeParse(detail).success).toBe(false);
    expect(userDetailOutputSchema.safeParse({ ...detail, manageable: false }).success).toBe(true);
  });
});
