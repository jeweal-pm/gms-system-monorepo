import { useQuery } from "@tanstack/react-query";
import type { SelectOption } from "@/components/ui/select-field";

/**
 * Address State/Province + City dropdowns (owner 2026-10-19): choosing a Country loads its list from
 * the static `public/regions/<CC>.json` (scripts/generate-region-files.mjs); choosing a City fills its
 * State/Province, choosing a State/Province narrows the City list. The form still stores plain names,
 * so the gateway contract is unchanged. Countries without a file keep the free-text fields.
 */
export type RegionFile = { states: string[]; cities: [name: string, stateIndex: number][] };

/** `null`: no list for this country (free text). */
export type RegionData = RegionFile | null;

export type RegionStatus = "idle" | "loading" | "error" | "ready";

const COUNTRY_CODE = /^[A-Z]{2}$/;
const SEPARATOR = "\u001f";

/** Keeps only well-formed rows; anything else in the file means "no list". */
export function parseRegionFile(input: unknown): RegionData {
  if (!input || typeof input !== "object") return null;
  const { states, cities } = input as Partial<RegionFile>;
  if (!Array.isArray(states) || !Array.isArray(cities) || !states.every((name) => typeof name === "string")) return null;
  const rows = cities.filter(
    (row): row is [string, number] => Array.isArray(row) && typeof row[0] === "string" && Number.isInteger(row[1]) && row[1] >= 0 && row[1] < states.length,
  );
  return states.length > 0 ? { states, cities: rows } : null;
}

export async function fetchRegionData(countryCode: string, fetcher: typeof fetch = fetch): Promise<RegionData> {
  if (!COUNTRY_CODE.test(countryCode)) return null;
  const response = await fetcher(`/regions/${countryCode}.json`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Region list ${countryCode}: HTTP ${response.status}`);
  return parseRegionFile(await response.json());
}

/** The chosen country's region lists; idle until a country is chosen. Files are static, so they never go stale. */
export function useRegionData(countryCode: string): { status: RegionStatus; data: RegionData; retry: () => void } {
  const enabled = COUNTRY_CODE.test(countryCode);
  const query = useQuery({
    queryKey: ["regions", countryCode],
    queryFn: () => fetchRegionData(countryCode),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const status: RegionStatus = !enabled ? "idle" : query.isPending ? "loading" : query.isError ? "error" : "ready";
  return { status, data: query.data ?? null, retry: () => void query.refetch() };
}

/** A saved name missing from the list stays selectable so existing records still show their value. */
function withCurrent(options: SelectOption[], current: string, value = current): SelectOption[] {
  if (!current || options.some((option) => option.value === value)) return options;
  return [{ value, label: current }, ...options];
}

export function stateOptions(data: RegionFile, currentState: string): SelectOption[] {
  return withCurrent(data.states.map((name) => ({ value: name, label: name })), currentState);
}

/** Select value of a City option: the city and its state, so same-named cities in different states stay distinct. */
export function cityKey(city: string, state: string) {
  return `${state}${SEPARATOR}${city}`;
}

export function parseCityKey(key: string): { city: string; state: string } {
  const at = key.indexOf(SEPARATOR);
  return at < 0 ? { city: key, state: "" } : { state: key.slice(0, at), city: key.slice(at + SEPARATOR.length) };
}

/** Cities of the chosen state, or of the whole country ("City, State") while no state is chosen. */
export function cityOptions(data: RegionFile, state: string, currentCity: string): SelectOption[] {
  const stateIndex = state ? data.states.indexOf(state) : -1;
  const options =
    stateIndex >= 0
      ? data.cities.filter(([, index]) => index === stateIndex).map(([name]) => ({ value: cityKey(name, state), label: name }))
      : state
        ? []
        : data.cities.map(([name, index]) => ({ value: cityKey(name, data.states[index]), label: `${name}, ${data.states[index]}` }));
  return withCurrent(options, currentCity, cityKey(currentCity, state));
}

/** Whether the chosen state has any listed city; without one the City field falls back to free text. */
export function hasCities(data: RegionFile, state: string) {
  if (!state) return data.cities.length > 0;
  const stateIndex = data.states.indexOf(state);
  return stateIndex >= 0 && data.cities.some(([, index]) => index === stateIndex);
}

/** Whether `city` is listed under `state`; a city outside the newly chosen state is cleared. */
export function cityInState(data: RegionFile, city: string, state: string) {
  const stateIndex = data.states.indexOf(state);
  return stateIndex >= 0 && data.cities.some(([name, index]) => index === stateIndex && name === city);
}
