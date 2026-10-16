import { describe, expect, it } from "vitest";
import type { CatalogNode } from "@/features/user-permission/api";
import { ALL_SECTIONS, filterCatalog, sectionOptions } from "@/features/user-permission/permission-utils";

/** UT-UP-F01…F06: permissions section filter (owner design 2026-10-16) and search. */

const leaf = (id: string, label: string): CatalogNode => ({ id, label, kind: "leaf", actions: ["VIEW"], children: [] });

const catalog: CatalogNode[] = [
  leaf("dashboard", "Dashboard"),
  {
    id: "setup",
    label: "Setup",
    kind: "section",
    actions: [],
    children: [
      leaf("company-profile", "Company Profile"),
      { id: "master-code", label: "Master Code", kind: "group", actions: [], children: [leaf("vendor", "Vendor"), leaf("customer", "Customer")] },
    ],
  },
  { id: "pre-sale", label: "Pre-Sale", kind: "section", actions: [], children: [leaf("quotation", "Quotation"), leaf("reserve", "Reserve")] },
];

const ids = (nodes: readonly CatalogNode[]): string[] => nodes.flatMap((node) => [node.id, ...ids(node.children)]);

describe("sectionOptions", () => {
  it("UT-UP-F01 lists All Permissions, then every top-level menu in order", () => {
    expect(sectionOptions(catalog)).toEqual([
      { value: ALL_SECTIONS, label: "All Permissions" },
      { value: "dashboard", label: "Dashboard" },
      { value: "setup", label: "Setup" },
      { value: "pre-sale", label: "Pre-Sale" },
    ]);
  });

  it("UT-UP-F02 still offers All Permissions before the catalog loads", () => {
    expect(sectionOptions([])).toEqual([{ value: ALL_SECTIONS, label: "All Permissions" }]);
  });
});

describe("filterCatalog", () => {
  it("UT-UP-F03 keeps the whole catalog for All Permissions", () => {
    expect(filterCatalog(catalog, "", ALL_SECTIONS)).toEqual(catalog);
  });

  it("UT-UP-F04 keeps only the chosen section with all its rows", () => {
    expect(ids(filterCatalog(catalog, "", "setup"))).toEqual(["setup", "company-profile", "master-code", "vendor", "customer"]);
    expect(ids(filterCatalog(catalog, "", "dashboard"))).toEqual(["dashboard"]);
  });

  it("UT-UP-F05 combines the section with the search text", () => {
    expect(ids(filterCatalog(catalog, "vend", "setup"))).toEqual(["setup", "master-code", "vendor"]);
    expect(filterCatalog(catalog, "quotation", "setup")).toEqual([]);
    expect(ids(filterCatalog(catalog, "Master", ALL_SECTIONS))).toEqual(["setup", "master-code", "vendor", "customer"]);
  });

  it("UT-UP-F06 returns nothing for an unknown section", () => {
    expect(filterCatalog(catalog, "", "missing")).toEqual([]);
  });
});
