import type { InferQueryLikeData } from "@trpc/react-query/shared";
import { z } from "zod";
import { add, dec, mul, toFixed } from "@/features/quotation/lib/decimal";
import { emptyLine, emptyQuotation, newKey } from "@/features/quotation/lib/defaults";
import { isFilledLine, lineSchema, tradeDocumentRules, tradeDocumentShape, type QuotationLine } from "@/features/quotation/schema";
import type { masterTrpc } from "@/lib/master-trpc";
import { APPROVAL_DOC_STATUSES } from "@/features/trade-document/flow-status";

/**
 * Purchase (PU) form: UI rev 1 + rev 2 (owner 2026-11-04) on SA rev 1 (ADR-0042). A row is keyed in (MANUAL), picked from
 * the vendor's Memo Stock or picked from an approved Purchase Order line. Picked rows are `source: "STOCK"` in the form,
 * so the shared row panel locks every copied field (R2-03) and only Pcs, Weight, Price and the Item Note stay editable.
 */

export const PURCHASE_HREF = "/purchase-order/purchase";
export const purchaseHref = (id: string) => `${PURCHASE_HREF}/${id}`;
/** The design shows a 250-character Document Note counter (S-01). */
export const PURCHASE_NOTE_MAX = 250;
/** A document holds at most 200 lines (C `LINES_MAX`). */
export const PURCHASE_LINES_MAX = 200;
/** ADR-0050: Draft, Pending Approval, Approved, Revise, Rejected. */
export const PURCHASE_STATUSES = APPROVAL_DOC_STATUSES;

/**
 * `purchase.memoStockLots` row (lot-based-stock FE-LOT-003, ADR-0055 D3): one row per lot and part, SOLD rows first, then
 * IN_STOCK; `pendingPcs` / `pendingWeightCt` are the part's quantity, `soldOpen*` the lot's sold-not-yet-purchased part.
 */
export type PurchaseMemoStockRow = InferQueryLikeData<typeof masterTrpc.purchase.memoStockLots>["items"][number];
/** `purchase.purchaseOrderLines` row (SA-PU-13): an approved PO line with an open quantity. */
export type PurchaseOrderLineRow = InferQueryLikeData<typeof masterTrpc.purchase.purchaseOrderLines>["items"][number];
export type MemoGroup = PurchaseMemoStockRow["memoGroup"];
export type PurchaseLineSource = "STOCK" | "PURCHASE_ORDER" | "MANUAL";

/**
 * A picked row keeps its source and its cap (`stockPendingPcs` / `stockPendingWeightCt`: the Memo Stock quantity or the
 * PO line's open quantity, R2-03), which the shared row panel reads for "Pcs fills Weight". `sourceDocNo` is the Memo
 * No. or PO No., shown only. Manual and empty rows have none of these.
 */
const purchaseLineSchema = lineSchema.extend({
  /** Legacy lines (saved before lots, Q-LOT-09) keep their item id; a new pick names its lot. */
  memoStockId: z.string().default(""),
  lotKey: z.string().default(""),
  /** rev 3 (ADR-0043): MERGED = the item's Sold part plus part or all of its In-stock part in one row. */
  memoGroup: z.enum(["", "IN_STOCK", "SOLD", "MERGED"]).default(""),
  purchaseOrderLineId: z.string().default(""),
  sourceDocNo: z.string().default(""),
  stockPendingPcs: z.string().default(""),
  stockPendingWeightCt: z.string().default(""),
  /** rev 3 (Q-PU-29/31): the lowest quantity (the Sold part) of a SOLD or MERGED row; a SOLD row's min equals its cap. */
  stockMinPcs: z.string().default(""),
  stockMinWeightCt: z.string().default(""),
});
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;

/** Where a row comes from, as the contract names it. */
export function purchaseLineSource(line: Partial<Pick<PurchaseLine, "memoStockId" | "lotKey" | "purchaseOrderLineId">>): PurchaseLineSource {
  if (line.memoStockId || line.lotKey) return "STOCK";
  if (line.purchaseOrderLineId) return "PURCHASE_ORDER";
  return "MANUAL";
}

/**
 * Row rules (form-guidelines, R2-03, api-contract "Input rules"): every filled row needs Pcs or Weight > 0 and a Price
 * > 0; a picked row stays within its cap.
 */
function purchaseLineRules(lines: readonly PurchaseLine[], ctx: z.RefinementCtx) {
  lines.forEach((line, index) => {
    if (!isFilledLine(line)) return;
    const issue = (field: "pcs" | "weightCt" | "unitPrice", message: string) => ctx.addIssue({ code: "custom", path: ["lines", index, field], message });
    const pcs = dec(line.pcs);
    const weight = dec(line.weightCt);
    if (pcs <= dec(0) && weight <= dec(0)) issue("pcs", "Enter the quantity");
    const source = purchaseLineSource(line);
    if (source !== "MANUAL") {
      const word = source === "PURCHASE_ORDER" ? "open" : line.memoGroup === "IN_STOCK" ? "pending" : "available";
      const capPcs = line.stockPendingPcs || "0";
      const capWeight = line.stockPendingWeightCt || "0";
      // A saved lot line comes back without its range (the picker row shows it); the server checks it on Save.
      const capKnown = !(line.lotKey && line.stockPendingPcs === "");
      if (capKnown && pcs > dec(capPcs)) issue("pcs", `More than the ${word} ${capPcs} pcs`);
      if (capKnown && weight > dec(capWeight)) issue("weightCt", `More than the ${word} ${capWeight} ct`);
      // R3-02: never below the Sold part (already sold to customers).
      if (line.stockMinPcs !== "" && pcs < dec(line.stockMinPcs)) issue("pcs", `At least ${line.stockMinPcs} pcs (already sold to customers)`);
      if (line.stockMinWeightCt !== "" && weight < dec(line.stockMinWeightCt)) issue("weightCt", `At least ${line.stockMinWeightCt} ct (already sold to customers)`);
    }
    if (dec(line.unitPrice) <= dec(0)) issue("unitPrice", "Enter the price");
  });
}

export const purchaseSchema = z
  .object({
    ...tradeDocumentShape,
    lines: z.array(purchaseLineSchema).max(PURCHASE_LINES_MAX, `Up to ${PURCHASE_LINES_MAX} rows`),
    documentNote: z.string().max(PURCHASE_NOTE_MAX, `Up to ${PURCHASE_NOTE_MAX} characters`),
    status: z.enum(PURCHASE_STATUSES),
    vendorId: z.string().min(1, "Required"),
    addressId: z.string().min(1, "Required"),
  })
  .superRefine((value, ctx) => {
    tradeDocumentRules(value, ctx);
    purchaseLineRules(value.lines, ctx);
  });

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;

const NO_SOURCE = { memoStockId: "", lotKey: "", memoGroup: "", purchaseOrderLineId: "", sourceDocNo: "", stockPendingPcs: "", stockPendingWeightCt: "", stockMinPcs: "", stockMinWeightCt: "" } as const;
export const emptyPurchaseLine = (): PurchaseLine => ({ ...emptyLine(), ...NO_SOURCE });

/** A new purchase: today, five empty rows, the company currency once it loads. */
export function emptyPurchase(): PurchaseFormValues {
  const q = emptyQuotation();
  return {
    status: "DRAFT",
    docDate: q.docDate,
    dueDate: q.dueDate,
    vendorId: "",
    addressId: "",
    currency: q.currency,
    exchangeRate: q.exchangeRate,
    ref: q.ref,
    lines: q.lines.map(() => emptyPurchaseLine()),
    discount: q.discount,
    tax: q.tax,
    serviceCharges: q.serviceCharges,
    labor: q.labor,
    documentNote: q.documentNote,
  };
}

type Copied = Pick<PurchaseLine, "stone" | "shape" | "size" | "color" | "clarity" | "cutting" | "quality" | "cerType" | "cerNo" | "lot" | "itemNote">;
const copied = (row: Copied): Copied => ({
  stone: row.stone, shape: row.shape, size: row.size, color: row.color, clarity: row.clarity, cutting: row.cutting, quality: row.quality,
  cerType: row.cerType, cerNo: row.cerNo, lot: row.lot, itemNote: row.itemNote,
});

/**
 * A Memo Stock lot row → a purchase row (R2-03, Q-PU-04, lot-based-stock): lot, location, stone and certificate copied and
 * locked, no Stock ID (owner Q-LOT-10); Pcs and Weight start at the part's quantity (its cap); Price starts at the lot's net
 * unit price (the weighted average of its items, owner 2026-11-21) at 2 dp. The part is sent back as `memoGroup`.
 */
export function memoStockToPurchaseLine(row: PurchaseMemoStockRow): PurchaseLine {
  return {
    ...emptyPurchaseLine(),
    ...copied(row),
    key: newKey(),
    source: "STOCK",
    stockId: "",
    locationId: row.location,
    pcs: String(row.pendingPcs),
    weightCt: toFixed(dec(row.pendingWeightCt), 3),
    priceUnit: row.priceUnit === "PER_PCS" ? "PER_PCS" : "PER_CT",
    unitPrice: toFixed(dec(row.netUnitPrice ?? "0"), 2),
    lotKey: row.lotKey,
    memoGroup: row.memoGroup,
    sourceDocNo: row.ref.docNo,
    stockPendingPcs: String(row.pendingPcs),
    stockPendingWeightCt: row.pendingWeightCt,
    // R3-03 (Q-PU-29): a Sold row is bought whole, so its quantity is fixed (min = cap); only Price changes.
    ...(row.memoGroup === "SOLD" ? { stockMinPcs: String(row.pendingPcs), stockMinWeightCt: row.pendingWeightCt } : {}),
  };
}

/**
 * An approved PO line → a purchase row (R2-PO, R2-05): attributes, stone code, lot, location, certificate and note copied
 * and locked; Pcs and Weight start at the open quantity (ordered − purchased, the cap); Price starts at the PO net unit
 * price (D12). The row has no Stock ID (ADR-0051: issued later, at Load to Stock). PO photos are not copied (Q-PU-11).
 */
export function purchaseOrderLineToPurchaseLine(row: PurchaseOrderLineRow): PurchaseLine {
  return {
    ...emptyPurchaseLine(),
    ...copied(row),
    key: newKey(),
    source: "STOCK",
    stockId: "",
    stoneCode: row.stoneCode,
    locationId: row.location,
    pcs: String(row.availablePcs),
    weightCt: toFixed(dec(row.availableWeightCt), 3),
    priceUnit: row.priceUnit,
    unitPrice: toFixed(dec(row.netUnitPrice), 2),
    purchaseOrderLineId: row.purchaseOrderLineId,
    sourceDocNo: row.purchaseOrder.docNo,
    stockPendingPcs: String(row.availablePcs),
    stockPendingWeightCt: row.availableWeightCt,
  };
}

/** R3-02: the table tag of a merged row. */
export const MERGED_TAG = "Sold + In stock";
/** The table tag of each Memo Stock row by its part (INV-20261107-003). */
export const MEMO_GROUP_TAG: Record<"SOLD" | "IN_STOCK" | "MERGED", string> = { SOLD: "Sold", IN_STOCK: "In stock", MERGED: MERGED_TAG };

/** One part of an item for the merge question: a row ticked in Add Memo Stock or a row already on the form. */
export type MergePart = { line: PurchaseLine; existingIndex: number | null };
/** The item a row came from: its lot, or (a legacy line) its Memo Stock item. */
export const itemKeyOf = (line: Partial<Pick<PurchaseLine, "lotKey" | "memoStockId">>) => line.lotKey || line.memoStockId || "";

/** R3-01: the Sold part and the In-stock part of one lot (Q-PU-24, per lot since ADR-0055). `lot` names it in the dialog. */
export type MergePair = { itemKey: string; lot: string; sold: MergePart; inStock: MergePart };

/**
 * R3-01 / Q-PU-24/27: pairs among the ticked rows, and between a ticked row and a row of the same item already on the
 * form (a SOLD or IN_STOCK row, not a merged one). Each ticked row is in at most one pair.
 */
export function findMergePairs(picked: readonly PurchaseLine[], existing: readonly PurchaseLine[]): MergePair[] {
  const pairs: MergePair[] = [];
  const used = new Set<number>();
  const partOf = (group: string, itemKey: string) => {
    const pickedIndex = picked.findIndex((line, index) => !used.has(index) && itemKeyOf(line) === itemKey && line.memoGroup === group);
    if (pickedIndex >= 0) return { part: { line: picked[pickedIndex]!, existingIndex: null }, pickedIndex };
    const existingIndex = existing.findIndex((line) => itemKeyOf(line) === itemKey && line.memoGroup === group);
    return existingIndex >= 0 ? { part: { line: existing[existingIndex]!, existingIndex }, pickedIndex: null } : null;
  };
  picked.forEach((line, index) => {
    if (used.has(index) || !itemKeyOf(line) || (line.memoGroup !== "SOLD" && line.memoGroup !== "IN_STOCK")) return;
    used.add(index);
    const other = partOf(line.memoGroup === "SOLD" ? "IN_STOCK" : "SOLD", itemKeyOf(line));
    if (!other) {
      used.delete(index);
      return;
    }
    if (other.pickedIndex !== null) used.add(other.pickedIndex);
    const self: MergePart = { line, existingIndex: null };
    const [sold, inStock] = line.memoGroup === "SOLD" ? [self, other.part] : [other.part, self];
    pairs.push({ itemKey: itemKeyOf(line), lot: line.lot, sold, inStock });
  });
  return pairs;
}

/**
 * R3-02: one row for both parts. Pcs / Weight start at Sold + In stock (the cap), never below the Sold part (the min);
 * one Price, the Sold row's (the same memo net unit price, Q-PU-32). Copied fields come from the Sold row.
 */
export function mergedPurchaseLine(sold: PurchaseLine, inStock: PurchaseLine): PurchaseLine {
  const capPcs = add(dec(sold.stockPendingPcs), dec(inStock.stockPendingPcs));
  const capWeight = add(dec(sold.stockPendingWeightCt), dec(inStock.stockPendingWeightCt));
  return {
    ...sold,
    key: newKey(),
    memoGroup: "MERGED",
    pcs: toFixed(capPcs, 0),
    weightCt: toFixed(capWeight, 3),
    stockPendingPcs: toFixed(capPcs, 0),
    stockPendingWeightCt: toFixed(capWeight, 3),
    stockMinPcs: sold.stockPendingPcs,
    stockMinWeightCt: sold.stockPendingWeightCt,
  };
}

/** R3-01 design (owner 2026-11-06): a part's amount at the memo price, price × weight (per ct) or × pcs (per pcs), 2 dp. */
export function mergePartAmount(line: PurchaseLine): string {
  const basis = line.priceUnit === "PER_PCS" ? dec(line.stockPendingPcs) : dec(line.stockPendingWeightCt);
  return toFixed(mul(dec(line.unitPrice), basis), 2);
}

/**
 * R3-01 "Merge": the ticked rows to add (pairs become merged rows; a pair with a row already on the form replaces that
 * row in place) and the replacements for rows already on the form, by index.
 */
export function applyMerge(picked: readonly PurchaseLine[], pairs: readonly MergePair[]) {
  const pairOf = new Map<PurchaseLine, MergePair>();
  for (const pair of pairs) for (const part of [pair.sold, pair.inStock]) if (part.existingIndex === null) pairOf.set(part.line, pair);
  const replace = new Map<number, PurchaseLine>();
  const rows: PurchaseLine[] = [];
  const placed = new Set<MergePair>();
  for (const line of picked) {
    const pair = pairOf.get(line);
    if (!pair) {
      rows.push(line);
      continue;
    }
    if (placed.has(pair)) continue;
    placed.add(pair);
    const merged = mergedPurchaseLine(pair.sold.line, pair.inStock.line);
    // A pair with a row already on the form replaces that row in place (it keeps its key); otherwise the merged row
    // takes the place of the pair's first ticked row.
    const onForm = pair.sold.existingIndex !== null ? pair.sold : pair.inStock.existingIndex !== null ? pair.inStock : null;
    if (onForm) replace.set(onForm.existingIndex!, { ...merged, key: onForm.line.key });
    else rows.push(merged);
  }
  return { rows, replace };
}

/** Row panel note of a Sold or merged row (R3-02/03); null keeps the shared "Pending …" note. */
export function purchaseStockNote(line: Partial<PurchaseLine>): string | null {
  if (line.memoGroup === "SOLD") return `Sold to customers: ${line.stockMinPcs} pcs / ${line.stockMinWeightCt} cts must be purchased whole.`;
  if (line.memoGroup !== "MERGED") return null;
  const morePcs = toFixed(dec(line.stockPendingPcs) - dec(line.stockMinPcs), 0);
  const moreWeight = toFixed(dec(line.stockPendingWeightCt) - dec(line.stockMinWeightCt), 3);
  return `Sold ${line.stockMinPcs} pcs / ${line.stockMinWeightCt} cts must be purchased. Up to ${morePcs} pcs / ${moreWeight} cts more from stock.`;
}

/** The picker key of a Memo Stock row: the lot (or legacy item) and its part. */
export const memoStockKey = (itemKey: string, group: string) => `${itemKey}:${group}`;

/** Sources already on the form; both pickers leave them out (Memo Stock by `key`, PO by line id). */
export function pickedSourceKeys(lines: readonly QuotationLine[]): Set<string> {
  return new Set(
    lines.flatMap((line) => {
      const row = line as Partial<PurchaseLine>;
      // A merged row holds both parts of its item, so both picker rows are left out.
      const item = itemKeyOf(row);
      if (item && row.memoGroup === "MERGED") return [memoStockKey(item, "SOLD"), memoStockKey(item, "IN_STOCK")];
      if (item) return [memoStockKey(item, row.memoGroup || "IN_STOCK")];
      if (row.purchaseOrderLineId) return [row.purchaseOrderLineId];
      return [];
    }),
  );
}

/** Rows taken from Memo Stock or a Purchase Order (they go when the vendor changes, R2-04). */
export const pickedRowCount = (lines: readonly PurchaseLine[]) => lines.filter((line) => isFilledLine(line) && purchaseLineSource(line) !== "MANUAL").length;

/** INV-20261107-002: asked before a vendor change would remove picked rows; `currency` names a currency switch too. */
export function vendorChangeConfirm(count: number, currency: string | null) {
  const rows = `${count} ${count === 1 ? "row" : "rows"}`;
  const money = currency ? ` The currency changes to ${currency}.` : "";
  return {
    title: "Change the vendor?",
    body: `This removes the ${rows} taken from Memo Stock and Purchase Orders. Rows you keyed in stay.${money}`,
    cancelLabel: "Keep vendor",
    confirmLabel: "Change vendor",
  };
}

/**
 * A new vendor (R2-04): rows picked from Memo Stock **and** from a Purchase Order become empty rows; manual rows stay.
 * Returns null when nothing changes.
 */
export function clearPickedRows(lines: readonly PurchaseLine[]): PurchaseLine[] | null {
  if (!lines.some((line) => purchaseLineSource(line) !== "MANUAL")) return null;
  return lines.map((line) => (purchaseLineSource(line) !== "MANUAL" ? emptyPurchaseLine() : line));
}

/**
 * How a row reads in the page table (R2-05, FE-PU-005): the Lot leads (no Stock ID, owner Q-LOT-10); `stockId` carries only the
 * grey tag under it: "from {PO No.}" for a PO row, "Sold" / "In stock" / "Sold + In stock" for a Memo Stock row. A blank Location
 * shows "—". Display only; the form keeps its values.
 */
export function purchaseTableLine<T extends QuotationLine>(line: T): T {
  if (!isFilledLine(line)) return line;
  const row = line as T & Partial<PurchaseLine>;
  // R3-02 + INV-20261107-003: a Memo Stock row names its part (Sold / In stock / both), so separate rows of one Stock ID differ.
  const from = row.purchaseOrderLineId ? ` · from ${row.sourceDocNo}` : row.memoGroup ? ` · ${MEMO_GROUP_TAG[row.memoGroup]}` : "";
  return { ...line, stockId: from.replace(/^ · /, ""), locationId: line.locationId || "—" };
}
