/**
 * Phone mapping between the form value (country + national number) and the
 * contract `Phone = {country, e164}` (api-contract.md, SA revision 1).
 *
 * The country list is still provisional (Q-UP-09; DEP-UP-01/02 are proposed,
 * not installed). US +1 is the default shown in S1-S3.
 */
export const PHONE_COUNTRIES = [
  { code: "US", dial: "+1", name: "United States" },
  { code: "TH", dial: "+66", name: "Thailand" },
] as const;

export type PhoneCountry = (typeof PHONE_COUNTRIES)[number];
export type PhoneValue = { country: string; number: string };
export type ContractPhone = { country: string; e164: string };

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0].code;

/** Same rule as the gateway `phoneSchema.e164`. */
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function phoneCountry(code: string): PhoneCountry {
  return PHONE_COUNTRIES.find((entry) => entry.code === code) ?? PHONE_COUNTRIES[0];
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
