/**
 * Permission catalog v1 (ADR-0016, user-permission SA revision 1).
 * Menu keys reuse the navigation slugs. Pending owner confirmation (Q-UP-13), every leaf
 * has all six actions: 34 leaves x 6 = 204 applicable cells. Changing the catalog is a code
 * change only; stored grants for removed cells are ignored (filtered on read).
 */
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "PRICE"] as const;
export type PermissionActionValue = (typeof PERMISSION_ACTIONS)[number];

export type CatalogNode = {
  key: string;
  label: string;
  actions?: PermissionActionValue[];
  children?: CatalogNode[];
};

export const CATALOG_VERSION = 1 as const;
export const MAX_CATALOG_LEAVES = 64;
export const MAX_GRANTS_PER_USER = MAX_CATALOG_LEAVES * PERMISSION_ACTIONS.length;
export const KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

const leaf = (key: string, label: string): CatalogNode => ({ key, label, actions: [...PERMISSION_ACTIONS] });
const slugLeaves = (labels: string[]) => labels.map((label) => leaf(label.toLowerCase().replaceAll(" ", "-"), label));

export const PERMISSION_CATALOG: readonly CatalogNode[] = [
  leaf("quotation", "Quotation"),
  leaf("reserve", "Reserve"),
  leaf("sale", "Sale"),
  { key: "company", label: "Company", children: [leaf("company-profile", "Company Profile"), leaf("bank", "Bank")] },
  { key: "partner-master", label: "Partner Master", children: [leaf("vendor", "Vendor"), leaf("customer", "Customer")] },
  { key: "stone-master", label: "Stone Master", children: slugLeaves(["Stone Group", "Stone", "Shape", "Size", "Color", "Cutting", "Quality", "Clarity", "Stone Code"]) },
  { key: "purchase-order-group", label: "Purchase Order", children: [leaf("purchase-order", "Purchase Order"), leaf("purchase", "Purchase (PU)")] },
  { key: "memo", label: "Memo", children: slugLeaves(["Memo In", "Memo Return", "Memo Out", "Memo Out Return"]) },
  { key: "inventory", label: "Inventory", children: slugLeaves(["Load", "Primary", "Consignment", "Movement", "Memo Outstanding"]) },
  { key: "finance", label: "Finance", children: [leaf("receivable", "Receivable"), leaf("payable", "Payable")] },
  { key: "setup", label: "Setup", children: slugLeaves(["Main Location", "Sub Location", "Currency", "Certificate Type", "Labour Type"]) },
];

const leafActions = new Map<string, ReadonlySet<PermissionActionValue>>();
for (const node of PERMISSION_CATALOG) {
  for (const item of node.children ?? [node]) {
    if (!item.actions || !KEY_PATTERN.test(item.key) || leafActions.has(item.key)) throw new Error("Invalid permission catalog");
    leafActions.set(item.key, new Set(item.actions));
  }
}
if (leafActions.size > MAX_CATALOG_LEAVES) throw new Error("Permission catalog exceeds the leaf bound");

export const APPLICABLE_COUNT = [...leafActions.values()].reduce((total, actions) => total + actions.size, 0);
export const CATALOG_LEAF_KEYS: readonly string[] = [...leafActions.keys()];

export function catalogResponse() {
  return { version: CATALOG_VERSION, nodes: PERMISSION_CATALOG, applicableCount: APPLICABLE_COUNT };
}

export function isGrantInCatalog(menuKey: string, action: string) {
  return leafActions.get(menuKey)?.has(action as PermissionActionValue) ?? false;
}

/** Parses `menuKey:ACTION`; returns null when the key is malformed or not in the catalog. */
export function parsePermissionKey(key: string): { menuKey: string; action: PermissionActionValue } | null {
  const separator = key.lastIndexOf(":");
  if (separator <= 0) return null;
  const menuKey = key.slice(0, separator);
  const action = key.slice(separator + 1);
  if (!KEY_PATTERN.test(menuKey) || !isGrantInCatalog(menuKey, action)) return null;
  return { menuKey, action: action as PermissionActionValue };
}

export function toPermissionKey(menuKey: string, action: string) {
  return `${menuKey}:${action}`;
}
