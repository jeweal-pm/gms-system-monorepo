import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MATRIX_ACTIONS, PERMISSION_ACTIONS, type CatalogNode } from "@/features/user-permission/api";
import { PermissionMatrix } from "@/features/user-permission/components/permission-matrix";
import { APPROVE_MENUS } from "@/features/approve-center/menus";
import {
  applicableKeys,
  approveOptions,
  approveSelection,
  countEnabled,
  grantsFromValues,
  leafNodes,
  matrixApplicableCount,
  toggleCells,
  valuesFromKeys,
  withApproveSelection,
} from "@/features/user-permission/permission-utils";

/** UT-UP-H01…H04: the APPROVE column is hidden from the matrix (owner 2026-11-10, "Hide column only"). */

const reserve: CatalogNode = { id: "reserve", label: "Reserve", kind: "leaf", actions: ["VIEW", "ADD", "EDIT", "APPROVE"], children: [] };
const quotation: CatalogNode = { id: "quotation", label: "Quotation", kind: "leaf", actions: ["VIEW", "EDIT"], children: [] };
const catalog: CatalogNode[] = [{ id: "pre-sale", label: "Pre-Sale", kind: "section", actions: [], children: [quotation, reserve] }];
const noop = () => undefined;

describe("UT-UP-H01 matrix columns", () => {
  it("8 columns without APPROVE; the catalog still has APPROVE", () => {
    expect(MATRIX_ACTIONS).toEqual(["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "PRICE", "PRINT", "EXCEL"]);
    expect(PERMISSION_ACTIONS).toContain("APPROVE");
    const html = renderToStaticMarkup(createElement(PermissionMatrix, { nodes: catalog, values: {}, onChange: noop, collapsed: new Set<string>(), onToggleGroup: noop, forceExpand: true }));
    expect(html).not.toContain(">APPROVE</th>");
    expect(html).not.toContain("APPROVE");
    expect(html.match(/<th scope="col"/g)).toHaveLength(9);
    expect(html).toContain('colSpan="9"');
  });
});

describe("UT-UP-H02 stored APPROVE grants are saved back unchanged", () => {
  const stored = valuesFromKeys(["reserve:VIEW", "reserve:APPROVE"]);

  it("toggling another column (or Select All of one) never touches APPROVE", () => {
    const next = toggleCells(applicableKeys(catalog, "EDIT"), stored, leafNodes(catalog));
    expect(grantsFromValues(next, catalog)).toEqual(["quotation:VIEW", "quotation:EDIT", "reserve:VIEW", "reserve:EDIT", "reserve:APPROVE"]);
    const off = toggleCells(applicableKeys(catalog, "EDIT"), next, leafNodes(catalog));
    expect(grantsFromValues(off, catalog)).toContain("reserve:APPROVE");
  });

  it("turning VIEW off still clears the menu's other actions, APPROVE included (VD-02)", () => {
    const next = toggleCells(["reserve:VIEW"], stored, [reserve]);
    expect(grantsFromValues(next, catalog)).toEqual([]);
  });
});

describe("UT-UP-H03 counters match the shown columns", () => {
  it("'{on} of {total}' leave APPROVE out", () => {
    expect(applicableKeys(catalog)).toHaveLength(6);
    expect(matrixApplicableCount(catalog)).toBe(5);
    expect(countEnabled(catalog, valuesFromKeys(["reserve:VIEW", "reserve:APPROVE"]))).toBe(1);
  });
});

describe("UT-UP-H04 Approve field in Personal Information (owner 2026-11-10)", () => {
  const menus = [
    { leaf: "quotation", label: "Quotation" },
    { leaf: "reserve", label: "Reserve" },
    { leaf: "load-to-stock", label: "Load to Stock" },
  ];
  const options = approveOptions(catalog, menus);

  it("offers the Approve menu's documents whose catalog leaf has APPROVE, in sidebar order", () => {
    expect(options).toEqual([{ id: "reserve", label: "Reserve" }]);
    expect(approveOptions(catalog, APPROVE_MENUS).map((option) => option.id)).toEqual(["reserve"]);
  });

  it("choosing grants APPROVE + VIEW; removing drops APPROVE only; other permissions stay", () => {
    const base = valuesFromKeys(["quotation:VIEW"]);
    const on = withApproveSelection(base, ["reserve"], options, null);
    expect(grantsFromValues(on, catalog)).toEqual(["quotation:VIEW", "reserve:VIEW", "reserve:APPROVE"]);
    expect(approveSelection(on, options)).toEqual(["reserve"]);
    const off = withApproveSelection(on, [], options, null);
    expect(grantsFromValues(off, catalog)).toEqual(["quotation:VIEW", "reserve:VIEW"]);
  });

  it("a document the signed-in user may not grant keeps its stored value (DA-02)", () => {
    const stored = valuesFromKeys(["reserve:VIEW", "reserve:APPROVE"]);
    expect(approveSelection(withApproveSelection(stored, [], options, new Set(["reserve:VIEW"])), options)).toEqual(["reserve"]);
    expect(approveSelection(withApproveSelection({}, ["reserve"], options, new Set<string>()), options)).toEqual([]);
  });

  it("layout: 4 columns at xl, Location and Approve each 2 columns wide", () => {
    const source = readFileSync("src/features/user-permission/components/personal-information-card.tsx", "utf8");
    expect(source).toContain("md:grid-cols-2 xl:grid-cols-4");
    expect(source).toContain('const wide = "md:col-span-2";');
    expect(source.indexOf('id="user-phone"')).toBeLessThan(source.indexOf('id="user-location"'));
    expect(source.indexOf('id="user-location"')).toBeLessThan(source.indexOf('id="user-approve"'));
    expect(source).not.toContain('<div className="hidden xl:block" aria-hidden />');
  });
});
