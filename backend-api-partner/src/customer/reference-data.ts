/**
 * Static option lists (architecture.md §9, D-09). Built once at start; ~30 KB in memory.
 * Currencies: Node/ICU `Intl.supportedValuesOf("currency")`, sorted by code.
 * Countries: ISO 3166-1 alpha-2 (249 codes), English names via `Intl.DisplayNames`, sorted by name.
 */
export type OptionItem = { code: string; name: string };

const ISO_3166_ALPHA2 = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

function displayName(names: Intl.DisplayNames, code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

function buildCurrencies(): OptionItem[] {
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return Intl.supportedValuesOf("currency")
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .map((code) => ({ code, name: displayName(names, code) }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .slice(0, 400);
}

function buildCountries(): OptionItem[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return ISO_3166_ALPHA2
    .map((code) => ({ code, name: displayName(names, code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en") || (a.code < b.code ? -1 : 1));
}

export const CURRENCY_OPTIONS: readonly OptionItem[] = Object.freeze(buildCurrencies());
export const COUNTRY_OPTIONS: readonly OptionItem[] = Object.freeze(buildCountries());
export const CURRENCY_CODES: ReadonlySet<string> = new Set(CURRENCY_OPTIONS.map((item) => item.code));
export const COUNTRY_CODES: ReadonlySet<string> = new Set(ISO_3166_ALPHA2);
export const OPTIONS_RESPONSE = Object.freeze({ currencies: CURRENCY_OPTIONS, countries: COUNTRY_OPTIONS });
