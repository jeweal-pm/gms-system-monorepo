import type { SelectOption } from "@/components/ui/select-field";

/** Currency + Country option lists as returned by a partner options procedure. */
export type PartnerOptionsOutput = {
  currencies: readonly { code: string; name: string }[];
  countries: readonly { code: string; name: string }[];
};

export type SelectOptions = { currencies: SelectOption[]; countries: SelectOption[] };

/** Options handed to the form cards (loading / error + Retry). */
export type OptionsState = {
  currencies: readonly SelectOption[];
  countries: readonly SelectOption[];
  status: "loading" | "error" | "ready";
  onRetry: () => void;
};

/** Options for the native selects: currencies "{code} — {name}" sorted by code, countries by name. */
export function toSelectOptions(output: PartnerOptionsOutput): SelectOptions {
  return {
    currencies: [...output.currencies]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ code, name }) => ({ value: code, label: `${code} — ${name}` })),
    countries: [...output.countries]
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .map(({ code, name }) => ({ value: code, label: name })),
  };
}
