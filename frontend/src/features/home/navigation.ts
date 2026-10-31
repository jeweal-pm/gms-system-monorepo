import { ArrowLeftRight, Boxes, ClipboardList, FileText, Receipt, ShoppingCart, StickyNotes, Wallet, type LucideIcon } from "lucide-react";
import {
  ApproveIcon,
  BarcodeIcon,
  BoxClockIcon,
  ClosingStockIcon,
  DashboardIcon,
  FileOutstandingIcon,
  HomeIcon,
  MemoOutIcon,
  MemoOutReturnIcon,
  MemoReceiveIcon,
  MemoReturnIcon,
  PurchaseIcon,
  PurchaseOrderIcon,
  PurchaseOutstandingIcon,
  QuotationIcon,
  ReserveIcon,
  SaleIcon,
  SaleReportIcon,
  SetupIcon,
  SplitVerticalIcon,
  StockTransferIcon,
  type NavIcon,
} from "./nav-icons";
import { DEFAULT_STONE_SLUG, STONE_MENU_KEY, STONE_PAGES, stonePageHref } from "@/features/stone-master/kinds";

/**
 * Module catalog used by the Home shortcuts fallback and as the last fallback of the
 * `/modules/[slug]` placeholder pages. The sidebar IA below is the app-navigation model;
 * this list keeps the older slugs (e.g. `memo-in`, Stone Master items) reachable.
 */
export type NavigationGroup = { title: string; items: NavigationItem[] };
/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer FE-CUS-003). */
export type NavigationItem = { label: string; slug: string; href?: string };

/**
 * Menu keys that have a real page. Home shortcuts come from the gateway with the menu key only
 * (owner 2026-10-20: Home must open the real pages, not the `/modules` placeholders).
 */
export const REAL_PAGE_HREFS: Readonly<Record<string, string>> = {
  "company-profile": "/setup/company-profile",
  "user-and-permission": "/setup/user-permission",
  vendor: "/setup/vendor",
  customer: "/setup/customer",
  "stone-master": stonePageHref(DEFAULT_STONE_SLUG),
  "document-setup": "/setup/document-setup",
  currency: "/setup/currency",
  quotation: "/pre-sale/quotation",
  "memo-receive": "/memo/memo-receive",
  "memo-return": "/memo/memo-return",
  "memo-out": "/memo/memo-out",
  "memo-out-return": "/memo/memo-out-return",
  // memo-outstanding-vendor UI rev 1 (ADR-0035): Memo Outstanding › Vendor.
  "memo-outstanding-from-vendor": "/memo/memo-outstanding/vendor",
};

export function navigationHref(item: NavigationItem): string {
  return item.href ?? REAL_PAGE_HREFS[item.slug] ?? `/modules/${item.slug}`;
}

export const navigationGroups: NavigationGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }, { label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Company", items: [{ label: "Company Profile", slug: "company-profile", href: "/setup/company-profile" }, { label: "Bank", slug: "bank" }] },
  // vendor FE-VEN-002: Vendor has a real page (Home shortcut fallback); `/modules/vendor` still renders.
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }] },
  // stone-master FE-SM-002: real pages under /setup/stone-master (the old `stone` slug is Stone Name).
  { title: "Stone Master", items: STONE_PAGES.map((page) => ({ label: page.navLabel, slug: page.slug, href: stonePageHref(page.slug) })) },
  { title: "Purchase Order", items: [{ label: "Purchase Order", slug: "purchase-order" }, { label: "Purchase (PU)", slug: "purchase" }] },
  { title: "Memo", items: ["Memo In", "Memo Return", "Memo Out", "Memo Out Return"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Inventory", items: ["Load", "Primary", "Consignment", "Movement", "Memo Outstanding"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Finance", items: [{ label: "Receivable", slug: "receivable" }, { label: "Payable", slug: "payable" }] },
  { title: "Setup", items: ["Main Location", "Sub Location", "Currency", "Certificate Type", "Labour Type"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
];

export function moduleHref(slug: string) {
  return `/modules/${slug}`;
}

/* ---------- app-navigation UI revision 1 (FE-NAV-001; ui-spec "Navigation IA and route mapping") ---------- */

/**
 * One navigable entry. `activePrefix` marks it active for nested routes as well;
 * `activeHrefs` lists further exact routes that belong to it (e.g. Setup-owned placeholders).
 */
export type NavLink = {
  kind: "link";
  id: string;
  label: string;
  href: string;
  icon?: NavIcon;
  activePrefix?: string;
  activeHrefs?: readonly string[];
  /**
   * Permission catalog keys; the link is shown when the user has VIEW on any of them (owner
   * 2026-10-17). Undefined = no permission exists for it (Home, Approve, placeholders): always shown.
   */
  permission?: readonly string[];
};
/** A collapsible parent (disclosure button, no route) with link children. */
export type NavDisclosure = { kind: "disclosure"; id: string; label: string; icon: NavIcon; children: NavLink[] };
export type NavEntry = NavLink | NavDisclosure;
/** A sidebar section; `title` renders the small grey group label (untitled = top section). */
export type NavSection = { id: string; title?: string; items: NavEntry[] };
/** Collapsed-rail button: a route, or a group that expands the sidebar at `sectionId` (Q-NAV-02). */
export type RailModule = { id: string; label: string; icon: NavIcon } & ({ kind: "link"; link: NavLink } | { kind: "section"; sectionId: string });

/**
 * Setup-owned placeholder destinations (Setup landing tiles and the Master Code modal, Q-NAV-05).
 * `masterCode` adds "Master Code" to the breadcrumb chain (the modal itself has no route).
 */
export const setupOwnedPlaceholders = [
  { slug: "notifications", label: "Notifications", masterCode: false },
  { slug: "document-setup", label: "Document Setup", masterCode: false },
  { slug: "currency", label: "Currency", masterCode: true },
  { slug: "stone-master", label: "Stone Master", masterCode: true },
  { slug: "location-master", label: "Location Master", masterCode: true },
  { slug: "certificate-master", label: "Certificate Master", masterCode: true },
  // Owner 2026-10-20: shown as "Service Fee"; the slug and permission key stay `labor-name`.
  { slug: "labor-name", label: "Service Fee", masterCode: true },
  { slug: "sale-person", label: "Sale Person", masterCode: true },
] as const;

export type SetupPlaceholderSlug = (typeof setupOwnedPlaceholders)[number]["slug"];

/** Label and route of a Setup-owned placeholder, so Setup tiles share this single source. */
export function setupPlaceholderLink(slug: SetupPlaceholderSlug): { label: string; href: string } {
  const entry = setupOwnedPlaceholders.find((item) => item.slug === slug);
  return { label: entry?.label ?? slug, href: moduleHref(slug) };
}

/** Navigation id → permission catalog leaf key (catalog v2, ADR-0020) where the two differ. */
const CATALOG_KEY_ALIASES: Readonly<Record<string, string>> = {
  "barcode-printing": "barcode",
  "memo-outstanding-from-vendor": "memo-outstanding-vendor",
  "memo-outstanding-from-customer": "memo-outstanding-customer",
  "os-payable": "outstanding-payable",
  "os-receivable": "outstanding-receivable",
  "sale-report-compare-with-costing": "sale-report-costing",
  "certificate-master": "certificate-type",
};

/** Master Code sub-menus in the catalog (Setup › Master Code). */
export const MASTER_CODE_MENU_KEYS = ["vendor", "customer", "currency", "stone-master", "location-master", "certificate-type", "labor-name", "sale-person"] as const;
/** Every Setup leaf in the catalog; Setup is visible when any of them is. */
export const SETUP_MENU_KEYS = ["company-profile", "user-and-permission", "notifications", "document-setup", ...MASTER_CODE_MENU_KEYS] as const;

const CATALOG_LEAF_KEYS: ReadonlySet<string> = new Set([
  "dashboard", ...SETUP_MENU_KEYS, "quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return",
  "memo-outstanding-vendor", "memo-outstanding-customer", "purchase-order", "purchase", "purchase-outstanding", "load-to-stock",
  "merge-split", "stock-transfer-location", "stock-adjustment", "barcode", "sale", "payable", "receivable", "outstanding-payable",
  "outstanding-receivable", "stock-movement-primary", "stock-movement-consignment", "closing-stock-primary", "closing-stock-consignment",
  "sale-report-costing", "sale-report-shareholder", "sale-report-commission",
]);

/** The catalog key that gates a navigation id, or undefined when the catalog has none. */
export function menuKeyFor(id: string): string | undefined {
  const key = CATALOG_KEY_ALIASES[id] ?? id;
  return CATALOG_LEAF_KEYS.has(key) ? key : undefined;
}

function permissionFor(id: string): readonly string[] | undefined {
  const key = menuKeyFor(id);
  return key ? [key] : undefined;
}

const link = (id: string, label: string, icon?: NavIcon, href = moduleHref(id)): NavLink => ({ kind: "link", id, label, href, icon, permission: permissionFor(id) });
const disclosure = (id: string, label: string, icon: NavIcon, children: NavLink[]): NavDisclosure => ({ kind: "disclosure", id, label, icon, children });

const homeLink: NavLink = { kind: "link", id: "home", label: "Home", href: "/", icon: HomeIcon };
const dashboardLink = link("dashboard", "Dashboard", DashboardIcon);
/** D-02: Setup opens the `/setup` landing and stays active on `/setup/*` and its placeholders. */
const setupLink: NavLink = {
  kind: "link",
  id: "setup",
  label: "Setup",
  href: "/setup",
  icon: SetupIcon,
  activePrefix: "/setup",
  activeHrefs: setupOwnedPlaceholders.map((item) => moduleHref(item.slug)),
  permission: SETUP_MENU_KEYS,
};
const approveLink = link("approve", "Approve", ApproveIcon);

/**
 * Sidebar order, labels and icons from S3/S2; Account and Report groups are the Q-NAV-01 defaults.
 * Icons: the owner's design SVGs (nav-icons.tsx, 2026-10-20).
 */
export const sidebarSections: NavSection[] = [
  { id: "main", items: [homeLink, dashboardLink, setupLink, approveLink] },
  {
    id: "pre-sale",
    title: "Pre-Sale",
    items: [
      // quotation (draft ADR-0001, mock data): real page; stays active on /pre-sale/quotation/[id].
      { ...link("quotation", "Quotation", QuotationIcon, REAL_PAGE_HREFS.quotation), activePrefix: REAL_PAGE_HREFS.quotation },
      link("reserve", "Reserve", ReserveIcon),
    ],
  },
  {
    id: "memo",
    title: "Memo",
    items: [
      // memo-receive (ADR-0033, mock documents): real page; stays active on /memo/memo-receive/[id].
      { ...link("memo-receive", "Memo Receive", MemoReceiveIcon, REAL_PAGE_HREFS["memo-receive"]), activePrefix: REAL_PAGE_HREFS["memo-receive"] },
      // memo-return UI rev 1 (owner 2026-10-29): real page; stays active on /memo/memo-return/*.
      { ...link("memo-return", "Memo Return", MemoReturnIcon, REAL_PAGE_HREFS["memo-return"]), activePrefix: REAL_PAGE_HREFS["memo-return"] },
      // memo-out UI rev 1 (owner 2026-10-28): page structure; stays active on /memo/memo-out/*.
      { ...link("memo-out", "Memo Out", MemoOutIcon, REAL_PAGE_HREFS["memo-out"]), activePrefix: REAL_PAGE_HREFS["memo-out"] },
      // memo-out-return UI rev 1 (owner 2026-10-28): page structure; stays active on /memo/memo-out-return/*.
      { ...link("memo-out-return", "Memo Out Return", MemoOutReturnIcon, REAL_PAGE_HREFS["memo-out-return"]), activePrefix: REAL_PAGE_HREFS["memo-out-return"] },
      // DV-03: the design text "From Vender" is spelled "From Vendor".
      // Owner 2026-10-28: sub-items read "Vendor" / "Customer" (no "From"); ids and catalog keys unchanged.
      disclosure("memo-outstanding", "Memo Outstanding", FileOutstandingIcon, [
        link("memo-outstanding-from-vendor", "Vendor", undefined, REAL_PAGE_HREFS["memo-outstanding-from-vendor"]),
        link("memo-outstanding-from-customer", "Customer"),
      ]),
    ],
  },
  {
    id: "purchase-order",
    title: "Purchase Order",
    items: [
      link("purchase-order", "Purchase Order (PO)", PurchaseOrderIcon),
      link("purchase", "Purchase (PU)", PurchaseIcon),
      link("purchase-outstanding", "Purchase Outstanding", PurchaseOutstandingIcon),
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    items: [
      link("load-to-stock", "Load to Stock", BoxClockIcon),
      link("merge-split", "Merge/Split", SplitVerticalIcon),
      link("stock-transfer-location", "Stock Transfer Location", StockTransferIcon),
      link("stock-adjustment", "Stock Adjustment", FileOutstandingIcon),
      link("barcode-printing", "Barcode Printing", BarcodeIcon),
    ],
  },
  { id: "sale", title: "Sale", items: [link("sale", "Sale", SaleIcon)] },
  {
    id: "account",
    title: "Account",
    items: [disclosure("account-outstanding", "Account Outstanding", FileOutstandingIcon, [link("os-payable", "O/S Payable"), link("os-receivable", "O/S Receivable")])],
  },
  {
    id: "report",
    title: "Report",
    items: [
      disclosure("stock-movement", "Stock Movement", FileOutstandingIcon, [
        link("stock-movement-primary", "Primary Stock"),
        link("stock-movement-consignment", "Consignment Stock"),
      ]),
      disclosure("closing-stock", "Closing Stock", ClosingStockIcon, [link("closing-stock-primary", "Primary Stock"), link("closing-stock-consignment", "Consignment Stock")]),
      disclosure("sale-report", "Sale Report", SaleReportIcon, [
        link("sale-report-compare-with-costing", "Compare With Costing"),
        link("sale-report-shareholder", "Shareholder Report"),
        link("sale-report-commission", "Commission Report"),
      ]),
    ],
  },
];

/** Collapsed rail (S1) in the expanded order; Report's clipboard-list glyph moves to the end (DV-04). */
export const railModules: RailModule[] = [
  { id: "home", label: "Home", icon: HomeIcon, kind: "link", link: homeLink },
  { id: "dashboard", label: "Dashboard", icon: DashboardIcon, kind: "link", link: dashboardLink },
  { id: "setup", label: "Setup", icon: SetupIcon, kind: "link", link: setupLink },
  { id: "approve", label: "Approve", icon: ApproveIcon, kind: "link", link: approveLink },
  { id: "pre-sale", label: "Pre-Sale", icon: ShoppingCart, kind: "section", sectionId: "pre-sale" },
  { id: "memo", label: "Memo", icon: StickyNotes, kind: "section", sectionId: "memo" },
  { id: "purchase-order", label: "Purchase Order", icon: FileText, kind: "section", sectionId: "purchase-order" },
  { id: "inventory", label: "Inventory", icon: Boxes, kind: "section", sectionId: "inventory" },
  { id: "sale", label: "Sale", icon: SaleIcon, kind: "section", sectionId: "sale" },
  { id: "account", label: "Account", icon: Wallet, kind: "section", sectionId: "account" },
  { id: "report", label: "Report", icon: ClipboardList, kind: "section", sectionId: "report" },
];

/** A context-panel group: a link row (`href`) with its child pages listed below it. */
export type ContextNavGroup = { id: string; label: string; icon: NavIcon; href: string; children: NavLink[] };
/** Context panel shown beside the rail on the pages of its groups (app-navigation revision 2). */
export type ContextNav = { id: string; title: string; groups: ContextNavGroup[] };

/** Opens `/setup` with the Master Code modal already open (read by the Setup landing). */
export const masterCodeDialogHref = "/setup?dialog=master-code";

/** Setup › Partner master context (source 06): Partner master returns to Setup with Master Code open. */
const partnerContextNav: ContextNav = {
  id: "setup-partner",
  title: "Setup",
  groups: [
    {
      id: "partner-master",
      label: "Partner master",
      icon: Receipt,
      href: masterCodeDialogHref,
      // DV-03: the design text "Vender" is spelled "Vendor".
      children: [link("vendor", "Vendor", undefined, "/setup/vendor"), link("customer", "Customer", undefined, "/setup/customer")],
    },
  ],
};

/**
 * Setup › Stone Master context (stone-master FE-SM-002, S1 left). The Stone pages show only this group
 * (owner 2026-10-19); every page needs `stone-master:VIEW` (Q-SM-04).
 */
const stoneContextNav: ContextNav = {
  id: "setup-stone",
  title: "Setup",
  groups: [
    {
      id: "stone-master",
      label: "Stone Master",
      icon: Receipt,
      href: masterCodeDialogHref,
      children: STONE_PAGES.map((page) => ({ ...link(`stone-master-${page.slug}`, page.navLabel, undefined, stonePageHref(page.slug)), permission: [STONE_MENU_KEY] })),
    },
  ],
};

/** Setup › Currency context (currency UI rev 1, source 01 left): one group with the Currency page. */
const currencyContextNav: ContextNav = {
  id: "setup-currency",
  title: "Setup",
  groups: [
    {
      id: "currency",
      label: "Currency",
      icon: Receipt,
      href: masterCodeDialogHref,
      children: [link("currency-page", "Currency", undefined, "/setup/currency")].map((child) => ({ ...child, permission: ["currency"] })),
    },
  ],
};

const contextNavs: ContextNav[] = [partnerContextNav, stoneContextNav, currencyContextNav];

/** The context panel for the current route, or null when the route uses the normal sidebar. */
export function contextNavFor(pathname: string): ContextNav | null {
  return contextNavs.find((nav) => nav.groups.some((group) => group.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)))) ?? null;
}

/** True when the user may see an item gated by `permission` (see `NavLink.permission`). */
export type CanView = (permission: readonly string[] | undefined) => boolean;

/** Pure rule behind `useMenuAccess`: Super Admin / "ALL" see everything; others need `<key>:VIEW`. */
export function canViewWith(mine: { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] } | undefined, permission: readonly string[] | undefined): boolean {
  if (!permission) return true;
  if (!mine) return false;
  if (mine.isSuperAdmin || mine.permissions === "ALL") return true;
  const granted = mine.permissions;
  return permission.some((key) => granted.includes(`${key}:VIEW`));
}

/** Sidebar sections without the items the user may not see; empty disclosures and sections drop out. */
export function visibleSections(sections: readonly NavSection[], canView: CanView): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.flatMap((item): NavEntry[] => {
        if (item.kind === "link") return canView(item.permission) ? [item] : [];
        const children = item.children.filter((child) => canView(child.permission));
        return children.length > 0 ? [{ ...item, children }] : [];
      }),
    }))
    .filter((section) => section.items.length > 0);
}

/** Rail buttons for what is visible: links by permission, sections when they still have items. */
export function visibleRailModules(modules: readonly RailModule[], sections: readonly NavSection[], canView: CanView): RailModule[] {
  const sectionIds = new Set(sections.map((section) => section.id));
  return modules.filter((module) => (module.kind === "link" ? canView(module.link.permission) : sectionIds.has(module.sectionId)));
}

/** Context panel groups without the children the user may not see. */
export function visibleContextGroups(nav: ContextNav, canView: CanView): ContextNavGroup[] {
  return nav.groups
    .map((group) => ({ ...group, children: group.children.filter((child) => canView(child.permission)) }))
    .filter((group) => group.children.length > 0);
}

/** ⇆ icon shared by the rail "Expand sidebar" and the sidebar "Collapse sidebar" toggles. */
export const sidebarToggleIcon: LucideIcon = ArrowLeftRight;

export function isNavItemActive(item: NavLink, pathname: string) {
  if (pathname === item.href) return true;
  if (item.activeHrefs?.includes(pathname)) return true;
  if (!item.activePrefix) return false;
  return pathname === item.activePrefix || pathname.startsWith(`${item.activePrefix}/`);
}

function sectionLinks(section: NavSection): NavLink[] {
  return section.items.flatMap((item) => (item.kind === "link" ? [item] : item.children));
}

/** True when the current route belongs to any link of the section (rail group active state). */
export function isNavSectionActive(sectionId: string, pathname: string) {
  const section = sidebarSections.find((entry) => entry.id === sectionId);
  return section ? sectionLinks(section).some((item) => isNavItemActive(item, pathname)) : false;
}

/** Ids of disclosure parents whose child is the current route (opened on load/navigation). */
export function activeDisclosureIds(pathname: string): string[] {
  return sidebarSections.flatMap((section) =>
    section.items.filter((item): item is NavDisclosure => item.kind === "disclosure" && item.children.some((child) => isNavItemActive(child, pathname))).map((item) => item.id),
  );
}

export type Breadcrumb = { label: string; href?: string };

const homeCrumb: Breadcrumb = { label: "Home", href: "/" };
const setupCrumb: Breadcrumb = { label: "Setup", href: "/setup" };

type PlaceholderEntry = { label: string; breadcrumbs: Breadcrumb[] };

/**
 * slug → title and breadcrumbs for every `/modules/<slug>` route in the IA:
 * `Home › <section> › [<parent> ›] item` (untitled section: `Home › item`) and
 * `Home › Setup › [Master Code ›] item` for the Setup-owned placeholders.
 */
const placeholderCatalog: ReadonlyMap<string, PlaceholderEntry> = (() => {
  const catalog = new Map<string, PlaceholderEntry>();
  const prefix = moduleHref("");
  const add = (item: NavLink, trail: Breadcrumb[]) => {
    if (item.href.startsWith(prefix) && !catalog.has(item.href)) {
      catalog.set(item.href.slice(prefix.length), { label: item.label, breadcrumbs: [homeCrumb, ...trail, { label: item.label }] });
    }
  };
  for (const item of setupOwnedPlaceholders) {
    const entry = { label: item.label, breadcrumbs: [homeCrumb, setupCrumb, ...(item.masterCode ? [{ label: "Master Code" }] : []), { label: item.label }] };
    catalog.set(item.slug, entry);
  }
  for (const section of sidebarSections) {
    const sectionTrail = section.title ? [{ label: section.title }] : [];
    for (const item of section.items) {
      if (item.kind === "link") add(item, sectionTrail);
      else for (const child of item.children) add(child, [...sectionTrail, { label: item.label }]);
    }
  }
  return catalog;
})();

/** Breadcrumbs for a `/modules/<slug>` placeholder; unknown slugs keep `label: null` ("Menu not found"). */
export function moduleBreadcrumbs(slug: string): { label: string | null; breadcrumbs: Breadcrumb[] } {
  const entry = placeholderCatalog.get(slug);
  if (entry) return { label: entry.label, breadcrumbs: entry.breadcrumbs };
  for (const group of navigationGroups) {
    const item = group.items.find((candidate) => candidate.slug === slug);
    if (item) return { label: item.label, breadcrumbs: [homeCrumb, { label: group.title }, { label: item.label }] };
  }
  return { label: null, breadcrumbs: [homeCrumb, { label: "Module" }] };
}
