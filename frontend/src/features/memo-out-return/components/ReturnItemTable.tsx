"use client";

import { returnItemTable, type ReturnItemTableProps } from "@/features/trade-document/return-item-table";

export type { ReturnItemTableProps };

/**
 * Memo Out Return item table (memo-out-return UI rev 3): only the Return Pcs / Weight are keyed in, and there is no
 * row menu, checkbox, remove or Add row button (owner 2026-10-28). Return Pcs fills the Weight in proportion, as on Memo
 * Return (INV-20261102-002).
 */
export const ReturnItemTable = returnItemTable({ rowControls: false, addRow: false, autoWeight: true, viewStoneCode: false });
