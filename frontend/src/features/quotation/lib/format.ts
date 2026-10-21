import { dec, toFixed, type Dec } from "./decimal";

function groupThousands(fixed: string): string {
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export const formatMoney = (value: Dec): string => groupThousands(toFixed(value, 2));
export const formatWeight = (value: Dec): string => groupThousands(toFixed(value, 2));
export const formatMoneyText = (value: string): string => formatMoney(dec(value));

/** yyyy-mm-dd → dd/mm/yyyy */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
