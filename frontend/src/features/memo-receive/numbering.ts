/**
 * Memo Receive numbers (ADR-0033 D3/D4), computed in the browser until the Memo Receive API exists.
 * Same rules as the server's Quotation numbering: the Document Setup row in effect on the doc date
 * (latest effective date ≤ doc date) gives prefix + separator + running — its start number, then the
 * highest issued number for that row + 1; without a row the number is plain 1, 2, 3 (Q-MR-02).
 */
export type NumberingRow = { id: string; effectiveDate: string; prefix: string; separator: string; startNo: number };
export type IssuedNumber = { numberingId: string | null; runningNo: number };

export function rowInEffect(rows: readonly NumberingRow[], docDate: string): NumberingRow | null {
  let best: NumberingRow | null = null;
  for (const row of rows) {
    if (row.effectiveDate <= docDate && (!best || row.effectiveDate > best.effectiveDate)) best = row;
  }
  return best;
}

export function nextDocNumber(rows: readonly NumberingRow[], docDate: string, issued: readonly IssuedNumber[]): IssuedNumber & { docNo: string } {
  const row = rowInEffect(rows, docDate);
  const numberingId = row?.id ?? null;
  const highest = issued.filter((entry) => entry.numberingId === numberingId).reduce((max, entry) => Math.max(max, entry.runningNo), 0);
  const runningNo = row ? Math.max(highest + 1, row.startNo) : highest + 1;
  return { numberingId, runningNo, docNo: row ? `${row.prefix}${row.separator}${runningNo}` : String(runningNo) };
}
