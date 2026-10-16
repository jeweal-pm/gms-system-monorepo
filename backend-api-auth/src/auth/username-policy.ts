import { z } from "zod";

/** ADR-0020 §1: trimmed, lowercased, 3..64 of `a-z 0-9 . _ - @ +`, unique, immutable. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 64;
export const USERNAME_PATTERN = /^[a-z0-9._@+-]+$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string) {
  return value.length >= USERNAME_MIN_LENGTH && value.length <= USERNAME_MAX_LENGTH && USERNAME_PATTERN.test(value);
}

/** Internal email required by Better Auth; `.invalid` is reserved (RFC 2606) and never delivered. */
export function internalEmailFor(userId: string) {
  return `${userId}@users.invalid`;
}

export const usernameSchema = z.string()
  .transform(normalizeUsername)
  .pipe(z.string().min(USERNAME_MIN_LENGTH).max(USERNAME_MAX_LENGTH).regex(USERNAME_PATTERN));
