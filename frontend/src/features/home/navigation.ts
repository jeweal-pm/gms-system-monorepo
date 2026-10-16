import {
  ArrowLeftRight,
  Barcode,
  Blend,
  Boxes,
  CalendarClock,
  ChartColumn,
  ClipboardClock,
  ClipboardList,
  FileChartColumn,
  FileCheck,
  FileCheckCorner,
  FileClock,
  FileDiff,
  FileDown,
  FileText,
  FileUp,
  House,
  Receipt,
  ReceiptText,
  RefreshCcwDot,
  RotateCcwSquare,
  Settings,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  StickyNotes,
  UnfoldVertical,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Module catalog used by the Home shortcuts fallback and as the last fallback of the
 * `/modules/[slug]` placeholder pages. The sidebar IA below is the app-navigation model;
 * this list keeps the older slugs (e.g. `memo-in`, Stone Master items) reachable.
 */
export type NavigationGroup = { title: string; items: NavigationItem[] };
/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer FE-CUS-003). */
export type NavigationItem = { label: string; slug: string; href?: string };

export function navigationHref(item: NavigationItem): string {
  return item.href ?? `/modules/${item.slug}`;
}

export const navigationGroups: NavigationGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }, { label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Company", items: [{ label: "Company Profile", slug: "company-profile", href: "/setup/company-profile" }, { label: "Bank", slug: "bank" }] },
  // vendor FE-VEN-002: Vendor has a real page (Home shortcut fallback); `/modules/vendor` still renders.
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }] },
  { title: "Stone Master", items: ["Stone Group", "Stone", "Shape", "Size", "Color", "Cutting", "Quality", "Clarity"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
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
  icon?: LucideIcon;
  activePrefix?: string;
  activeHrefs?: readonly string[];
};
/** A collapsible parent (disclosure button, no route) with link children. */
export type NavDisclosure = { kind: "disclosure"; id: string; label: string; icon: LucideIcon; children: NavLink[] };
export type NavEntry = NavLink | NavDisclosure;
/** A sidebar section; `title` renders the small grey group label (untitled = top section). */
export type NavSection = { id: string; title?: string; items: NavEntry[] };
/** Collapsed-rail button: a route, or a group that expands the sidebar at `sectionId` (Q-NAV-02). */
export type RailModule = { id: string; label: string; icon: LucideIcon } & ({ kind: "link"; link: NavLink } | { kind: "section"; sectionId: string });

/**
 * Setup-owned placeholder destinations (Setup landing tiles and the Master Code modal, Q-NAV-05).
 * `masterCode` adds "Master Code" to the breadcrumb chain (the modal itself has no route).
 */
export const setupOwnedPlaceholders = [
  { slug: "notifications", label: "Notifications", masterCode: false },
  { slug: "currency", label: "Currency", masterCode: true },
  { slug: "stone-master", label: "Stone Master", masterCode: true },
  { slug: "location-master", label: "Location Master", masterCode: true },
  { slug: "certificate-master", label: "Certificate Master", masterCode: true },
  { slug: "labor-name", label: "Labor Name", masterCode: true },
  { slug: "sale-person", label: "Sale Person", masterCode: true },
] as const;

export type SetupPlaceholderSlug = (typeof setupOwnedPlaceholders)[number]["slug"];

/** Label and route of a Setup-owned placeholder, so Setup tiles share this single source. */
export function setupPlaceholderLink(slug: SetupPlaceholderSlug): { label: string; href: string } {
  const entry = setupOwnedPlaceholders.find((item) => item.slug === slug);
  return { label: entry?.label ?? slug, href: moduleHref(slug) };
}

const link = (id: string, label: string, icon?: LucideIcon, href = moduleHref(id)): NavLink => ({ kind: "link", id, label, href, icon });
const disclosure = (id: string, label: string, icon: LucideIcon, children: NavLink[]): NavDisclosure => ({ kind: "disclosure", id, label, icon, children });

const homeLink: NavLink = { kind: "link", id: "home", label: "Home", href: "/", icon: House };
const dashboardLink = link("dashboard", "Dashboard", ChartColumn);
/** D-02: Setup opens the `/setup` landing and stays active on `/setup/*` and its placeholders. */
const setupLink: NavLink = {
  kind: "link",
  id: "setup",
  label: "Setup",
  href: "/setup",
  icon: Settings,
  activePrefix: "/setup",
  activeHrefs: setupOwnedPlaceholders.map((item) => moduleHref(item.slug)),
};
const approveLink = link("approve", "Approve", FileCheckCorner);

/** Sidebar order, labels and icons from S3/S2; Account and Report groups are the Q-NAV-01 defaults. */
export const sidebarSections: NavSection[] = [
  { id: "main", items: [homeLink, dashboardLink, setupLink, approveLink] },
  { id: "pre-sale", title: "Pre-Sale", items: [link("quotation", "Quotation", Receipt), link("reserve", "Reserve", FileCheck)] },
  {
    id: "memo",
    title: "Memo",
    items: [
      link("memo-receive", "Memo Receive", FileDown),
      link("memo-return", "Memo Return", RotateCcwSquare),
      link("memo-out", "Memo Out", FileUp),
      link("memo-out-return", "Memo Out Return", RefreshCcwDot),
      // DV-03: the design text "From Vender" is spelled "From Vendor".
      disclosure("memo-outstanding", "Memo Outstanding", FileClock, [
        link("memo-outstanding-from-vendor", "From Vendor"),
        link("memo-outstanding-from-customer", "From Customer"),
      ]),
    ],
  },
  {
    id: "purchase-order",
    title: "Purchase Order",
    items: [
      link("purchase-order", "Purchase Order (PO)", ReceiptText),
      link("purchase", "Purchase (PU)", ShoppingBasket),
      link("purchase-outstanding", "Purchase Outstanding", ClipboardClock),
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    items: [
      link("load-to-stock", "Load to Stock", CalendarClock),
      link("merge-split", "Merge/Split", UnfoldVertical),
      link("stock-transfer-location", "Stock Transfer Location", Blend),
      link("stock-adjustment", "Stock Adjustment", FileDiff),
      link("barcode-printing", "Barcode Printing", Barcode),
    ],
  },
  { id: "sale", title: "Sale", items: [link("sale", "Sale", ShoppingBag)] },
  {
    id: "account",
    title: "Account",
    items: [disclosure("account-outstanding", "Account Outstanding", FileClock, [link("os-payable", "O/S Payable"), link("os-receivable", "O/S Receivable")])],
  },
  {
    id: "report",
    title: "Report",
    items: [
      disclosure("stock-movement", "Stock Movement", FileChartColumn, [
        link("stock-movement-primary", "Primary Stock"),
        link("stock-movement-consignment", "Consignment Stock"),
      ]),
      disclosure("closing-stock", "Closing Stock", Blend, [link("closing-stock-primary", "Primary Stock"), link("closing-stock-consignment", "Consignment Stock")]),
      disclosure("sale-report", "Sale Report", ReceiptText, [
        link("sale-report-compare-with-costing", "Compare With Costing"),
        link("sale-report-shareholder", "Shareholder Report"),
        link("sale-report-commission", "Commission Report"),
      ]),
    ],
  },
];

/** Collapsed rail (S1) in the expanded order; Report's clipboard-list glyph moves to the end (DV-04). */
export const railModules: RailModule[] = [
  { id: "home", label: "Home", icon: House, kind: "link", link: homeLink },
  { id: "dashboard", label: "Dashboard", icon: ChartColumn, kind: "link", link: dashboardLink },
  { id: "setup", label: "Setup", icon: Settings, kind: "link", link: setupLink },
  { id: "approve", label: "Approve", icon: FileCheckCorner, kind: "link", link: approveLink },
  { id: "pre-sale", label: "Pre-Sale", icon: ShoppingCart, kind: "section", sectionId: "pre-sale" },
  { id: "memo", label: "Memo", icon: StickyNotes, kind: "section", sectionId: "memo" },
  { id: "purchase-order", label: "Purchase Order", icon: FileText, kind: "section", sectionId: "purchase-order" },
  { id: "inventory", label: "Inventory", icon: Boxes, kind: "section", sectionId: "inventory" },
  { id: "sale", label: "Sale", icon: ShoppingBag, kind: "section", sectionId: "sale" },
  { id: "account", label: "Account", icon: Wallet, kind: "section", sectionId: "account" },
  { id: "report", label: "Report", icon: ClipboardList, kind: "section", sectionId: "report" },
];

/** A context-panel group: a link row (`href`) with its child pages listed below it. */
export type ContextNavGroup = { id: string; label: string; icon: LucideIcon; href: string; children: NavLink[] };
/** Context panel shown beside the rail on the pages of its groups (app-navigation revision 2). */
export type ContextNav = { id: string; title: string; groups: ContextNavGroup[] };

/** Opens `/setup` with the Master Code modal already open (read by the Setup landing). */
export const masterCodeDialogHref = "/setup?dialog=master-code";

/** Setup › Partner master context (source 06): Partner master returns to Setup with Master Code open. */
const setupContextNav: ContextNav = {
  id: "setup",
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

const contextNavs: ContextNav[] = [setupContextNav];

/** The context panel for the current route, or null when the route uses the normal sidebar. */
export function contextNavFor(pathname: string): ContextNav | null {
  return contextNavs.find((nav) => nav.groups.some((group) => group.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`)))) ?? null;
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

/** Breadcrumbs for a `/modules/<slug>` placeholder; unknown slugs keep `label: null` ("ไม่พบเมนู"). */
export function moduleBreadcrumbs(slug: string): { label: string | null; breadcrumbs: Breadcrumb[] } {
  const entry = placeholderCatalog.get(slug);
  if (entry) return { label: entry.label, breadcrumbs: entry.breadcrumbs };
  for (const group of navigationGroups) {
    const item = group.items.find((candidate) => candidate.slug === slug);
    if (item) return { label: item.label, breadcrumbs: [homeCrumb, { label: group.title }, { label: item.label }] };
  }
  return { label: null, breadcrumbs: [homeCrumb, { label: "Module" }] };
}
