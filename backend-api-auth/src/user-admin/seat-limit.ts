export const DEFAULT_USER_SEAT_LIMIT = 3;
export const MAX_USER_SEAT_LIMIT = 500;
/** Hard cap on list/export rows: seat limit maximum plus Super Admin headroom. */
export const USER_LIST_CAP = 600;

/**
 * `USER_SEAT_LIMIT`: integer 0..500, default 3 when unset or blank (ADR-0017 §2).
 * Counts `role = "user"` accounts including inactive ones; Super Admins are excluded.
 * An invalid value fails startup instead of silently changing the cap.
 */
export function parseUserSeatLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_USER_SEAT_LIMIT;
  const value = raw.trim();
  if (!/^\d{1,3}$/.test(value)) throw new Error("USER_SEAT_LIMIT must be an integer between 0 and 500");
  const limit = Number(value);
  if (limit > MAX_USER_SEAT_LIMIT) throw new Error("USER_SEAT_LIMIT must be an integer between 0 and 500");
  return limit;
}
