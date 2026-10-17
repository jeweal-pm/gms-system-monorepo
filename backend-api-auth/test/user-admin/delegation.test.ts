import { describe, expect, it } from "vitest";
import { canUseUserAdmin, isManageableTarget, ungrantableKeys, type UserAdminActor } from "../../src/user-admin/delegation";

/** UT-DA-01…08: delegated user administration rules (delegated-admin.md DA-01…05). */

const superAdmin: UserAdminActor = { id: "sa", isSuperAdmin: true, permissions: [] };
const admin: UserAdminActor = {
  id: "admin",
  isSuperAdmin: false,
  permissions: ["user-and-permission:VIEW", "user-and-permission:EDIT", "vendor:VIEW", "vendor:ADD"],
};

describe("canUseUserAdmin (DA-01)", () => {
  it("UT-DA-01 Super Admin passes every action", () => {
    for (const action of ["VIEW", "ADD", "EDIT", "DELETE"] as const) expect(canUseUserAdmin(superAdmin, action)).toBe(true);
  });

  it("UT-DA-02 others need the exact user-and-permission action", () => {
    expect(canUseUserAdmin(admin, "VIEW")).toBe(true);
    expect(canUseUserAdmin(admin, "EDIT")).toBe(true);
    expect(canUseUserAdmin(admin, "ADD")).toBe(false);
    expect(canUseUserAdmin(admin, "DELETE")).toBe(false);
    expect(canUseUserAdmin({ id: "u", isSuperAdmin: false, permissions: ["vendor:VIEW"] }, "VIEW")).toBe(false);
  });
});

describe("ungrantableKeys (DA-02)", () => {
  it("UT-DA-03 Super Admin may grant anything", () => {
    expect(ungrantableKeys(superAdmin, ["sale:DELETE", "vendor:VIEW"])).toEqual([]);
  });

  it("UT-DA-04 others may grant only keys they hold", () => {
    expect(ungrantableKeys(admin, ["vendor:VIEW", "vendor:ADD"])).toEqual([]);
    expect(ungrantableKeys(admin, ["vendor:VIEW", "vendor:DELETE", "sale:VIEW"])).toEqual(["vendor:DELETE", "sale:VIEW"]);
    expect(ungrantableKeys(admin, [])).toEqual([]);
  });
});

describe("isManageableTarget (DA-03…05)", () => {
  const user = (permissions: string[], extra: Partial<{ id: string; isSuperAdmin: boolean }> = {}) => ({ id: "target", isSuperAdmin: false, permissions, ...extra });

  it("UT-DA-05 Super Admin manages everyone (ADR-0020 locks apply separately)", () => {
    expect(isManageableTarget(superAdmin, user([], { isSuperAdmin: true }))).toBe(true);
    expect(isManageableTarget(superAdmin, user(["sale:DELETE"]))).toBe(true);
  });

  it("UT-DA-06 a delegated admin manages users whose grants are within their own", () => {
    expect(isManageableTarget(admin, user([]))).toBe(true);
    expect(isManageableTarget(admin, user(["vendor:VIEW"]))).toBe(true);
    expect(isManageableTarget(admin, user(["vendor:VIEW", "sale:VIEW"]))).toBe(false);
  });

  it("UT-DA-07 never a Super Admin account (DA-04)", () => {
    expect(isManageableTarget(admin, user([], { isSuperAdmin: true }))).toBe(false);
  });

  it("UT-DA-08 never their own account (DA-05)", () => {
    expect(isManageableTarget(admin, user([], { id: "admin" }))).toBe(false);
  });
});
