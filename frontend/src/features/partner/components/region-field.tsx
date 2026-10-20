"use client";

import { useMemo, type Ref } from "react";
import { ComboboxField } from "@/components/ui/combobox-field";
import { TextField } from "@/components/ui/outlined-field";
import { cityInState, cityKey, cityOptions, hasCities, parseCityKey, stateOptions, type RegionData, type RegionStatus } from "@/lib/regions";

export type RegionValue = { state: string; city: string };

type RegionFieldProps = {
  kind: "state" | "city";
  id: string;
  label: string;
  required?: boolean;
  readOnly: boolean;
  /** Whether a Country is chosen; without one the field is disabled with "Choose a country first". */
  hasCountry: boolean;
  region: { status: RegionStatus; data: RegionData; retry: () => void };
  value: RegionValue;
  /** Both names after a pick: a City fills its State/Province; a new State/Province clears a City outside it. */
  onChange: (next: RegionValue) => void;
  onBlur?: () => void;
  error?: string;
  autoComplete?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/**
 * Address State/Province or City (owner 2026-10-19, replaces the DV-04 free text where a list exists):
 * a searchable dropdown fed by the chosen country's region file. Countries without a file, and states
 * without listed cities, keep free text; the read-only view shows the saved name.
 */
export function RegionField({ kind, id, label, required, readOnly, hasCountry, region, value, onChange, onBlur, error, autoComplete, className, ref }: RegionFieldProps) {
  const current = value[kind];
  const { data, status } = region;
  // Stable option lists: the combobox indexes them for search (up to ~17,000 cities).
  const options = useMemo(
    () => (!data ? [] : kind === "state" ? stateOptions(data, value.state) : cityOptions(data, value.state, value.city)),
    [data, kind, value.state, value.city],
  );
  const shared = { id, label, required, readOnly, className, onBlur, ref };
  const freeText = (placeholder: string) => (
    <TextField
      {...shared}
      autoComplete={autoComplete}
      value={current}
      error={hasCountry ? error : undefined}
      disabled={!hasCountry && !readOnly}
      placeholder={readOnly ? undefined : hasCountry ? placeholder : "Choose a country first"}
      onChange={(event) => onChange({ ...value, [kind]: event.target.value })}
    />
  );

  const textPlaceholder = kind === "state" ? "Enter state or province" : "Enter city";
  if (readOnly) return freeText(textPlaceholder);
  if (!hasCountry) return <ComboboxField {...shared} value="" onChange={() => {}} disabled placeholder="Choose a country first" options={[]} />;
  if (status === "ready" && !data) return freeText(textPlaceholder);
  if (kind === "city" && data && !hasCities(data, value.state)) return freeText(textPlaceholder);

  const combobox = { ...shared, error, status: status === "error" ? "error" : status === "ready" ? "ready" : "loading", onRetry: region.retry } as const;
  if (kind === "state") {
    return (
      <ComboboxField
        {...combobox}
        placeholder="Search state or province"
        options={options}
        value={value.state}
        onChange={(state) => onChange({ state, city: state && data && cityInState(data, value.city, state) ? value.city : "" })}
      />
    );
  }
  return (
    <ComboboxField
      {...combobox}
      placeholder="Search city"
      options={options}
      value={value.city ? cityKey(value.city, value.state) : ""}
      onChange={(key) => {
        const picked = parseCityKey(key);
        onChange({ city: picked.city, state: picked.state || value.state });
      }}
    />
  );
}
