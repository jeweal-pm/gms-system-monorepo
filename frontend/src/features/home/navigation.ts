import {
  ChartColumn,
  Crown,
  FileCheck,
  FileSearch,
  FileText,
  FileUser,
  House,
  ReceiptText,
  Settings,
  UserCog,
  type LucideIcon,
} from "lucide-react";

/**
 * Module catalog used by the Home shortcuts fallback and the `/modules/[slug]`
 * placeholder pages. The sidebar no longer shows every entry (FE-UP-017 follows
 * source images 06–08), but every route stays reachable through these shortcuts.
 */
export type NavigationGroup = { title: string; items: NavigationItem[] };
/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer FE-CUS-003). */
export type NavigationItem = { label: string; slug: string; href?: string };

export function navigationHref(item: NavigationItem): string {
  return item.href ?? `/modules/${item.slug}`;
}

export const navigationGroups: NavigationGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }, { label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Company", items: [{ label: "Company Profile", slug: "company-profile" }, { label: "Bank", slug: "bank" }] },
  // vendor FE-VEN-002: Vendor has a real page (Home shortcut fallback); `/modules/vendor` still renders.
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }] },
  { title: "Stone Master", items: ["Stone Group", "Stone", "Shape", "Size", "Color", "Cutting", "Quality", "Clarity"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Purchase Order", items: [{ label: "Purchase Order", slug: "purchase-order" }, { label: "Purchase (PU)", slug: "purchase" }] },
  { title: "Memo", items: ["Memo In", "Memo Return", "Memo Out", "Memo Out Return"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Inventory", items: ["Load", "Primary", "Consignment", "Movement", "Memo Outstanding"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Finance", items: [{ label: "Receivable", slug: "receivable" }, { label: "Payable", slug: "payable" }] },
  { title: "Setup", items: ["Main Location", "Sub Location", "Currency", "Certificate Type", "Labour Type"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
];

export const reportLibraryItems = ["Primary", "Consignment", "Movement", "Cons Mov", "Stock ADJ"].map((label) => ({
  label,
  slug: `report-${label.toLowerCase().replaceAll(" ", "-")}`,
}));

export function moduleHref(slug: string) {
  return `/modules/${slug}`;
}

/** One sidebar link. `activePrefix` also marks the item active for nested routes. */
export type NavItem = { label: string; href: string; icon: LucideIcon; activePrefix?: string };
/** A sidebar section; `title` renders the small grey group label, `divider` a rule above it. */
export type NavSection = { id: string; title?: string; divider?: boolean; items: NavItem[] };

const moduleItem = (label: string, slug: string, icon: LucideIcon): NavItem => ({ label, href: moduleHref(slug), icon });

/** Sidebar order, labels and icons from source image 06-sidebar.png (FE-UP-017). */
export const sidebarSections: NavSection[] = [
  {
    id: "main",
    items: [
      { label: "Home", href: "/", icon: House },
      moduleItem("Dashboard", "dashboard", ChartColumn),
      moduleItem("Quotation", "quotation", FileText),
      moduleItem("Reserve", "reserve", FileCheck),
    ],
  },
  {
    id: "partner-master",
    title: "Partner Master",
    // vendor FE-VEN-002: Partner Master › Vendor opens /setup/vendor.
    items: [{ label: "Vendor", href: "/setup/vendor", icon: FileUser }, { label: "Customer", href: "/setup/customer", icon: UserCog }],
  },
  {
    id: "stone-master",
    title: "Stone Master",
    items: (navigationGroups.find((group) => group.title === "Stone Master")?.items ?? []).map((item) => moduleItem(item.label, item.slug, Crown)),
  },
  { id: "purchase-order", title: "Purchase Order", items: [moduleItem("Purchase Order", "purchase-order", ReceiptText)] },
  {
    id: "report-library",
    title: "Report library",
    divider: true,
    items: reportLibraryItems.map((item) => moduleItem(item.label, item.slug, FileSearch)),
  },
];

/** Pinned to the bottom of the sidebar. Only Setup › User and permission has a page so far. */
export const sidebarFooterItems: NavItem[] = [{ label: "Setup", href: "/setup/user-permission", icon: Settings, activePrefix: "/setup" }];

export function isNavItemActive(item: NavItem, pathname: string) {
  if (pathname === item.href) return true;
  if (!item.activePrefix) return false;
  return pathname === item.activePrefix || pathname.startsWith(`${item.activePrefix}/`);
}

export type Breadcrumb = { label: string; href?: string };

/** Breadcrumbs for a `/modules/<slug>` placeholder: Home › group (when titled) › module. */
export function moduleBreadcrumbs(slug: string): { label: string | null; breadcrumbs: Breadcrumb[] } {
  const home: Breadcrumb = { label: "Home", href: "/" };
  const href = moduleHref(slug);
  for (const section of sidebarSections) {
    const item = section.items.find((entry) => entry.href === href);
    if (item) return { label: item.label, breadcrumbs: [home, ...(section.title ? [{ label: section.title }] : []), { label: item.label }] };
  }
  for (const group of navigationGroups) {
    const item = group.items.find((entry) => entry.slug === slug);
    if (item) return { label: item.label, breadcrumbs: [home, { label: group.title }, { label: item.label }] };
  }
  return { label: null, breadcrumbs: [home, { label: "Module" }] };
}
