import { APPROVAL_DOC_TYPE_INFO, APPROVAL_DOC_TYPES, type ApprovalDocType } from "../approval-setting/approval-types";
import type { MasterMenu } from "../master/authorization";

/**
 * Approval type registry of the Approve Center API (approve-center architecture "Approval type registry", amended by
 * approval-setup SA rev 1: Quotation included, kebab-case type keys of the approval-setting registry). Every SQL
 * identifier of `approval.summary` / `approval.pending` comes from this fixed map, never from input. The order is the
 * sidebar order (Q-AP-03). A future inventory document (D20) registers one entry here.
 */
export type ApprovalRegistryEntry = {
  type: ApprovalDocType;
  menu: MasterMenu;
  /** Header table in schema `partner`. */
  table: string;
  /** Line table in schema `partner`. */
  lineTable: string;
  /** Line column referencing the header. */
  parentColumn: string;
  /** Party snapshot columns `<party>_id`, `<party>_code_snapshot`, `<party>_name_snapshot`. */
  party: "customer" | "vendor";
  /**
   * Where a line's Stock ID is for search: `line` = `l.stock_id`; `memoOutLine` = the linked Memo Out line's
   * `stock_id` (Memo Out Return); `none` = no Stock ID (Purchase Order: search by stone only).
   */
  stock: "line" | "memoOutLine" | "none";
};

const LINES: Readonly<Record<ApprovalDocType, Omit<ApprovalRegistryEntry, "type" | "menu" | "table">>> = {
  quotation: { lineTable: "quotation_line", parentColumn: "quotation_id", party: "customer", stock: "line" },
  reserve: { lineTable: "reserve_line", parentColumn: "reserve_id", party: "customer", stock: "line" },
  "memo-receive": { lineTable: "memo_receive_line", parentColumn: "memo_receive_id", party: "vendor", stock: "line" },
  "memo-return": { lineTable: "memo_return_line", parentColumn: "memo_return_id", party: "vendor", stock: "line" },
  "memo-out": { lineTable: "memo_out_line", parentColumn: "memo_out_id", party: "customer", stock: "line" },
  "memo-out-return": { lineTable: "memo_out_return_line", parentColumn: "memo_out_return_id", party: "customer", stock: "memoOutLine" },
  "purchase-order": { lineTable: "purchase_order_line", parentColumn: "purchase_order_id", party: "vendor", stock: "none" },
  purchase: { lineTable: "purchase_line", parentColumn: "purchase_id", party: "vendor", stock: "line" },
};

export const APPROVAL_REGISTRY: Readonly<Record<ApprovalDocType, ApprovalRegistryEntry>> = Object.fromEntries(
  APPROVAL_DOC_TYPES.map((type) => [type, { type, menu: APPROVAL_DOC_TYPE_INFO[type].menu, table: APPROVAL_DOC_TYPE_INFO[type].table, ...LINES[type] }]),
) as Record<ApprovalDocType, ApprovalRegistryEntry>;

/** Registry entries in sidebar order. */
export const APPROVAL_REGISTRY_ORDER: readonly ApprovalRegistryEntry[] = APPROVAL_DOC_TYPES.map((type) => APPROVAL_REGISTRY[type]);
