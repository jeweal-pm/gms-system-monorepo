import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogNode, PermissionCatalog } from "@/features/user-permission/api";
import { PermissionsCard } from "@/features/user-permission/components/permissions-card";
import { SubtaskViewMenu } from "@/features/user-permission/components/subtask-view-menu";
import { DEFAULT_SUBTASK_VIEW, collapsedGroupIds } from "@/features/user-permission/permission-utils";

/** UT-UP-F07…F11: "Show subtasks" menu replacing Expand All / Collapse All (owner design 2026-11-03). */

const leaf = (id: string, label: string): CatalogNode => ({ id, label, kind: "leaf", actions: ["VIEW"], children: [] });

const catalog: PermissionCatalog = {
  applicableCount: 4,
  nodes: [
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
  ],
};

const noop = () => {};

describe("collapsedGroupIds", () => {
  const groups = ["master-code", "memo-outstanding", "sale-report"];

  it("UT-UP-F07 Collapsed is the default view and collapses every group", () => {
    expect(DEFAULT_SUBTASK_VIEW).toBe("collapsed");
    expect([...collapsedGroupIds("collapsed", groups, new Set())]).toEqual(groups);
  });

  it("UT-UP-F08 Expanded collapses no group", () => {
    expect(collapsedGroupIds("expanded", groups, new Set()).size).toBe(0);
  });

  it("UT-UP-F09 a chevron click flips only that group against the chosen view", () => {
    expect([...collapsedGroupIds("collapsed", groups, new Set(["memo-outstanding"]))]).toEqual(["master-code", "sale-report"]);
    expect([...collapsedGroupIds("expanded", groups, new Set(["memo-outstanding"]))]).toEqual(["memo-outstanding"]);
  });
});

describe("SubtaskViewMenu", () => {
  it("UT-UP-F10 closed: design icon button labelled with the current view", () => {
    const html = renderToStaticMarkup(createElement(SubtaskViewMenu, { value: "collapsed", onChange: noop }));
    expect(html).toContain('data-icon="show-subtasks"');
    expect(html).toContain('aria-label="Show subtasks: Collapsed"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="listbox"');
  });

  it("UT-UP-F12 closed button is white, grey only on hover (owner 2026-11-03)", () => {
    const html = renderToStaticMarkup(createElement(SubtaskViewMenu, { value: "collapsed", onChange: noop }));
    expect(html).toMatch(/class="[^"]*\bbg-gms-surface\b/);
    expect(html).toContain("hover:bg-gms-surface-sunken");
    expect(html).not.toMatch(/class="[^"]*(?<![:-])bg-gms-surface-sunken/);
  });
});

describe("PermissionsCard", () => {
  const card = () =>
    renderToStaticMarkup(createElement(PermissionsCard, { catalog, catalogStatus: "success", onRetry: noop, values: {}, onChange: noop }));

  it("UT-UP-F11 shows the Show subtasks menu instead of Expand All / Collapse All, groups collapsed by default", () => {
    const html = card();
    expect(html).toContain('aria-label="Show subtasks: Collapsed"');
    expect(html).not.toContain("Expand All");
    expect(html).not.toContain("Collapse All");
    expect(html).toContain("Master Code");
    expect(html).toContain('aria-label="Expand Master Code"');
    expect(html).not.toContain(">Vendor<");
    expect(html).toContain("of 4 permissions on");
  });
});
