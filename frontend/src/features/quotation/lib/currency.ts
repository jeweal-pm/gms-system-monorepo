import type { Option } from "../components/ui";

/** One row of `currency.options` (currency SA-CUR-03): rates are "1 {code} = rate {base}". */
export type CurrencyOptionItem = { code: string; name: string; active: boolean; sellingRate: string | null; buyingRate: string | null };

/**
 * Currency choices for a quotation (currency UI rev 1): active currencies from Setup › Currency, plus the
 * current value when it has become inactive or is missing, so a saved quotation still shows it.
 */
export function quotationCurrencyOptions(items: readonly CurrencyOptionItem[], current: string): Option[] {
  const options = items.filter((item) => item.active || item.code === current).map((item) => ({ value: item.code, label: item.active ? item.code : `${item.code} (inactive)` }));
  if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: current });
  return options;
}

/**
 * Exchange Rate for a quotation: the currency's Selling Rate (selling to a customer, Q-CUR-07). The base
 * currency and a currency without rates leave it empty.
 */
export function quotationExchangeRate(items: readonly CurrencyOptionItem[], baseCode: string | null, code: string): string {
  if (!code || code === baseCode) return "";
  return items.find((item) => item.code === code)?.sellingRate ?? "";
}
