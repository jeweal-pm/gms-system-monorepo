import { describe, expect, it } from "vitest";
import { hasMasterGrant, requireAllMasterGrants, requireMasterGrant, requireMasterSession, type MasterContext } from "../../src/master/authorization";

/** UT-DEC-B08: `requireMasterSession` (decimal-setup SA rev 1 authorization.md) and the unchanged `requireMasterGrant` order. */

function context(overrides: Partial<MasterContext> = {}, grants: string[] = []): MasterContext {
  return {
    principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: false, ...overrides,
  };
}

const failure = (run: () => unknown) => {
  try { run(); } catch (error) { return { code: (error as { code?: string }).code, message: (error as Error).message }; }
  throw new Error("expected a failure");
};

describe("UT-DEC-B08 requireMasterSession", () => {
  it("passes a live, licensed session with no grants and no CSRF proof", () => {
    expect(requireMasterSession(context())).toMatchObject({ userId: "user-1", sessionId: "session-1" });
  });

  it("refuses in the same order as requireMasterGrant: identity, authorization, license", () => {
    expect(failure(() => requireMasterSession(context({ principal: null, authorization: "UNAVAILABLE", license: "DENIED" })))).toEqual({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
    expect(failure(() => requireMasterSession(context({ principal: { userId: "user-1", sessionId: "", isSuperAdmin: false, grants: [] } })))).toEqual({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
    expect(failure(() => requireMasterSession(context({ authorization: "UNAVAILABLE", license: "DENIED" })))).toEqual({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
    expect(failure(() => requireMasterSession(context({ license: "UNAVAILABLE" })))).toEqual({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
    expect(failure(() => requireMasterSession(context({ license: "DENIED" })))).toEqual({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
  });
});

describe("UT-DEC-B08 requireMasterGrant keeps its checks on top of the session proof", () => {
  it("checks CSRF on mutations, then the exact grant; super admin passes the grant step", () => {
    expect(failure(() => requireMasterGrant(context({ license: "DENIED" }, ["decimal-setup:EDIT"]), "decimal-setup", "EDIT", true))).toEqual({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
    expect(failure(() => requireMasterGrant(context({}, ["decimal-setup:EDIT"]), "decimal-setup", "EDIT", true))).toEqual({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    expect(failure(() => requireMasterGrant(context({ csrfVerified: true }, ["decimal-setup:VIEW", "document-setup:EDIT"]), "decimal-setup", "EDIT", true))).toEqual({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    expect(requireMasterGrant(context({ csrfVerified: true }, ["decimal-setup:EDIT"]), "decimal-setup", "EDIT", true)).toBe("user-1");
    expect(requireMasterGrant(context({ csrfVerified: true, principal: { userId: "admin", sessionId: "s", isSuperAdmin: true, grants: [] } }), "decimal-setup", "EDIT", true)).toBe("admin");
  });
});

describe("UT-AP-B10 / GP-AP-02 requireAllMasterGrants and hasMasterGrant (approve-center ADR-0046 D11)", () => {
  it("needs every listed grant after the same session / CSRF checks; Super Admin passes; empty list is refused", () => {
    const both = [["reserve", "APPROVE"], ["reserve", "VIEW"]] as const;
    expect(requireAllMasterGrants(context({}, ["reserve:APPROVE", "reserve:VIEW"]), both, false)).toBe("user-1");
    expect(failure(() => requireAllMasterGrants(context({}, ["reserve:APPROVE"]), both, false))).toEqual({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    expect(failure(() => requireAllMasterGrants(context({}, ["reserve:VIEW", "memo-out:APPROVE"]), both, false))).toEqual({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
    expect(failure(() => requireAllMasterGrants(context({ license: "DENIED" }, ["reserve:APPROVE", "reserve:VIEW"]), both, false))).toEqual({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
    expect(failure(() => requireAllMasterGrants(context({ principal: null }), both, false))).toEqual({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
    expect(failure(() => requireAllMasterGrants(context({}, ["reserve:APPROVE", "reserve:VIEW"]), both, true))).toEqual({ code: "FORBIDDEN", message: "CSRF_INVALID" });
    expect(requireAllMasterGrants(context({ principal: { userId: "admin", sessionId: "s", isSuperAdmin: true, grants: [] } }), both, false)).toBe("admin");
    expect(failure(() => requireAllMasterGrants(context({ principal: { userId: "admin", sessionId: "s", isSuperAdmin: true, grants: [] } }), [], false))).toEqual({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
  });

  it("hasMasterGrant: exact menu:action or Super Admin", () => {
    expect(hasMasterGrant({ isSuperAdmin: false, grants: ["approval-setup:VIEW"] }, "approval-setup", "VIEW")).toBe(true);
    expect(hasMasterGrant({ isSuperAdmin: false, grants: ["approval-setup:EDIT"] }, "approval-setup", "VIEW")).toBe(false);
    expect(hasMasterGrant({ isSuperAdmin: true, grants: [] }, "purchase", "APPROVE")).toBe(true);
  });
});
