import type { ServerFieldError } from "@/lib/trpc-error";

/**
 * load-to-stock phase 2 (quotation ui-spec Revision 3, reserve Revision 2, memo-out Revision 4, memo-out-return
 * Revision 5): our stock is checked in inventory on Save / Approve.
 */
export const INVENTORY_UNAVAILABLE_TEXT = "Our stock can't be checked right now; try again";
/** `<CODE>_BUSY` 409 (`details.retryAfterSeconds` 5): the document's inventory hold is still being applied. */
export const STOCK_BUSY_TEXT = "Updating our stock; try again in a few seconds";
/** Q-LS-P2-05: grey hint next to the status chip while `syncState` is SYNCING. */
export const SYNCING_HINT = "Updating our stock…";

export const isStockBusyCode = (code: string | null, prefix: string) => code === `${prefix}_BUSY`;

/**
 * A From Stock row the server refused, as "Row N: …" (first one wins). `exceeds_pending` with `params.availablePcs`
 * comes from our stock (SA-LS-P2-09); without params it is a Memo Stock row. `shortText` words our-stock shortage:
 * Quotation "More than available", Reserve / Memo Out "only x pcs left".
 */
export function stockRowMessage(fieldErrors: readonly ServerFieldError[], noun: string, shortText: (available: { pcs: string; weightCt: string }) => string): string | undefined {
  for (const entry of fieldErrors) {
    const match = /^lines\.(\d+)\.(memoStockId|ownStockId|pcs|weightCt)$/.exec(entry.path);
    if (!match) continue;
    const row = `Row ${Number(match[1]) + 1}`;
    if (entry.code === "exceeds_pending") {
      const pcs = entry.params?.availablePcs;
      if (pcs === undefined) return `${row}: More than pending`;
      return `${row}: ${shortText({ pcs: String(pcs), weightCt: String(entry.params?.availableWeightCt ?? "") })}`;
    }
    const reference = match[2] === "memoStockId" || match[2] === "ownStockId";
    if (reference && entry.code === "invalid_reference") return `${row}: This stock item no longer exists. Remove the row.`;
    if (reference && entry.code === "duplicate") return `${row}: This stock item is already on the ${noun}.`;
  }
  return undefined;
}

/** Reserve / Memo Out wording (reserve Revision 2): "Row N: only x pcs left". */
export const onlyLeftText = (available: { pcs: string }) => `only ${available.pcs} pcs left`;

/** While a document's inventory hold syncs, its detail is read again every 5 s (the BUSY `retryAfterSeconds`), then stops. */
export const SYNC_REFETCH_MS = 5_000;
export const syncRefetchInterval = (query: { state: { data?: { syncState?: string } | undefined } }) =>
  query.state.data?.syncState === "SYNCING" ? SYNC_REFETCH_MS : false;

/** The header note while syncing: the status note (e.g. "Approved · Read-only") followed by the grey hint. */
export function withSyncingHint<N extends { text: string; tone: string }>(note: N | null): N | { text: string; tone: "muted" } {
  return note ? { ...note, text: `${note.text} · ${SYNCING_HINT}` } : { text: SYNCING_HINT, tone: "muted" };
}
