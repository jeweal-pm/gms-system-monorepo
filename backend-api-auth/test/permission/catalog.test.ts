import { describe, expect, it } from "vitest";
import { APPLICABLE_COUNT, CATALOG_LEAF_KEYS, isGrantInCatalog, PERMISSION_CATALOG } from "../../src/permission/catalog";

/** UT-CAT: catalog v2 shape after currency SA rev 1 (owner 2026-10-26). */
describe("permission catalog", () => {
  it("UT-CAT-01 has 41 leaves and 358 applicable cells", () => {
    expect(CATALOG_LEAF_KEYS).toHaveLength(41);
    expect(APPLICABLE_COUNT).toBe(358);
  });

  it("UT-CAT-02 lists Currency in Master Code with all nine actions", () => {
    const setup = PERMISSION_CATALOG.find((node) => node.key === "setup");
    const masterCode = setup?.children?.find((node) => node.key === "master-code");
    expect(masterCode?.children?.map((node) => node.key)).toContain("currency");
    expect(isGrantInCatalog("currency", "VIEW")).toBe(true);
    expect(isGrantInCatalog("currency", "EXCEL")).toBe(true);
    expect(isGrantInCatalog("document-setup", "DELETE")).toBe(false);
  });
});
