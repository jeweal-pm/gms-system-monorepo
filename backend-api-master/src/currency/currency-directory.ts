import type { Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";

/**
 * Currency reads shared by Company Profile, Vendor and Customer (currency SA-CUR-05): the selects list the
 * currency master instead of the ICU list, and a save accepts an active currency or the code already stored
 * on the record. Bounded to 500 rows (SA-CUR-08).
 */
export const CURRENCY_OPTIONS_LIMIT = 500;

export type CurrencyOption = { code: string; name: string; active: boolean };

type Client = Tx | typeof prisma;

export async function currencyOptions(client: Client = prisma): Promise<CurrencyOption[]> {
  return client.currency.findMany({ select: { code: true, name: true, active: true }, orderBy: { code: "asc" }, take: CURRENCY_OPTIONS_LIMIT });
}

/** True when `code` is an active currency, or equals `storedCode` (an old, now-inactive choice may stay). */
export async function isCurrencyAllowed(client: Client, code: string, storedCode?: string | null): Promise<boolean> {
  if (code === storedCode) return true;
  const row = await client.currency.findUnique({ where: { code }, select: { active: true } });
  return row?.active === true;
}
