/**
 * Suggested running Code Name (ADR-0021 §2): `customer.nextCode` / `vendor.nextCode` return the
 * next free `C001` / `V001` style code. It is a suggestion only (nothing is reserved), so it is
 * prefilled into the Code Name field of a new record only while the user has not edited that field.
 */

export type PrefillInput = {
  /** Create mode with ADD permission (the only time a suggestion is requested). */
  enabled: boolean;
  /** Latest suggestion from `nextCode`, undefined while loading or on failure. */
  suggestion: string | undefined;
  /** Current Code Name value. */
  current: string;
  /** The user changed the Code Name field away from its default. */
  codeDirty: boolean;
};

/** True when the suggestion should replace the current Code Name value. */
export function shouldPrefillCode({ enabled, suggestion, current, codeDirty }: PrefillInput): boolean {
  if (!enabled || !suggestion || codeDirty) return false;
  return current !== suggestion;
}

/**
 * Field message after a `*_CODE_TAKEN` save failure when the untouched suggestion was replaced by
 * the newly fetched one, so the user sees why the value changed before saving again.
 */
export function replacedTakenCodeMessage(previous: string, suggestion: string): string {
  return `${previous} is already in use. ${suggestion} is suggested instead; check it, then save again.`;
}
