import {
  BoxClockIcon,
  MemoOutIcon,
  MemoOutReturnIcon,
  MemoReceiveIcon,
  MemoReturnIcon,
  PurchaseIcon,
  PurchaseOrderIcon,
  QuotationIcon,
  ReserveIcon,
  SplitVerticalIcon,
  StockTransferIcon,
  type NavIcon,
} from "@/features/home/nav-icons";
import type { DocumentApprovalType } from "@/features/trade-document/flow-status";

/**
 * Approve Center menu registry (approve-center UI rev 1, FE-AP-002). Order follows the sidebar (owner Q-AP-03,
 * 2026-11-07). `availability`: `available` = a document type of `approval.pending` (approval-setup ADR-0050: the eight
 * document types, Quotation included, FE-AS-009); `not-available` = no document page or API yet (Q-AP-07). Whether a
 * type's approval is on is not fixed here: it comes from `approval.summary` (`types[].requireApproval`, G13).
 */
export type ApproveMenuSlug =
  | "quotation"
  | "reserve"
  | "memo-receive"
  | "memo-return"
  | "memo-out"
  | "memo-out-return"
  | "purchase-order"
  | "purchase"
  | "load-to-stock"
  | "merge-split"
  | "transfer-location";

/** The `masterTrpc` router key of a document that can be approved today. */
export type ApprovalProc = "quotation" | "reserve" | "memoReceive" | "memoReturn" | "memoOut" | "memoOutReturn" | "purchaseOrder" | "purchase";

/** approval-setup api-contract `ApprovalType`: the kebab-case setting keys (G13), in sidebar order. */
export type ApprovalSettingType =
  | DocumentApprovalType
  | "load-to-stock"
  | "merge-split"
  | "stock-transfer-location";

export type Party = "customer" | "vendor" | "none";

type MenuBase = {
  slug: ApproveMenuSlug;
  label: string;
  icon: NavIcon;
  /** Permission catalog leaf (ADR-0020); the item is shown with `<leaf>:APPROVE` (Q-AP-13). */
  leaf: string;
  /** The approval setting / `approval.*` type key (G13). */
  type: ApprovalSettingType;
  party: Party;
};

export type AvailableMenu = MenuBase & {
  availability: "available";
  type: DocumentApprovalType;
  proc: ApprovalProc;
  /** Document page of one document, e.g. `/pre-sale/reserve/<id>`. */
  documentBase: string;
  /** Phase 1 Detail sub line prefix before the due date, e.g. "Hold until". `null` = the menu shows no date. */
  dueLabel: string | null;
  /** Approve confirm consequence for `count` lines, as the document page says it. */
  consequence: (count: number) => string;
};
export type NotAvailableMenu = MenuBase & { availability: "not-available" };
export type ApproveMenu = AvailableMenu | NotAvailableMenu;

const items = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const noLonger = "It can no longer be edited.";

export const APPROVE_MENUS: readonly ApproveMenu[] = [
  {
    slug: "quotation",
    label: "Quotation",
    icon: QuotationIcon,
    leaf: "quotation",
    type: "quotation",
    party: "customer",
    availability: "available",
    proc: "quotation",
    documentBase: "/pre-sale/quotation",
    dueLabel: "Valid until",
    // ADR-0050 Q-AS-28: an approved Quotation is read-only; approving moves no stock.
    consequence: () => "It can no longer be edited.",
  },
  {
    slug: "reserve",
    label: "Reserve",
    icon: ReserveIcon,
    leaf: "reserve",
    type: "reserve",
    party: "customer",
    availability: "available",
    proc: "reserve",
    documentBase: "/pre-sale/reserve",
    dueLabel: "Hold until",
    consequence: (count) => `Its ${items(count, "stock item is", "stock items are")} held for the customer and it can no longer be edited.`,
  },
  {
    slug: "memo-receive",
    label: "Memo Receive",
    icon: MemoReceiveIcon,
    leaf: "memo-receive",
    type: "memo-receive",
    party: "vendor",
    availability: "available",
    proc: "memoReceive",
    documentBase: "/memo/memo-receive",
    dueLabel: "Due",
    consequence: (count) => `Its ${items(count, "item moves", "items move")} to Memo Stock and it can no longer be edited.`,
  },
  {
    slug: "memo-return",
    label: "Memo Return",
    icon: MemoReturnIcon,
    leaf: "memo-return",
    type: "memo-return",
    party: "vendor",
    availability: "available",
    proc: "memoReturn",
    documentBase: "/memo/memo-return",
    dueLabel: null,
    consequence: (count) => `Its ${items(count, "item goes", "items go")} back to the vendor and come off Memo Stock. ${noLonger}`,
  },
  {
    slug: "memo-out",
    label: "Memo Out",
    icon: MemoOutIcon,
    leaf: "memo-out",
    type: "memo-out",
    party: "customer",
    availability: "available",
    proc: "memoOut",
    documentBase: "/memo/memo-out",
    dueLabel: "Due",
    consequence: (count) => `Its ${items(count, "stock item is", "stock items are")} cut from Memo Stock and it can no longer be edited.`,
  },
  {
    slug: "memo-out-return",
    label: "Memo Out Return",
    icon: MemoOutReturnIcon,
    leaf: "memo-out-return",
    type: "memo-out-return",
    party: "customer",
    availability: "available",
    proc: "memoOutReturn",
    documentBase: "/memo/memo-out-return",
    dueLabel: null,
    consequence: (count) => `Its ${items(count, "item comes", "items come")} back to stock. ${noLonger}`,
  },
  {
    slug: "purchase-order",
    label: "Purchase Order (PO)",
    icon: PurchaseOrderIcon,
    leaf: "purchase-order",
    type: "purchase-order",
    party: "vendor",
    availability: "available",
    proc: "purchaseOrder",
    documentBase: "/purchase/purchase-order",
    dueLabel: "Due",
    consequence: (count) => `Its ${items(count, "item is", "items are")} sent to Purchase and it can no longer be edited.`,
  },
  {
    slug: "purchase",
    label: "Purchase",
    icon: PurchaseIcon,
    leaf: "purchase",
    type: "purchase",
    party: "vendor",
    availability: "available",
    proc: "purchase",
    documentBase: "/purchase-order/purchase",
    dueLabel: null,
    consequence: (count) => `Its ${items(count, "item is", "items are")} recorded as bought, and it can no longer be edited.`,
  },
  { slug: "load-to-stock", label: "Load to Stock", icon: BoxClockIcon, leaf: "load-to-stock", type: "load-to-stock", party: "none", availability: "not-available" },
  { slug: "merge-split", label: "Merge/Split Stock", icon: SplitVerticalIcon, leaf: "merge-split", type: "merge-split", party: "none", availability: "not-available" },
  { slug: "transfer-location", label: "Transfer Location", icon: StockTransferIcon, leaf: "stock-transfer-location", type: "stock-transfer-location", party: "none", availability: "not-available" },
];

export const APPROVE_HREF = "/approve";
export const approveMenuHref = (slug: ApproveMenuSlug) => `${APPROVE_HREF}/${slug}`;

export function approveMenuFor(slug: string): ApproveMenu | undefined {
  return APPROVE_MENUS.find((menu) => menu.slug === slug);
}

/** `<leaf>:APPROVE` of every menu: the sidebar Approve item shows when any is granted (FE-AP-002). */
export const APPROVE_PERMISSIONS: readonly string[] = APPROVE_MENUS.map((menu) => `${menu.leaf}:APPROVE`);

/** Search placeholder by party (ui-spec "Per-menu variants"). */
export function searchPlaceholder(menu: ApproveMenu): string {
  if (menu.party === "customer") return "Search no., customer, stone, Stock ID";
  if (menu.party === "vendor") return "Search no., vendor, stone, Stock ID";
  return "Search no., stone, Stock ID";
}

/** Home › Approve › {Menu} (sources 01/02); an unknown slug ends with "Menu not found". */
export function approveBreadcrumbs(slug: string): { label: string; href?: string }[] {
  return [{ label: "Home", href: "/" }, { label: "Approve", href: APPROVE_HREF }, { label: approveMenuFor(slug)?.label ?? "Menu not found" }];
}
