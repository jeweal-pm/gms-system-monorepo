/**
 * Document numbering helpers (document-setup UI rev 1, owner 2026-10-23). A row applies from its Date
 * until the next row's Date; the number is Prefix + Separator ("Suffix") + running number, no padding
 * (Q-DS-04, Q-DS-05).
 */

export function formatDocumentNumber(prefix: string, separator: string, startNo: string | number): string {
  const number = String(startNo).trim();
  return `${prefix.trim().toUpperCase()}${separator}${number}`;
}

/** Today in the viewer's time zone as YYYY-MM-DD (the date column is a plain calendar day). */
export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export type RowStatus = "in-use" | "upcoming" | "past" | null;

/**
 * Status per row for the given dates (any order): the latest date on or before today is "in-use", later
 * dates are "upcoming", earlier ones "past"; empty or invalid dates get null.
 */
export function rowStatuses(dates: readonly string[], today: string = todayIso()): RowStatus[] {
  const valid = dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const current = valid.filter((date) => date <= today).sort().at(-1);
  // Only one row is in use even when two rows share that date (Save reports the duplicate).
  const inUseIndex = current === undefined ? -1 : dates.indexOf(current);
  return dates.map((date, index) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (date > today) return "upcoming";
    return index === inUseIndex ? "in-use" : "past";
  });
}

/** Row order by Date (ascending); rows without a date go last. Stable for equal dates. */
export function compareRowDates(a: { effectiveDate: string }, b: { effectiveDate: string }): number {
  return (a.effectiveDate === "" ? 1 : 0) - (b.effectiveDate === "" ? 1 : 0) || a.effectiveDate.localeCompare(b.effectiveDate);
}

/** "2026-10-23" → "23/10/2026" for read-only display. */
export function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}
