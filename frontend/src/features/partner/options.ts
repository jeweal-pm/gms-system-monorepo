import type { SelectOption } from "@/components/ui/select-field";

/** Currency + Country option lists as returned by a partner options procedure. */
export type PartnerOptionsOutput = {
  /** From Setup › Currency (currency SA-CUR-05); inactive ones are kept for saved records. */
  currencies: readonly { code: string; name: string; active: boolean }[];
  countries: readonly { code: string; name: string }[];
};

export type CurrencySelectOption = SelectOption & { active: boolean };
export type SelectOptions = { currencies: CurrencySelectOption[]; countries: SelectOption[] };

/** Options handed to the form cards (loading / error + Retry). */
export type OptionsState = {
  currencies: readonly CurrencySelectOption[];
  countries: readonly SelectOption[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
};

/** Options for the native selects: currencies "{code} — {name}" sorted by code, countries by name. */
export function toSelectOptions(output: PartnerOptionsOutput): SelectOptions {
  return {
    currencies: [...output.currencies]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ code, name, active }) => ({ value: code, label: `${code} — ${name}${active ? "" : " (inactive)"}`, active })),
    countries: [...output.countries]
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .map(({ code, name }) => ({ value: code, label: name })),
  };
}

/** Active currencies, plus the saved one when it has become inactive (currency UI rev 1 rule 3). */
export function currencyChoices(currencies: readonly CurrencySelectOption[], current: string): CurrencySelectOption[] {
  return currencies.filter((option) => option.active || option.value === current);
}
