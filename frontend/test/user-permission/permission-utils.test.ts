import { describe, expect, it } from "vitest";
import type { CatalogNode } from "@/features/user-permission/api";
import { sectionLabel } from "@/features/user-permission/api";
import { ALL_SECTIONS, filterCatalog, sectionOptions, toggleCells } from "@/features/user-permission/permission-utils";

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

describe("sectionLabel", () => {
  it.each([
    ["SETUP", "Setup"],
    ["PRE-SALE", "Pre-Sale"],
    ["Memo", "Memo"],
    ["PURCHASE", "Purchase"],
    ["INVENTORY", "Inventory"],
    ["SALE", "Sale"],
    ["ACCOUNT", "Account"],
    ["REPORT", "Report"],
  ])("UT-UP-F07 shows %j as %j", (input, expected) => {
    expect(sectionLabel(input)).toBe(expected);
  });
});

describe("toggleCells (VIEW rule, view-dependency.md)", () => {
  const all = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "APPROVE", "PRICE", "PRINT", "EXCEL"] as const;
  const menu = (id: string, actions: readonly (typeof all)[number][] = all): CatalogNode => ({ id, label: id, kind: "leaf", actions, children: [] });
  const company = menu("company-profile");
  const vendor = menu("vendor");
  const customer = menu("customer");
  const dashboard = menu("dashboard", ["VIEW", "APPROVE", "PRICE", "PRINT", "EXCEL"]);
  const on = (values: Record<string, boolean>) => Object.keys(values).filter((key) => values[key]).sort();

  it("UT-UP-F10 turning on EDIT also turns on VIEW (VD-01)", () => {
    expect(on(toggleCells(["company-profile:EDIT"], {}, [company]))).toEqual(["company-profile:EDIT", "company-profile:VIEW"]);
  });

  it.each(all.filter((action) => action !== "VIEW"))("UT-UP-F11 %s turns on VIEW too", (action) => {
    expect(toggleCells([`company-profile:${action}`], {}, [company])["company-profile:VIEW"]).toBe(true);
  });

  it("UT-UP-F12 turning off VIEW turns off every other action of that menu only (VD-02)", () => {
    const values = { "company-profile:VIEW": true, "company-profile:EDIT": true, "company-profile:PRINT": true, "vendor:VIEW": true, "vendor:EDIT": true };
    expect(on(toggleCells(["company-profile:VIEW"], values, [company]))).toEqual(["vendor:EDIT", "vendor:VIEW"]);
  });

  it("UT-UP-F13 turning off another action leaves VIEW on (VD-04)", () => {
    const values = { "company-profile:VIEW": true, "company-profile:EDIT": true };
    expect(on(toggleCells(["company-profile:EDIT"], values, [company]))).toEqual(["company-profile:VIEW"]);
  });

  it("UT-UP-F14 a group column turns on VIEW for every sub-menu (VD-03)", () => {
    const keys = ["vendor:EDIT", "customer:EDIT"];
    expect(on(toggleCells(keys, {}, [vendor, customer]))).toEqual(["customer:EDIT", "customer:VIEW", "vendor:EDIT", "vendor:VIEW"]);
  });

  it("UT-UP-F15 the Select All VIEW column off clears everything (VD-03)", () => {
    const values = { "vendor:VIEW": true, "vendor:ADD": true, "customer:VIEW": true, "dashboard:VIEW": true, "dashboard:PRICE": true };
    expect(on(toggleCells(["vendor:VIEW", "customer:VIEW", "dashboard:VIEW"], values, [vendor, customer, dashboard]))).toEqual([]);
  });

  it("UT-UP-F16 Dashboard APPROVE turns on Dashboard VIEW", () => {
    expect(on(toggleCells(["dashboard:APPROVE"], {}, [dashboard]))).toEqual(["dashboard:APPROVE", "dashboard:VIEW"]);
  });
});
