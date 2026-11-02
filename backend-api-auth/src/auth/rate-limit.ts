/** Better Auth sign-in route (strict brute-force limit; the lockout hook reads it too). */
export const SIGN_IN_PATH = "/sign-in/username";
/** Every signed-in page checks the session on mount (about 1–2 calls per navigation). */
const SESSION_PATH = "/get-session";

/**
 * Per-route limits over the global 30 / 60 s. INV-20261102-001: the session check counted against the global bucket,
 * keyed by client address, so normal navigation (several users behind one proxy address) hit 429 and the app signed
 * people out. It gets its own generous bucket; sign-in keeps its strict brute-force limit.
 */
export const AUTH_RATE_LIMIT_RULES = {
  [SIGN_IN_PATH]: { window: 60, max: 5 },
  [SESSION_PATH]: { window: 60, max: 600 },
  // Public, bounded static keys must remain available during a database outage.
  // Better Auth's database-backed global limiter otherwise queries RateLimit here.
  "/jwks": false,
} as const;
