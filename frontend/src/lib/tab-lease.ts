/**
 * INV-20261111-001: a small cross-tab lease in localStorage, for browsers without Web Locks (Web Locks need a secure
 * context, so the plain-http LAN address has none). A tab claims a free / expired lease, waits LEASE_SETTLE_MS and
 * keeps it only if its own claim survived (the last writer of a near-simultaneous claim wins; the other backs off).
 */
export type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type Lease = { owner: string; until: number };

export const LEASE_SETTLE_MS = 100;

export function readLease(storage: LeaseStorage, key: string): Lease | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "null") as Partial<Lease> | null;
    return value && typeof value.owner === "string" && typeof value.until === "number" ? { owner: value.owner, until: value.until } : null;
  } catch {
    return null;
  }
}

export function writeLease(storage: LeaseStorage, key: string, owner: string, until: number): boolean {
  try {
    storage.setItem(key, JSON.stringify({ owner, until }));
    return true;
  } catch {
    return false;
  }
}

export function releaseLease(storage: LeaseStorage, key: string, owner: string) {
  if (readLease(storage, key)?.owner !== owner) return;
  try {
    storage.removeItem(key);
  } catch {
    // storage blocked: the lease simply expires
  }
}

/** True when this tab now holds the lease for `ttlMs`. */
export async function claimLease(storage: LeaseStorage, key: string, owner: string, ttlMs: number, now: () => number, sleep: (ms: number) => Promise<void>): Promise<boolean> {
  const current = readLease(storage, key);
  if (current && current.owner !== owner && current.until > now()) return false;
  if (!writeLease(storage, key, owner, now() + ttlMs)) return false;
  await sleep(LEASE_SETTLE_MS);
  return readLease(storage, key)?.owner === owner;
}

export function newLeaseOwner(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
