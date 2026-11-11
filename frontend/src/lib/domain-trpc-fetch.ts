import { claimLease, newLeaseOwner, releaseLease, sleep, type LeaseStorage } from "./tab-lease";

let refreshInFlight: Promise<boolean> | null = null;

/** Adds same-origin credentials and renews expired access only for safe reads. */
export function createDomainTrpcFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-gms-csrf", "1");
    const request = { ...init, credentials: "include" as const, headers };
    const response = await baseFetch(input, request);
    if (response.status !== 401 || !isSafeDomainRead(input, request)) return response;
    if (!await refreshAccess(baseFetch, headers)) return response;
    // A single retry only. A second 401 is returned to the caller without a loop.
    return baseFetch(input, request);
  };
}

function isSafeDomainRead(input: RequestInfo | URL, init: RequestInit): boolean {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET") return false;
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const pathname = rawUrl.startsWith("/") ? rawUrl.split(/[?#]/, 1)[0] : new URL(rawUrl).pathname;
  return pathname === "/api/auth/trpc" || pathname.startsWith("/api/auth/trpc/") || pathname === "/api/master/trpc" || pathname.startsWith("/api/master/trpc/");
}

function refreshAccess(baseFetch: typeof fetch, requestHeaders: Headers): Promise<boolean> {
  if (!refreshInFlight) {
    const headers = new Headers({ "x-gms-csrf": requestHeaders.get("x-gms-csrf") ?? "1" });
    const run = () => baseFetch("/api/auth/refresh", { method: "POST", credentials: "include", headers }).then((response) => response.status === 204);
    refreshInFlight = coordinatedRenew(run, browserRenewCoordination())
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/** INV-20261111-001: the cross-tab lock name and the shared "last renewed" mark. */
export const RENEW_LOCK = "gms-auth-refresh";
export const RENEWED_AT_KEY = "gms.auth.renewedAt";
/** Another tab renewed this recently: the shared cookie jar already holds the new access cookie. */
export const RENEWED_RECENTLY_MS = 10_000;

/** Without Web Locks (plain-http LAN address): a localStorage lease marks the tab that is renewing. */
export const RENEWING_KEY = "gms.auth.renewing";
export const RENEW_LEASE_MS = 5_000;
const RENEW_WAIT_STEP_MS = 100;

export type RenewCoordination = {
  /** Web Locks when the page is a secure context; null otherwise. */
  locks: { request<T>(name: string, callback: () => Promise<T>): Promise<T> } | null;
  storage: LeaseStorage;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  owner: string;
};

function browserRenewCoordination(): RenewCoordination | null {
  if (typeof window === "undefined") return null;
  let storage: Storage;
  try { storage = window.localStorage; } catch { return null; }
  const locks = typeof navigator !== "undefined" && navigator.locks ? (navigator.locks as NonNullable<RenewCoordination["locks"]>) : null;
  return { locks, storage, now: Date.now, sleep, owner: newLeaseOwner() };
}

function renewedRecently({ storage, now }: RenewCoordination): boolean {
  let last = Number.NaN;
  try { last = Number(storage.getItem(RENEWED_AT_KEY)); } catch { /* storage blocked: renew */ }
  return Number.isFinite(last) && last > 0 && now() - last >= 0 && now() - last < RENEWED_RECENTLY_MS;
}

async function renewOnce(run: () => Promise<boolean>, coordination: RenewCoordination): Promise<boolean> {
  if (renewedRecently(coordination)) return true;
  const renewed = await run();
  if (renewed) {
    try { coordination.storage.setItem(RENEWED_AT_KEY, String(coordination.now())); } catch { /* storage blocked */ }
  }
  return renewed;
}

/**
 * INV-20261111-001: a refresh token is single-use (reuse revokes the family), so tabs sharing one cookie jar must not
 * refresh at the same moment. One tab at a time renews (Web Lock, or a localStorage lease without Web Locks); a tab that
 * waited behind a renewal finished moments ago reuses it instead of sending the already rotated refresh cookie.
 */
export async function coordinatedRenew(run: () => Promise<boolean>, coordination: RenewCoordination | null): Promise<boolean> {
  if (!coordination) return run();
  if (coordination.locks) return coordination.locks.request(RENEW_LOCK, () => renewOnce(run, coordination));
  const { storage, now, sleep: wait, owner } = coordination;
  // Wait (bounded) while another tab renews; then reuse its result or renew here.
  const deadline = now() + RENEW_LEASE_MS + 1_000;
  while (!(await claimLease(storage, RENEWING_KEY, owner, RENEW_LEASE_MS, now, wait))) {
    if (renewedRecently(coordination) || now() >= deadline) break;
    await wait(RENEW_WAIT_STEP_MS);
  }
  try {
    return await renewOnce(run, coordination);
  } finally {
    releaseLease(storage, RENEWING_KEY, owner);
  }
}

/**
 * Renews the access cookie once (shared with any renewal already running). For raw uploads (line photos): their POST
 * is refused before anything is stored when access has expired, so the caller may send it again after a renewal.
 */
export function renewAccess(baseFetch: typeof fetch = fetch): Promise<boolean> {
  return refreshAccess(baseFetch, new Headers({ "x-gms-csrf": "1" }));
}
