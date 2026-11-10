import { describe, expect, it } from "vitest";
import { APPLICABLE_COUNT, CATALOG_LEAF_KEYS, catalogResponse, isGrantInCatalog, parsePermissionKey, PERMISSION_ACTIONS, PERMISSION_CATALOG } from "../../src/permission/catalog";

/** UT-CAT: catalog v2 shape after decimal-setup SA rev 1 / ADR-0040 (owner 2026-11-03). */
describe("permission catalog", () => {
  it("UT-CAT-01 has 43 leaves and 362 applicable cells", () => {
    expect(CATALOG_LEAF_KEYS).toHaveLength(43);
    expect(APPLICABLE_COUNT).toBe(362);
    expect(catalogResponse().applicableCount).toBe(362);
  });

  it("UT-CAT-02 lists Currency in Master Code with all nine actions", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const masterCode = setup?.children?.find((node) => node.key === "master-code");
    expect(masterCode?.children?.map((node) => node.key)).toContain("currency");
    expect(isGrantInCatalog("currency", "VIEW")).toBe(true);
    expect(isGrantInCatalog("currency", "EXCEL")).toBe(true);
    expect(isGrantInCatalog("document-setup", "DELETE")).toBe(false);
  });

  it("UT-CAT-03 lists Decimal Setup in SETUP right after Approval with VIEW and EDIT only", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const keys = setup?.children?.map((node) => node.key) ?? [];
    expect(keys.indexOf("decimal-setup")).toBe(keys.indexOf("approval-setup") + 1);
    expect(setup?.children?.find((node) => node.key === "decimal-setup")).toEqual({ key: "decimal-setup", label: "Decimal Setup", kind: "leaf", actions: ["VIEW", "EDIT"] });
    for (const action of PERMISSION_ACTIONS) expect(isGrantInCatalog("decimal-setup", action)).toBe(action === "VIEW" || action === "EDIT");
    expect(parsePermissionKey("decimal-setup:EDIT")).toEqual({ menuKey: "decimal-setup", action: "EDIT" });
    expect(parsePermissionKey("decimal-setup:DELETE")).toBeNull();
  });


  it("UT-CAT-04 (owner 2026-11-10) Setup follows the Setup tiles and Approval has VIEW and EDIT only", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    expect(setup?.children?.map((node) => node.key)).toEqual(["company-profile", "user-and-permission", "notifications", "master-code", "document-setup", "approval-setup", "decimal-setup"]);
    expect(setup?.children?.find((node) => node.key === "approval-setup")).toEqual({ key: "approval-setup", label: "Approval", kind: "leaf", actions: ["VIEW", "EDIT"] });
    for (const action of PERMISSION_ACTIONS) expect(isGrantInCatalog("approval-setup", action)).toBe(action === "VIEW" || action === "EDIT");
  });

  it("UT-CAT-05 (owner 2026-11-10) labels follow the app; keys are unchanged", () => {
    const labels = new Map<string, string>();
    const walk = (nodes: readonly { key: string; label: string; children?: readonly unknown[] }[]) => {
      for (const node of nodes) {
        labels.set(node.key, node.label);
        walk((node.children ?? []) as never);
      }
    };
    walk(PERMISSION_CATALOG);
    expect(Object.fromEntries(["memo-out-return", "certificate-type", "labor-name", "barcode", "purchase", "outstanding-payable", "outstanding-receivable", "sale-report-costing"].map((key) => [key, labels.get(key)]))).toEqual({
      "memo-out-return": "Memo Out Return",
      "certificate-type": "Certificate Master",
      "labor-name": "Service Fee",
      barcode: "Barcode Printing",
      purchase: "Purchase",
      "outstanding-payable": "O/S Payable",
      "outstanding-receivable": "O/S Receivable",
      "sale-report-costing": "Compare With Costing",
    });
    expect(PERMISSION_CATALOG.find((node) => node.key === "purchase" && node.kind === "section")?.label).toBe("PURCHASE ORDER");
  });
});
