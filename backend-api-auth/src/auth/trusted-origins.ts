/**
 * Origins Better Auth accepts for sign-in and other state-changing requests. Always the frontend origin
 * (plus its 127.0.0.1 twin for localhost); `extra` is the optional comma-separated `AUTH_EXTRA_TRUSTED_ORIGINS`
 * used by the dev LAN preview (e.g. "http://192.168.0.104"). Invalid entries are ignored.
 */
export function trustedOriginsFor(frontendUrl: string, extra = ""): string[] {
  const origins = new Set<string>();
  const frontend = new URL(frontendUrl);
  origins.add(frontend.origin);
  if (frontend.hostname === "localhost") {
    const loopback = new URL(frontend);
    loopback.hostname = "127.0.0.1";
    origins.add(loopback.origin);
  }
  for (const entry of extra.split(",").map((value) => value.trim()).filter(Boolean)) {
    try {
      const url = new URL(entry);
      if (url.protocol === "http:" || url.protocol === "https:") origins.add(url.origin);
    } catch {
      // Not a URL: skip it rather than trusting a malformed origin.
    }
  }
  return [...origins];
}
