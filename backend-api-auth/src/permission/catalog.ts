/**
 * Permission catalog v2 (ADR-0020 §3, user-permission SA revision 2).
 * 39 grantable leaves: Dashboard has VIEW/APPROVE/PRICE/PRINT/EXCEL, every other leaf has all
 * nine actions, so 5 + 38 x 9 = 347 applicable cells. Sections and groups are UI structure only
 * and are never stored as grants. Changing the catalog is a code change; stored grants for
 * removed cells are ignored (filtered on read).
 */
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "APPROVE", "PRICE", "PRINT", "EXCEL"] as const;
export type PermissionActionValue = (typeof PERMISSION_ACTIONS)[number];

export type CatalogNodeKind = "section" | "group" | "leaf";
export type CatalogNode = {
  key: string;
  label: string;
  kind: CatalogNodeKind;
  actions?: PermissionActionValue[];
  children?: CatalogNode[];
};

export const CATALOG_VERSION = 2 as const;
export const MAX_CATALOG_LEAVES = 64;
export const MAX_GRANTS_PER_USER = MAX_CATALOG_LEAVES * PERMISSION_ACTIONS.length; // 576
export const KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

const leaf = (key: string, label: string, actions: readonly PermissionActionValue[] = PERMISSION_ACTIONS): CatalogNode => ({ key, label, kind: "leaf", actions: [...actions] });
const group = (key: string, label: string, children: CatalogNode[]): CatalogNode => ({ key, label, kind: "group", children });
const section = (key: string, label: string, children: CatalogNode[]): CatalogNode => ({ key, label, kind: "section", children });

export const PERMISSION_CATALOG: readonly CatalogNode[] = [
  leaf("dashboard", "Dashboard", ["VIEW", "APPROVE", "PRICE", "PRINT", "EXCEL"]),
  section("setup", "SETUP", [
    leaf("company-profile", "Company Profile"),
    leaf("user-and-permission", "User and Permission"),
    leaf("notifications", "Notifications"),
    group("master-code", "Master Code", [
      leaf("vendor", "Vendor"),
      leaf("customer", "Customer"),
      leaf("stone-master", "Stone Master"),
      leaf("location-master", "Location Master"),
      leaf("certificate-type", "Certificate Type"),
      leaf("labor-name", "Labor Name"),
      leaf("sale-person", "Sale Person"),
    ]),
  ]),
  section("pre-sale", "PRE-SALE", [leaf("quotation", "Quotation"), leaf("reserve", "Reserve")]),
  section("memo", "Memo", [
    leaf("memo-receive", "Memo Receive"),
    leaf("memo-return", "Memo Return"),
    leaf("memo-out", "Memo Out"),
    leaf("memo-out-return", "Memo Out-Return"),
    group("memo-outstanding", "Memo Outstanding", [
      leaf("memo-outstanding-vendor", "From Vendor"),
      leaf("memo-outstanding-customer", "From Customer"),
    ]),
  ]),
  section("purchase", "PURCHASE", [
    leaf("purchase-order", "Purchase Order (PO)"),
    leaf("purchase", "Purchase"),
    leaf("purchase-outstanding", "Purchase Outstanding"),
  ]),
  section("inventory", "INVENTORY", [
    leaf("load-to-stock", "Load to Stock"),
    leaf("merge-split", "Merge/Split"),
    leaf("stock-transfer-location", "Stock Transfer Location"),
    leaf("stock-adjustment", "Stock Adjustment"),
    leaf("barcode", "Barcode"),
  ]),
  section("sale-section", "SALE", [leaf("sale", "Sale")]),
  section("account", "ACCOUNT", [
    leaf("payable", "Payable"),
    leaf("receivable", "Receivable"),
    group("account-outstanding", "Account Outstanding", [
      leaf("outstanding-payable", "Outstanding Payable"),
      leaf("outstanding-receivable", "Outstanding Receivable"),
    ]),
  ]),
  section("report", "REPORT", [
    group("stock-movement", "Stock Movement", [
      leaf("stock-movement-primary", "Primary Stock"),
      leaf("stock-movement-consignment", "Consignment Stock"),
    ]),
    group("closing-stock", "Closing Stock", [
      leaf("closing-stock-primary", "Primary Stock"),
      leaf("closing-stock-consignment", "Consignment Stock"),
    ]),
    group("sale-report", "Sale Report", [
      leaf("sale-report-costing", "Compare with costing"),
      leaf("sale-report-shareholder", "Shareholder Report"),
      leaf("sale-report-commission", "Commission Report"),
    ]),
  ]),
];

// Validate the constant once at load. Leaf keys are unique (they are the grant namespace) and
// container keys are unique among containers; the two namespaces are separate, because the
// ADR-0020 section `purchase` and leaf `purchase` share a key. Leaves have actions and no
// children; containers have children and no actions.
const leafActions = new Map<string, ReadonlySet<PermissionActionValue>>();
const containerKeys = new Set<string>();
function register(nodes: readonly CatalogNode[], depth: number) {
  if (depth > 3) throw new Error("Permission catalog is nested too deeply");
  for (const node of nodes) {
    if (!KEY_PATTERN.test(node.key)) throw new Error("Invalid permission catalog key");
    if (node.kind === "leaf") {
      if (!node.actions || node.actions.length === 0 || node.children || leafActions.has(node.key)) throw new Error("Invalid permission catalog leaf");
      leafActions.set(node.key, new Set(node.actions));
    } else {
      if (!node.children || node.children.length === 0 || node.actions || containerKeys.has(node.key)) throw new Error("Invalid permission catalog container");
      containerKeys.add(node.key);
      register(node.children, depth + 1);
    }
  }
}
register(PERMISSION_CATALOG, 1);
if (leafActions.size > MAX_CATALOG_LEAVES) throw new Error("Permission catalog exceeds the leaf bound");

export const APPLICABLE_COUNT = [...leafActions.values()].reduce((total, actions) => total + actions.size, 0);
export const CATALOG_LEAF_KEYS: readonly string[] = [...leafActions.keys()];

export function catalogResponse() {
  return { version: CATALOG_VERSION, actions: [...PERMISSION_ACTIONS], nodes: PERMISSION_CATALOG, applicableCount: APPLICABLE_COUNT };
}

export function isGrantInCatalog(menuKey: string, action: string) {
  return leafActions.get(menuKey)?.has(action as PermissionActionValue) ?? false;
}

/** Parses `menuKey:ACTION`; returns null when the key is malformed or not a grantable leaf cell. */
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
