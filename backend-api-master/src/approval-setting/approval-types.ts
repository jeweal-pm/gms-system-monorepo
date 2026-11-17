import type { MasterMenu } from "../master/authorization";

/**
 * Approval type registry (approval-setup SA rev 1 / ADR-0050, api-contract "Shared types"): the setting keys in
 * sidebar order, each with a document page and a header table in schema `partner`. ADR-0052 D8 (load-to-stock SA rev 1,
 * Q-LS-25 default, BE-LS-005): the three inventory types (`load-to-stock`, `merge-split`, `stock-transfer-location`)
 * moved to `inventory.approval_setting` in backend-api-inventory; master no longer lists or accepts them. Every SQL
 * identifier used by the approval modules comes from this fixed map, never from input.
 */
export const APPROVAL_TYPES = [
  "quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase",
] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

/** The eight types with document pages (ADR-0050 scope). */
export const APPROVAL_DOC_TYPES = ["quotation", "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase"] as const;
export type ApprovalDocType = (typeof APPROVAL_DOC_TYPES)[number];

type DocTypeInfo = {
  /** Permission menu key (the type key equals the auth catalog leaf). */
  menu: MasterMenu;
  /** Header table in schema `partner` (fixed identifier). */
  table: string;
};

export const APPROVAL_DOC_TYPE_INFO: Readonly<Record<ApprovalDocType, DocTypeInfo>> = {
  quotation: { menu: "quotation", table: "quotation" },
  reserve: { menu: "reserve", table: "reserve" },
  "memo-receive": { menu: "memo-receive", table: "memo_receive" },
  "memo-return": { menu: "memo-return", table: "memo_return" },
  "memo-out": { menu: "memo-out", table: "memo_out" },
  "memo-out-return": { menu: "memo-out-return", table: "memo_out_return" },
  "purchase-order": { menu: "purchase-order", table: "purchase_order" },
  purchase: { menu: "purchase", table: "purchase" },
};

export function isApprovalDocType(type: ApprovalType): type is ApprovalDocType {
  return (APPROVAL_DOC_TYPES as readonly string[]).includes(type);
}
