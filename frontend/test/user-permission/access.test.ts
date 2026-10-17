import { describe, expect, it } from "vitest";
import { mapDeleteError, mapSaveError, loadErrorMessage, toUserDetail } from "@/features/user-permission/api";
import { grantableOnly, userAdminAccess } from "@/features/user-permission/access";
import { editableKeys } from "@/features/user-permission/permission-utils";
import { gatewayError } from "../partner/helpers";

/** UT-DA-F01…F07: delegated admin on the User and Permission page (delegated-admin.md, owner 2026-10-17). */

describe("userAdminAccess", () => {
  it("UT-DA-F01 Super Admin may do everything and grant anything", () => {
    expect(userAdminAccess({ isSuperAdmin: true, permissions: "ALL" })).toEqual({ view: true, add: true, edit: true, delete: true, print: true, grantable: null });
  });

  it("UT-DA-F02 others follow user-and-permission actions; grantable = their own keys", () => {
    const access = userAdminAccess({ isSuperAdmin: false, permissions: ["user-and-permission:VIEW", "vendor:VIEW"] });
    expect(access).toMatchObject({ view: true, add: false, edit: false, delete: false, print: false });
    expect([...(access.grantable ?? [])]).toEqual(["user-and-permission:VIEW", "vendor:VIEW"]);
    expect(userAdminAccess({ isSuperAdmin: false, permissions: ["vendor:VIEW"] }).view).toBe(false);
  });
});

describe("grant limits (DA-02)", () => {
  it("UT-DA-F03 only held keys of a cell are editable", () => {
    expect(editableKeys(["a:VIEW", "b:VIEW"], new Set(["a:VIEW"]))).toEqual(["a:VIEW"]);
    expect(editableKeys(["a:VIEW", "b:VIEW"], null)).toEqual(["a:VIEW", "b:VIEW"]);
  });

  it("UT-DA-F04 Duplicate keeps only grants the admin may hand out", () => {
    const copied = { "vendor:VIEW": true, "sale:VIEW": true, "vendor:ADD": false };
    expect(grantableOnly(copied, new Set(["vendor:VIEW", "vendor:ADD"]))).toEqual({ "vendor:VIEW": true });
    expect(grantableOnly(copied, null)).toBe(copied);
  });
});

describe("delegated-admin errors (DA-07)", () => {
  it("UT-DA-F05 save errors explain grant limits and unmanageable users", () => {
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_GRANT_NOT_ALLOWED", httpStatus: 403, code: "FORBIDDEN" }), "create", undefined).formError)
      .toBe("You can only give permissions that you have yourself. Nothing was saved.");
    const notManageable = mapSaveError(gatewayError({ domainCode: "USER_NOT_MANAGEABLE", httpStatus: 403, code: "FORBIDDEN" }), "update", undefined);
    expect(notManageable).toMatchObject({ refetchDetail: true });
    expect(notManageable.formError).toMatch(/can't change this user/);
    expect(mapSaveError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }), "update", undefined)).toMatchObject({ recheckAccess: true });
  });

  it("UT-DA-F06 delete and load errors", () => {
    expect(mapDeleteError(gatewayError({ domainCode: "USER_NOT_MANAGEABLE", httpStatus: 403, code: "FORBIDDEN" }))).toEqual({
      kind: "dialog",
      message: "You can't delete this user: they have permissions you don't have.",
    });
    expect(mapDeleteError(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }))).toMatchObject({ recheckAccess: true });
    expect(loadErrorMessage(gatewayError({ domainCode: "PERMISSION_DENIED", httpStatus: 403, code: "FORBIDDEN" }), "users")).toBe("You don't have permission to view users.");
  });

  it("UT-DA-F07 toUserDetail keeps the manageable flag", () => {
    const detail = toUserDetail({
      id: "u", name: "U", username: "u", isSuperAdmin: false, active: true, hasPhoto: false, updatedAt: "2026-10-17T00:00:00.000Z",
      phone: null, locationKeys: ["primary"], permissions: ["vendor:VIEW"], photoVersion: null, readOnly: false, manageable: false,
    });
    expect(detail.manageable).toBe(false);
  });
});
