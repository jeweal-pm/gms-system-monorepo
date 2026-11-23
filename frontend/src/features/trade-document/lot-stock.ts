import { isFilledLine, type QuotationLine } from "@/features/quotation/schema";
import type { ServerFieldError } from "@/lib/trpc-error";

/**
 * lot-based-stock (ADR-0055, TODO FE-LOT-002/006/007; owner scope 2026-11-21 Q2/Q3): Quotation, Reserve, Memo Out
 * (round 1), Purchase and Memo Return (round 2) pick and save stock by Lot (`fromStock.lots`, `memoStock.lots`,
 * `purchase.memoStockLots`, `lotKey`) and never show a Stock ID (owner Q-LOT-10). Sale, Memo Out Return, Memo Receive,
 * Load to Stock and Memo Outstanding show the real Stock ID again (owner Q3); a Sale lot line has none (`""`).
 */

/** Document types whose screens hide the Stock ID (item tables, row panel, Approve Center preview, owner Q3). */
export const LOT_DOCUMENT_TYPES: ReadonlySet<string> = new Set(["quotation", "reserve", "memo-out", "purchase", "memo-return"]);
export const isLotDocumentType = (type: string) => LOT_DOCUMENT_TYPES.has(type);

/** Server-validated lot key: "ML"/"MS" Memo Stock, "OL"/"OS" our stock (api-contract `LotKey`). */
export const isOwnLotKey = (lotKey: string | null | undefined): boolean => Boolean(lotKey && lotKey.startsWith("O"));

/** The Lot of a row as text: the lot itself, or "—" when it has none (legacy lines and groups of one). */
export const lotText = (lot: string | null | undefined) => lot?.trim() || "—";

/** "in lot L", or "in this lot" when the lot has no name. */
const inLot = (lot: string | undefined) => (lot?.trim() ? `in lot ${lot.trim()}` : "in this lot");

/** The lot of each line the server numbered (`lines.N` counts the filled rows sent, empty rows dropped). */
export type LotLineRef = { lotKey?: string | null; lot?: string | null };

/** The rows the server numbers (`lines.N`): the filled ones, in order; read by the lot error texts. */
export const sentLotLines = (values: { lines: readonly QuotationLine[] } | undefined): LotLineRef[] =>
  (values?.lines ?? []).filter(isFilledLine).map((line) => ({ lotKey: line.lotKey || null, lot: line.lot }));

/** error-handling "Row n: only x pcs / y ct left in lot L". */
export const lotShortText = (row: number, available: { pcs: string | number; weightCt: string | number }, lot: string | undefined) =>
  `Row ${row}: only ${available.pcs} pcs / ${available.weightCt} ct left ${inLot(lot)}`;

/** error-handling: our-stock race at Save / Approve (the hold was refused after the pre-read). */
export const lotChangedText = (row: number, lot: string | undefined) => `Row ${row}: ${lot?.trim() ? `lot ${lot.trim()}` : "this lot"} changed, refresh and try again`;

/** error-handling `STOCK_LOT_UNAVAILABLE`. */
export const lotUnavailableText = (row: number) => `Row ${row}: this lot has nothing left`;

/** error-handling `STOCK_LOT_TOO_LARGE`. */
export const lotTooLargeText = (lot: string | undefined) =>
  `${lot?.trim() ? `Lot ${lot.trim()}` : "This lot"} is too large to pick in one document; contact admin`;

/**
 * A lot row the server refused at `lines.N.reference` (VALIDATION_ERROR / 422 STOCK_LOT_UNAVAILABLE), as "Row N: …".
 * Codes: unavailable, lot_required, duplicate, invalid, not_mergeable, vendor_mismatch, currency_mismatch.
 */
export function lotReferenceText(row: number, code: string, noun: string): string {
  if (code === "unavailable") return lotUnavailableText(row);
  if (code === "lot_required") return `Row ${row}: Pick this item again from the list`;
  if (code === "duplicate") return `Row ${row}: This lot is already on the ${noun}.`;
  if (code === "vendor_mismatch") return `Row ${row}: This lot is from another vendor. Remove the row.`;
  if (code === "currency_mismatch") return `Row ${row}: This lot is in another currency. Remove the row.`;
  return `Row ${row}: This lot can't be used any more. Remove the row and pick it again.`;
}

/** A short line of `<DOC>_PENDING_SHORT` `details.lines[]` (api-contract "Errors"). */
export type ShortLotLine = { index: number; lotKey: string | null; availablePcs: number; availableWeightCt: string };

/** Reads `details.lines[]` of a short error; anything malformed is skipped. */
export function shortLotLines(details: unknown): ShortLotLine[] {
  const lines = (details as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) return [];
  return lines.flatMap((entry): ShortLotLine[] => {
    const line = entry as Partial<ShortLotLine> | null;
    if (!line || typeof line.index !== "number") return [];
    return [{ index: line.index, lotKey: typeof line.lotKey === "string" ? line.lotKey : null, availablePcs: Number(line.availablePcs ?? 0), availableWeightCt: String(line.availableWeightCt ?? "0") }];
  });
}

/**
 * `<DOC>_PENDING_SHORT` on a document with lot lines → "Row n: …" for the first short row, or undefined when the error
 * names no lot row (the caller keeps its general text). `details.lines[]` gives the lot's quantity left; without it, a
 * short own-lot row (`exceeds_pending` field paths from the hold refusal) means the lot changed after the pre-read.
 */
export function lotPendingShortText(details: unknown, fieldErrors: readonly ServerFieldError[], lines: readonly LotLineRef[] | undefined): string | undefined {
  const short = shortLotLines(details);
  const first = short[0];
  if (first) return lotShortText(first.index + 1, { pcs: first.availablePcs, weightCt: first.availableWeightCt }, lines?.[first.index]?.lot ?? undefined);
  for (const entry of fieldErrors) {
    const match = /^lines\.(\d+)\.(pcs|weightCt)$/.exec(entry.path);
    if (!match || entry.code !== "exceeds_pending") continue;
    const line = lines?.[Number(match[1])];
    if (line?.lotKey) return isOwnLotKey(line.lotKey) ? lotChangedText(Number(match[1]) + 1, line.lot ?? undefined) : lotShortText(Number(match[1]) + 1, {
      pcs: entry.params?.availablePcs ?? 0, weightCt: entry.params?.availableWeightCt ?? "0",
    }, line.lot ?? undefined);
  }
  return undefined;
}

/** `STOCK_LOT_TOO_LARGE` `details { lotKey?, limit }` → its text, naming the lot when it is on the form. */
export function lotTooLargeMessage(details: unknown, lines: readonly LotLineRef[] | undefined): string {
  const lotKey = (details as { lotKey?: unknown } | null)?.lotKey;
  const line = typeof lotKey === "string" ? lines?.find((entry) => entry.lotKey === lotKey) : undefined;
  return lotTooLargeText(line?.lot ?? undefined);
}
