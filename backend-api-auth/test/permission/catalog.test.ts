import { describe, expect, it } from "vitest";
import { APPLICABLE_COUNT, CATALOG_LEAF_KEYS, catalogResponse, isGrantInCatalog, parsePermissionKey, PERMISSION_ACTIONS, PERMISSION_CATALOG } from "../../src/permission/catalog";

/** UT-CAT: catalog v2 shape after decimal-setup SA rev 1 / ADR-0038 (owner 2026-11-03). */
describe("permission catalog", () => {
  it("UT-CAT-01 has 42 leaves and 360 applicable cells", () => {
    expect(CATALOG_LEAF_KEYS).toHaveLength(42);
    expect(APPLICABLE_COUNT).toBe(360);
    expect(catalogResponse().applicableCount).toBe(360);
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
