import { describe, expect, it } from "vitest";
import { APPLICABLE_COUNT, CATALOG_LEAF_KEYS, catalogResponse, isGrantInCatalog, parsePermissionKey, PERMISSION_ACTIONS, PERMISSION_CATALOG } from "../../src/permission/catalog";

/** UT-CAT: catalog v2 shape after decimal-setup SA rev 1 / ADR-0040 and approval-setup SA rev 1 / ADR-0048. */
describe("permission catalog", () => {
  it("UT-CAT-01 has 43 leaves and 362 applicable cells", () => {
    expect(CATALOG_LEAF_KEYS).toHaveLength(43);
    expect(APPLICABLE_COUNT).toBe(362);
    expect(catalogResponse().applicableCount).toBe(362);
  });

  it("UT-AS-B20 lists Approval (approval-setup) in SETUP right after Decimal Setup with VIEW and EDIT only", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const keys = setup?.children?.map((node) => node.key) ?? [];
    expect(keys.indexOf("approval-setup")).toBe(keys.indexOf("decimal-setup") + 1);
    expect(setup?.children?.find((node) => node.key === "approval-setup")).toEqual({ key: "approval-setup", label: "Approval", kind: "leaf", actions: ["VIEW", "EDIT"] });
    for (const action of PERMISSION_ACTIONS) expect(isGrantInCatalog("approval-setup", action)).toBe(action === "VIEW" || action === "EDIT");
    expect(parsePermissionKey("approval-setup:EDIT")).toEqual({ menuKey: "approval-setup", action: "EDIT" });
    expect(parsePermissionKey("approval-setup:APPROVE")).toBeNull();
    // Existing grants are unaffected: the document APPROVE cells and Decimal Setup cells are still catalog cells.
    for (const menu of ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"]) {
      expect(isGrantInCatalog(menu, "APPROVE")).toBe(true);
    }
    expect(isGrantInCatalog("decimal-setup", "EDIT")).toBe(true);
  });

  it("UT-CAT-02 lists Currency in Master Code with all nine actions", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const masterCode = setup?.children?.find((node) => node.key === "master-code");
    expect(masterCode?.children?.map((node) => node.key)).toContain("currency");
    expect(isGrantInCatalog("currency", "VIEW")).toBe(true);
    expect(isGrantInCatalog("currency", "EXCEL")).toBe(true);
    expect(isGrantInCatalog("document-setup", "DELETE")).toBe(false);
  });

  it("UT-CAT-03 lists Decimal Setup in SETUP right after Document Setup with VIEW and EDIT only", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const keys = setup?.children?.map((node) => node.key) ?? [];
    expect(keys.indexOf("decimal-setup")).toBe(keys.indexOf("document-setup") + 1);
    expect(setup?.children?.find((node) => node.key === "decimal-setup")).toEqual({ key: "decimal-setup", label: "Decimal Setup", kind: "leaf", actions: ["VIEW", "EDIT"] });
    for (const action of PERMISSION_ACTIONS) expect(isGrantInCatalog("decimal-setup", action)).toBe(action === "VIEW" || action === "EDIT");
    expect(parsePermissionKey("decimal-setup:EDIT")).toEqual({ menuKey: "decimal-setup", action: "EDIT" });
    expect(parsePermissionKey("decimal-setup:DELETE")).toBeNull();
  });
});
