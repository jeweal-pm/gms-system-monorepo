import type { CheckState } from "@/components/ui/checkbox";
import type { CatalogNode, PermissionAction } from "./api";

export type { CheckState };
export type PermissionValues = Record<string, boolean>;

export const permissionKey = (menuId: string, action: PermissionAction) => `${menuId}:${action}`;

/** Leaf menus (the only nodes that carry real permission cells) under `nodes`. */
export function leafNodes(nodes: readonly CatalogNode[]): CatalogNode[] {
  return nodes.flatMap((node) => (node.kind === "leaf" ? [node] : leafNodes(node.children)));
}

/** Keys of every applicable (leaf, action) cell under `nodes`, optionally for one action. */
export function applicableKeys(nodes: readonly CatalogNode[], action?: PermissionAction): string[] {
  return leafNodes(nodes).flatMap((leaf) =>
    leaf.actions.filter((entry) => action === undefined || entry === action).map((entry) => permissionKey(leaf.id, entry)),
  );
}

export function aggregateState(keys: readonly string[], values: PermissionValues): CheckState | null {
  if (keys.length === 0) return null;
  const on = keys.filter((key) => values[key]).length;
  if (on === 0) return "unchecked";
  return on === keys.length ? "checked" : "indeterminate";
}

/** Clicking an aggregate sets every key on unless all are already on. */
export function toggleKeys(keys: readonly string[], values: PermissionValues): PermissionValues {
  const turnOn = aggregateState(keys, values) !== "checked";
  const next = { ...values };
  for (const key of keys) {
    if (turnOn) next[key] = true;
    else delete next[key];
  }
  return next;
}

/** Number of checked cells that are applicable in the current catalog (stale keys are not counted). */
export function countEnabled(nodes: readonly CatalogNode[], values: PermissionValues) {
  return applicableKeys(nodes).filter((key) => values[key]).length;
}

export function valuesFromKeys(keys: readonly string[]): PermissionValues {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

/** Saved grants -> matrix values. "ALL" (Super Admin) checks every applicable cell, PRINT/EXCEL included. */
export function valuesFromGrants(grants: readonly string[] | "ALL", nodes: readonly CatalogNode[] | undefined): PermissionValues {
  if (grants === "ALL") return valuesFromKeys(nodes ? applicableKeys(nodes) : []);
  return valuesFromKeys(grants);
}

/** Form values -> grant keys, keeping only leaf cells that exist in the current catalog (max 347 in v2). */
export function grantsFromValues(values: PermissionValues, nodes: readonly CatalogNode[]): string[] {
  return applicableKeys(nodes).filter((key) => values[key]);
}

export type PermissionFilter = "all" | "on" | "off";

/**
 * Search + "All Permissions" filter. A label match on a section or group keeps
 * its whole subtree; a leaf is kept when it (or an ancestor) matches the query
 * and passes the on/off filter. Empty sections and groups are pruned.
 */
export function filterCatalog(
  nodes: readonly CatalogNode[],
  query: string,
  filter: PermissionFilter,
  values: PermissionValues,
): CatalogNode[] {
  const needle = query.trim().toLowerCase();
  const passesFilter = (leaf: CatalogNode) => {
    if (filter === "all") return true;
    const anyOn = leaf.actions.some((action) => values[permissionKey(leaf.id, action)]);
    return filter === "on" ? anyOn : !anyOn;
  };
  const walk = (list: readonly CatalogNode[], ancestorMatched: boolean): CatalogNode[] =>
    list.flatMap((node) => {
      const matched = ancestorMatched || needle === "" || node.label.toLowerCase().includes(needle);
      if (node.kind === "leaf") return matched && passesFilter(node) ? [node] : [];
      const children = walk(node.children, matched);
      return children.length > 0 ? [{ ...node, children }] : [];
    });
  return walk(nodes, false);
}

/** IDs of every group node (collapsible rows). */
export function groupIds(nodes: readonly CatalogNode[]): string[] {
  return nodes.flatMap((node) => [...(node.kind === "group" ? [node.id] : []), ...groupIds(node.children)]);
}
