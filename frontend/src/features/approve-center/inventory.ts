import { loadToStockApi, type LoadOut } from "@/features/load-to-stock/api";
import { saleApi, type SaleOut } from "@/features/sale/api";
import { stockTransferApi, type TransferOut } from "@/features/stock-transfer-location/api";
import { stockAdjustmentApi, type AdjustmentOut } from "@/features/stock-adjustment/api";
import type { InventoryPendingItem } from "@/features/inventory/approval";
import type { PendingApprovalItem } from "./model";
import type { PreviewDetail } from "./preview";
import { sumDecimal } from "./preview";

/**
 * load-to-stock FE-LS-011 (ADR-0052 D12): Approve Center adapters for the inventory document Load to Stock. Its
 * pending rows and detail come from `backend-api-inventory` and are shaped like master's so the same table, preview
 * and review dialogs serve it.
 */

/** `LoadOut` → the preview modal's fields: one line per load row, value = the row's company-currency cost. */
export function loadToStockPreview(detail: LoadOut): PreviewDetail {
  return {
    id: detail.id,
    docNo: detail.docNo,
    status: detail.status,
    version: detail.version,
    docDate: detail.docDate,
    currency: detail.currency,
    exchangeRate: null,
    documentNote: detail.documentNote,
    vendor: { name: detail.vendor.name },
    lines: [...detail.rows]
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        stoneCode: row.attrs.stoneCode,
        stockId: row.stockId,
        stone: row.attrs.stone,
        shape: row.attrs.shape,
        size: row.attrs.size,
        pcs: row.pcs,
        weightCt: row.weightCt,
        amount: row.costAmountBase,
        location: row.location,
      })),
    totals: { grandTotal: detail.totals.costAmountBase },
    deletedAt: detail.deleted?.at ?? null,
    revisionCount: detail.approval.revisionCount,
  };
}

/**
 * An inventory pending row in master's row shape. SA rev 1 lists no `version` on pending rows: 0 means "read it with
 * `get` before the call" (`withVersion`), so an approve still sends the current `expectedVersion`.
 */
export function toPendingItem(item: InventoryPendingItem, currency: string, type: string = "load-to-stock"): PendingApprovalItem {
  return {
    type,
    id: item.id,
    docNo: item.docNo,
    docDate: item.docDate,
    dueDate: "",
    version: item.version ?? 0,
    status: "PENDING_APPROVAL",
    party: { id: "", code: "", name: item.partyName },
    ref: "",
    // Sale (FE-SL-009) lists its grand total in the document currency; Load to Stock in the company currency.
    currency: item.currency ?? currency,
    grandTotal: item.value ?? item.valueBase ?? "0",
    lineCount: item.lineCount ?? 0,
    totalPcs: type === "stock-adjustment" ? (item.totalDiffPcs ?? item.totalPcs ?? 0) : (item.totalPcs ?? 0),
    totalWeightCt: type === "stock-adjustment" ? (item.totalDiffWeightCt ?? item.totalWeightCt ?? "0") : (item.totalWeightCt ?? "0"),
    stoneNames: [],
    moreStoneCount: 0,
    submittedAt: item.submittedAt,
    submittedBy: "",
    submittedByName: item.submittedByName,
    revisionCount: item.revisionCount ?? 0,
    lastReview: null,
    updatedAt: "",
  };
}

/** Stock Adjustment's location and signed count deltas as the shared Approve Center preview. */
export function stockAdjustmentPreview(detail: AdjustmentOut): PreviewDetail {
  const lines = [...detail.lines].sort((a, b) => a.position - b.position);
  return {
    id: detail.id,
    docNo: detail.docNo ?? "—",
    status: detail.status,
    version: detail.version,
    docDate: detail.docDate,
    currency: "—",
    exchangeRate: null,
    documentNote: detail.note,
    location: detail.location,
    lines: lines.map((line) => ({
      stoneCode: line.attrs.stoneCode,
      stockId: line.stockId,
      stone: line.attrs.stone,
      shape: line.attrs.shape,
      size: line.attrs.size,
      pcs: line.diffPcs,
      weightCt: line.diffWeightCt,
      amount: line.diffPrice,
      location: line.attrs.location,
    })),
    totals: { grandTotal: sumDecimal(lines.map((line) => line.diffPrice), 2) },
    deletedAt: detail.deleted?.at ?? null,
    revisionCount: detail.approval.revisionCount,
  };
}

type StockAdjustmentCalls = Pick<typeof stockAdjustmentApi, "get" | "approve" | "reject" | "requestRevision">;

/** The Approve menu's per-document adapter for backend-api-inventory Stock Adjustment. */
export function stockAdjustmentDocumentClient(calls: StockAdjustmentCalls = stockAdjustmentApi) {
  const withVersion = async (id: string, expectedVersion: number) => (expectedVersion > 0 ? expectedVersion : (await calls.get(id)).version);
  return {
    get: { query: async ({ id }: { id: string }) => stockAdjustmentPreview(await calls.get(id)) },
    approve: { mutate: async ({ id, expectedVersion }: { id: string; expectedVersion: number }) => calls.approve(id, await withVersion(id, expectedVersion)) },
    reject: { mutate: async ({ id, expectedVersion, reason }: { id: string; expectedVersion: number; reason: string }) => calls.reject(id, await withVersion(id, expectedVersion), reason) },
    requestRevision: { mutate: async ({ id, expectedVersion, note }: { id: string; expectedVersion: number; note: string }) => calls.requestRevision(id, await withVersion(id, expectedVersion), note) },
  };
}

type Calls = Pick<typeof loadToStockApi, "get" | "approve" | "reject" | "requestRevision">;

/** The Approve menu's per-document client for Load to Stock (same surface as master's `DocumentClient`). */
export function loadToStockDocumentClient(calls: Calls = loadToStockApi) {
  const withVersion = async (id: string, expectedVersion: number) => (expectedVersion > 0 ? expectedVersion : (await calls.get(id)).version);
  return {
    get: { query: async ({ id }: { id: string }) => loadToStockPreview(await calls.get(id)) },
    approve: { mutate: async ({ id, expectedVersion }: { id: string; expectedVersion: number }) => calls.approve(id, await withVersion(id, expectedVersion)) },
    reject: { mutate: async ({ id, expectedVersion, reason }: { id: string; expectedVersion: number; reason: string }) => calls.reject(id, await withVersion(id, expectedVersion), reason) },
    requestRevision: {
      mutate: async ({ id, expectedVersion, note }: { id: string; expectedVersion: number; note: string }) => calls.requestRevision(id, await withVersion(id, expectedVersion), note),
    },
  };
}

/** sale FE-SL-009: `SaleOut` → the preview modal's fields (customer, lines in position order, grand total). */
export function salePreview(detail: SaleOut): PreviewDetail {
  return {
    id: detail.id,
    docNo: detail.docNo,
    status: detail.status,
    version: detail.version,
    docDate: detail.docDate,
    currency: detail.currency,
    exchangeRate: detail.exchangeRate,
    documentNote: detail.documentNote,
    customer: { name: detail.customer.name },
    lines: [...detail.lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({ stoneCode: line.stoneCode, stockId: line.stockId, stone: line.stone, shape: line.shape, size: line.size, pcs: line.pcs, weightCt: line.weightCt, amount: line.amount, location: line.location })),
    totals: { grandTotal: detail.totals.grandTotal },
    deletedAt: detail.deleted?.at ?? null,
    revisionCount: detail.approval.revisionCount,
  };
}

type SaleCalls = Pick<typeof saleApi, "get" | "approve" | "reject" | "requestRevision">;

/** The Approve menu's per-document client for Sale (backend-api-inventory, same surface as master's). */
export function saleDocumentClient(calls: SaleCalls = saleApi) {
  const withVersion = async (id: string, expectedVersion: number) => (expectedVersion > 0 ? expectedVersion : (await calls.get(id)).version);
  return {
    get: { query: async ({ id }: { id: string }) => salePreview(await calls.get(id)) },
    approve: { mutate: async ({ id, expectedVersion }: { id: string; expectedVersion: number }) => calls.approve(id, await withVersion(id, expectedVersion)) },
    reject: { mutate: async ({ id, expectedVersion, reason }: { id: string; expectedVersion: number; reason: string }) => calls.reject(id, await withVersion(id, expectedVersion), reason) },
    requestRevision: {
      mutate: async ({ id, expectedVersion, note }: { id: string; expectedVersion: number; note: string }) => calls.requestRevision(id, await withVersion(id, expectedVersion), note),
    },
  };
}

/**
 * stock-transfer-location FE-STL-005 (ADR-0060 D8): `TransferOut` → the preview modal's fields. One line per row; the
 * location column shows "from → to" and the value is blank (a transfer moves stock, it has no amount).
 */
export function stockTransferPreview(detail: TransferOut): PreviewDetail {
  return {
    id: detail.id,
    docNo: detail.docNo ?? "",
    status: detail.status,
    version: detail.version,
    docDate: detail.docDate,
    currency: "",
    exchangeRate: null,
    documentNote: detail.note,
    lines: [...detail.lines]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        stoneCode: line.attrs.stoneCode,
        stockId: line.stockId,
        stone: line.attrs.stone,
        shape: line.attrs.shape,
        size: line.attrs.size,
        pcs: line.pcs,
        weightCt: line.weightCt,
        amount: "0",
        location: `${line.fromLocation} → ${line.toLocation}`,
      })),
    totals: { grandTotal: "0" },
    deletedAt: null,
    revisionCount: detail.approval.revisionCount,
  };
}

type TransferCalls = Pick<typeof stockTransferApi, "get" | "approve" | "reject" | "requestRevision">;

/** The Approve menu's per-document client for Stock Transfer Location (backend-api-inventory, same surface as master's). */
export function stockTransferDocumentClient(calls: TransferCalls = stockTransferApi) {
  const withVersion = async (id: string, expectedVersion: number) => (expectedVersion > 0 ? expectedVersion : (await calls.get(id)).version);
  return {
    get: { query: async ({ id }: { id: string }) => stockTransferPreview(await calls.get(id)) },
    approve: { mutate: async ({ id, expectedVersion }: { id: string; expectedVersion: number }) => calls.approve(id, await withVersion(id, expectedVersion)) },
    reject: { mutate: async ({ id, expectedVersion, reason }: { id: string; expectedVersion: number; reason: string }) => calls.reject(id, await withVersion(id, expectedVersion), reason) },
    requestRevision: {
      mutate: async ({ id, expectedVersion, note }: { id: string; expectedVersion: number; note: string }) => calls.requestRevision(id, await withVersion(id, expectedVersion), note),
    },
  };
}
