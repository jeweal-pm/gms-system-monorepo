import { getCountries, getCountryCallingCode } from "libphonenumber-js";

/**
 * Phone mapping between the form value (country + national number) and the
 * contract `Phone = {country, e164}` (api-contract.md, SA revision 1).
 *
 * Country list (owner 2026-10-17, option A): every country libphonenumber-js supports (245), with
 * its calling code from the same library, so the list always matches phone validation. English
 * names come from `Intl.DisplayNames`; flags are local SVGs from country-flag-icons (PhoneField).
 * US +1 stays the default shown in S1-S3.
 */
export type PhoneCountry = { code: string; dial: string; name: string };
export type PhoneValue = { country: string; number: string };
export type ContractPhone = { country: string; e164: string };

function countryName(names: Intl.DisplayNames | null, code: string): string {
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

function buildCountries(): PhoneCountry[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    // Older engines without DisplayNames: the ISO code is shown instead of the name.
  }
  return getCountries()
    .map((code) => ({ code, dial: `+${getCountryCallingCode(code)}`, name: countryName(names, code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Sorted by English name. */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = Object.freeze(buildCountries());

export const DEFAULT_PHONE_COUNTRY = "US";

const DEFAULT_COUNTRY: PhoneCountry = PHONE_COUNTRIES.find((entry) => entry.code === DEFAULT_PHONE_COUNTRY) ?? { code: "US", dial: "+1", name: "United States" };

/** Same rule as the gateway `phoneSchema.e164`. */
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function phoneCountry(code: string): PhoneCountry {
  return PHONE_COUNTRIES.find((entry) => entry.code === code) ?? DEFAULT_COUNTRY;
}

/**
 * National number -> E.164. Spaces are removed and a leading trunk "0" is
 * dropped (TH "081 234 5678" -> "+66812345678"). Returns null when the result
 * does not satisfy the contract pattern.
 */
export function toE164(value: PhoneValue): string | null {
  const digits = value.number.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 0) return null;
  const e164 = `${phoneCountry(value.country).dial}${digits}`;
  return E164_PATTERN.test(e164) ? e164 : null;
}

export function toContractPhone(value: PhoneValue): ContractPhone | null {
  const e164 = toE164(value);
  return e164 === null ? null : { country: phoneCountry(value.country).code, e164 };
}

/** Contract phone -> form value for the read-only view. A null phone shows an empty number. */
export function fromContractPhone(phone: ContractPhone | null): PhoneValue {
  if (!phone) return { country: DEFAULT_PHONE_COUNTRY, number: "" };
  const known = PHONE_COUNTRIES.find((entry) => entry.code === phone.country);
  if (known && phone.e164.startsWith(known.dial)) return { country: known.code, number: phone.e164.slice(known.dial.length) };
  return { country: known?.code ?? DEFAULT_PHONE_COUNTRY, number: phone.e164 };
}
