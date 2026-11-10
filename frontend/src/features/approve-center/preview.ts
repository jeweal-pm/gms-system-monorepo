import type { AvailableMenu } from "./menus";
import { DASH, PENDING_STATUS, shortDate, submittedTime, submitterText, type ApprovalRow } from "./model";

/**
 * Approve Center UI rev 2 (owner 2026-11-10): the document preview modal. Pure rules only; the data is the existing
 * per-document `get` (shared document engine `toDetail`), so no backend change.
 */

/** The `get` fields the modal reads; every approvable document's detail satisfies it (checked in `documentClients`). */
export type PreviewLine = {
  stoneCode?: string | null;
  stockId?: string | null;
  stone: string;
  shape: string;
  size: string;
  pcs: number;
  weightCt: string;
  amount: string;
  /** Memo receive lines have no location. */
  location?: string | null;
};
export type PreviewDetail = {
  id: string;
  docNo: string;
  status: string;
  version: number;
  docDate: string;
  currency: string;
  exchangeRate: string | null;
  documentNote: string;
  customer?: { name: string } | null;
  vendor?: { name: string } | null;
  lines: readonly PreviewLine[];
  totals: { grandTotal: string };
  deletedAt?: string | null;
};

// ---------- exact decimal maths (no floating point on money) ----------

// The tsconfig target is below ES2020, so no `0n` literals.
const ZERO = BigInt(0);
const TEN = BigInt(10);
const TWO = BigInt(2);

function toScaled(value: string, scale: number): bigint {
  const text = value.trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const digits = BigInt(`${whole || "0"}${fraction.padEnd(scale, "0").slice(0, scale)}`);
  return negative ? -digits : digits;
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < ZERO;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
}

/** Divides by 10^drop, rounding half away from zero; a negative `drop` pads with zeros instead. */
function roundDown(value: bigint, drop: number): bigint {
  if (drop === 0) return value;
  if (drop < 0) return value * TEN ** BigInt(-drop);
  const divisor = TEN ** BigInt(drop);
  const half = divisor / TWO;
  return value >= ZERO ? (value + half) / divisor : -((-value + half) / divisor);
}

const fractionLength = (value: string) => value.split(".")[1]?.length ?? 0;

/** a × b rounded half-up to `places` decimals, as text. */
export function multiplyDecimal(a: string, b: string, places: number): string {
  const scaleA = fractionLength(a);
  const scaleB = fractionLength(b);
  const product = toScaled(a, scaleA) * toScaled(b, scaleB);
  return fromScaled(roundDown(product, scaleA + scaleB - places), places);
}

/** Σ values at `places` decimals (each value already has at most `places`). */
export function sumDecimal(values: readonly string[], places: number): string {
  return fromScaled(values.reduce((total, value) => total + toScaled(value, places), ZERO), places);
}

// ---------- view model ----------

/** Converts to the company currency only when the document has a rate and another currency (Q-AP-17). */
export function converts(detail: Pick<PreviewDetail, "currency" | "exchangeRate">, baseCurrency: string | null): boolean {
  return Boolean(detail.exchangeRate) && detail.currency !== baseCurrency;
}

/** Line value in the company currency: amount × rate, half-up to the price places; no rate → the amount. */
export function lineValue(amount: string, rate: string | null, places: number): string {
  return rate ? multiplyDecimal(amount, rate, places) : multiplyDecimal(amount, "1", places);
}

export const stoneText = (line: Pick<PreviewLine, "stone" | "shape" | "size">) => [line.stone, line.shape, line.size].map((part) => part?.trim()).filter(Boolean).join(" ");

/** Stone code; memo lines without one show their Stock ID. */
export const stoneCodeText = (line: Pick<PreviewLine, "stoneCode" | "stockId">) => line.stoneCode?.trim() || line.stockId?.trim() || DASH;

export const currencyText = (detail: Pick<PreviewDetail, "currency" | "exchangeRate">, baseCurrency: string | null) =>
  converts(detail, baseCurrency) ? `${detail.currency} · rate ${detail.exchangeRate}` : detail.currency;

export type PreviewRow = { key: number; index: number; code: string; stone: string; orderedBy: string | null; pcs: number; weightCt: string; value: string; location: string };
export type PreviewView = {
  partyLabel: "Customer" | "Vendor";
  partyName: string;
  docDate: string;
  currency: string;
  valueCurrency: string;
  /** Customer documents show "Ordered by" + the customer under each stone (Q-AP-20); vendor documents don't. */
  orderedBy: boolean;
  rows: PreviewRow[];
  totals: { pcs: number; weightCt: string; value: string };
  /** Shown only when the document's grand total differs from the line sum (Q-AP-21). */
  grandTotal: string | null;
  note: string;
};

export function previewView(menu: AvailableMenu, detail: PreviewDetail, baseCurrency: string | null, pricePlaces: number): PreviewView {
  const rate = converts(detail, baseCurrency) ? detail.exchangeRate : null;
  const customer = menu.party === "customer";
  const partyName = (customer ? detail.customer?.name : detail.vendor?.name) || DASH;
  const rows = detail.lines.map((line, index) => ({
    key: index,
    index: index + 1,
    code: stoneCodeText(line),
    stone: stoneText(line) || DASH,
    orderedBy: customer ? partyName : null,
    pcs: line.pcs,
    weightCt: line.weightCt,
    value: lineValue(line.amount, rate, pricePlaces),
    location: line.location?.trim() || DASH,
  }));
  const value = sumDecimal(rows.map((row) => row.value), pricePlaces);
  const grand = lineValue(detail.totals.grandTotal, rate, pricePlaces);
  return {
    partyLabel: customer ? "Customer" : "Vendor",
    partyName,
    docDate: shortDate(detail.docDate),
    currency: currencyText(detail, baseCurrency),
    valueCurrency: rate ? (baseCurrency ?? detail.currency) : detail.currency,
    orderedBy: customer,
    rows,
    totals: { pcs: rows.reduce((total, row) => total + row.pcs, 0), weightCt: sumDecimal(detail.lines.map((line) => line.weightCt), 3), value },
    grandTotal: toScaled(grand, pricePlaces) === toScaled(value, pricePlaces) ? null : grand,
    note: detail.documentNote.trim(),
  };
}

/** A loaded document that is no longer waiting (approved meanwhile, deleted, …): Approve is hidden. */
export const isStillPending = (detail: Pick<PreviewDetail, "status" | "deletedAt">) => detail.status === PENDING_STATUS && !detail.deletedAt;

/** "waiting < 1 h" / "waiting 5 h" / "waiting 1 day" / "waiting 6 days". */
export function waitingText(sinceIso: string, now: Date): string {
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return "";
  const hours = Math.max(0, Math.floor((now.getTime() - since) / 3_600_000));
  if (hours < 1) return "waiting < 1 h";
  if (hours < 24) return `waiting ${hours} h`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} ${days === 1 ? "day" : "days"}`;
}

/** Header sub line: "Submitted by {name} ({role}) · {time} · waiting …"; phase 1 has no submitter, so "Last saved …". */
export function submittedLine(row: ApprovalRow, now: Date): string {
  const who = submitterText(row);
  const time = submittedTime(row.submittedAt).replace(/\/(\d{2})(\d{2}) /, "/$2 ");
  const lead = who === DASH ? `Last saved ${time}` : `Submitted by ${who} · ${time}`;
  const waiting = waitingText(row.submittedAt, now);
  return waiting ? `${lead} · ${waiting}` : lead;
}

export const PREVIEW_LOAD_ERROR = (docNo: string) => `Couldn't load ${docNo}.`;
export const NO_LONGER_PENDING = (docNo: string) => `${docNo} is no longer waiting for approval.`;
