/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer FE-CUS-003). */
export type NavigationItem = { label: string; slug: string; href?: string };
export type NavigationGroup = { title: string; items: NavigationItem[] };

export function navigationHref(item: NavigationItem): string {
  return item.href ?? `/modules/${item.slug}`;
}

export const navigationGroups: NavigationGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }, { label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Company", items: [{ label: "Company Profile", slug: "company-profile" }, { label: "Bank", slug: "bank" }] },
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }] },
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
