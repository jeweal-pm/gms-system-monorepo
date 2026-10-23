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
    refreshInFlight = baseFetch("/api/auth/refresh", { method: "POST", credentials: "include", headers })
      .then((response) => response.status === 204)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}
