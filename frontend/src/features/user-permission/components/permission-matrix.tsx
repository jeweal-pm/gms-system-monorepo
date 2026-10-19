"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { PERMISSION_ACTIONS, type CatalogNode } from "../api";
import { aggregateState, applicableKeys, editableKeys, leafNodes, toggleCells, type PermissionValues } from "../permission-utils";
import { cx, focusRing } from "@/components/ui/button";
import { DisabledCheckbox, TriStateCheckbox } from "@/components/ui/checkbox";

type PermissionMatrixProps = {
  /** Visible (search/filter-applied) catalog tree. */
  nodes: readonly CatalogNode[];
  values: PermissionValues;
  /** Omit for a read-only matrix (view mode or locked Super Admin). */
  onChange?: (values: PermissionValues) => void;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  /** While searching, matching groups are always expanded. */
  forceExpand: boolean;
  /** ID of the Super Admin lock banner, linked to every locked cell. */
  lockedDescriptionId?: string;
  /** DA-02: keys the signed-in user may change; other cells are disabled. Null/undefined = all. */
  grantable?: ReadonlySet<string> | null;
};

const cellBorder = "border-b border-gms-border";
/** The Select All row sticks right under the 42 px header row while the table scrolls (owner 2026-10-17). */
const stickySelectAll = "sticky top-[42px] z-10 bg-gms-surface-muted";

/**
 * C-13 PermissionMatrix v2 (rev2-01..03): 9 action columns, "Select All",
 * section headings, group rows with "N sub-menus" and a chevron, and leaf
 * rows. Section/group/Select All states are derived from the visible leaf
 * cells and are never sent as grants. Non-applicable cells render "—".
 * Every action implies VIEW (view-dependency.md, toggleCells). Row keys are kind-prefixed:
 * section `purchase` and leaf `purchase` share a catalog key.
 */
export function PermissionMatrix({ nodes, values, onChange, collapsed, onToggleGroup, forceExpand, lockedDescriptionId, grantable }: PermissionMatrixProps) {
  /** One row of cells aggregating the leaves under `scope`. */
  function cells(label: string, scope: readonly CatalogNode[], className?: string) {
    return PERMISSION_ACTIONS.map((action) => {
      const keys = applicableKeys(scope, action);
      const state = aggregateState(keys, values);
      const editable = editableKeys(keys, grantable);
      const name = `${label} ${action}`;
      return (
        <td key={action} className={cx("h-full text-center align-middle", className)}>
          {state === null ? (
            <>
              <span aria-hidden className="text-gms-text-placeholder">—</span>
              <span className="sr-only">{`${name}: not applicable`}</span>
            </>
          ) : onChange && editable.length > 0 ? (
            <TriStateCheckbox
              label={name}
              state={aggregateState(editable, values) ?? state}
              onToggle={() => onChange(toggleCells(editable, values, leafNodes(scope)))}
            />
          ) : (
            <DisabledCheckbox label={name} state={state} describedBy={lockedDescriptionId} />
          )}
        </td>
      );
    });
  }

  function leafRow(node: CatalogNode, nested: boolean) {
    return (
      <tr key={`leaf:${node.id}`} className={nested ? "bg-gms-surface" : "bg-gms-surface-muted"}>
        <th
          scope="row"
          className={cx(
            "text-left",
            cellBorder,
            nested ? "h-[42px] pl-[75px] font-normal text-gms-text-secondary" : "h-[50px] pl-[50px] font-semibold text-gms-text",
          )}
        >
          <span className="block truncate">{node.label}</span>
        </th>
        {cells(node.label, [node], cellBorder)}
      </tr>
    );
  }

  function groupRows(node: CatalogNode) {
    const isCollapsed = !forceExpand && collapsed.has(node.id);
    const count = node.children.length;
    return (
      <Fragment key={`group:${node.id}`}>
        <tr className="bg-gms-surface-muted">
          <th scope="row" className={cx("h-[50px] pl-[22px] text-left font-semibold text-gms-text", cellBorder)}>
            <div className="flex min-w-0 items-center">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${node.label}`}
                onClick={() => onToggleGroup(node.id)}
                className={cx("mr-2 shrink-0 rounded-gms-sm p-0.5 text-gms-text", focusRing)}
              >
                <ChevronDown size={18} aria-hidden className={cx("transition-transform", isCollapsed && "-rotate-90")} />
              </button>
              <span className="truncate">{node.label}</span>
              <span className="ml-4 shrink-0 text-gms-label font-normal text-gms-text">{`${count} sub-menu${count === 1 ? "" : "s"}`}</span>
            </div>
          </th>
          {cells(node.label, [node], cellBorder)}
        </tr>
        {!isCollapsed && node.children.map((child) => leafRow(child, true))}
      </Fragment>
    );
  }

  function nodeRows(node: CatalogNode): ReactNode {
    if (node.kind === "leaf") return leafRow(node, false);
    if (node.kind === "group") return groupRows(node);
    return (
      <Fragment key={`section:${node.id}`}>
        <tr className="bg-gms-surface">
          {/* Labels are rendered as delivered by the catalog (SETUP… in caps, "Memo" in title case per design). */}
          <th scope="rowgroup" colSpan={PERMISSION_ACTIONS.length + 1} className={cx("h-[42px] pl-4 text-left font-semibold text-gms-primary", cellBorder)}>
            {node.label}
          </th>
        </tr>
        {node.children.map((child) => (child.kind === "group" ? groupRows(child) : leafRow(child, false)))}
      </Fragment>
    );
  }

  return (
    // The table is its own scroll area (both directions, owner 2026-10-17): the page stays still and the
    // header row sticks to the top of the table.
    <div className="min-h-0 flex-1 overflow-auto print:overflow-visible">
      <table className="w-full min-w-[960px] table-fixed border-separate border-spacing-0 text-gms-body text-gms-text">
        <colgroup>
          <col className="w-[31%]" />
          {PERMISSION_ACTIONS.map((action) => <col key={action} />)}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 z-10 h-[42px] border-b border-gms-border bg-gms-page pl-3 text-left text-gms-body font-medium uppercase">
              Menu
            </th>
            {PERMISSION_ACTIONS.map((action) => (
              <th key={action} scope="col" className="sticky top-0 z-10 h-[42px] border-b border-gms-border bg-gms-page text-center text-gms-body font-medium">
                {action}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-gms-surface-muted">
            <th scope="row" className={cx("h-[42px] pl-[46px] text-left font-semibold", cellBorder, stickySelectAll)}>Select All</th>
            {cells("Select All", nodes, cx(cellBorder, stickySelectAll))}
          </tr>
          {nodes.map((node) => nodeRows(node))}
        </tbody>
      </table>
    </div>
  );
}
