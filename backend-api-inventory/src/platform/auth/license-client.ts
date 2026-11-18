import { readFile } from "node:fs/promises";
import type { LicenseState } from "./principal";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DEADLINE_MS = 2_000;

/** File secret `INVENTORY_AUTH_SERVICE_TOKEN_FILE` (32 random bytes, base64url), accepted by auth since BE-LS-001. */
export async function readServiceToken(path: string | undefined): Promise<string | null> {
  if (!path || path.length > 512) return null;
  try {
    let token = await readFile(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    if (!TOKEN_RE.test(token)) return null;
    const bytes = Buffer.from(token, "base64url");
    return bytes.length === 32 && bytes.toString("base64url") === token ? token : null;
  } catch {
    return null;
  }
}

/** License decision from auth `POST /internal/v1/license/current` (2 s); any doubt → UNAVAILABLE (fail closed). */
export function createLicenseClient(authServiceUrl: string, tokenFile: string | undefined, fetcher: typeof fetch = fetch) {
  const url = new URL(`${authServiceUrl.replace(/\/$/, "")}/internal/v1/license/current`);
  return async (userId: string, sessionId: string): Promise<LicenseState> => {
    const token = await readServiceToken(tokenFile);
    if (!token) return "UNAVAILABLE";
    // A bounded timer that is cleared once the body is settled. `AbortSignal.timeout` kept firing after the response
    // completed; with an unread body (401/403) undici then closed the stream twice and the process crashed
    // ("ReadableStream is already closed", dev 2026-11-17). Unread bodies are cancelled explicitly.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
    try {
      const response = await fetcher(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userId, sessionId }),
        signal: controller.signal,
        redirect: "error",
      });
      if (response.status === 200) {
        const body = (await response.json()) as Record<string, unknown>;
        return body?.decision === "ELIGIBLE" && ["VALID", "EXPIRING", "GRACE"].includes(String(body.status)) ? "ELIGIBLE" : "UNAVAILABLE";
      }
      await discardBody(response);
      if (response.status === 401) return "UNAUTHENTICATED";
      if (response.status === 403) return "DENIED";
      return "UNAVAILABLE";
    } catch {
      return "UNAVAILABLE";
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Releases an unread fetch body without throwing (keeps the undici stream state consistent). */
export async function discardBody(response: Response): Promise<void> {
  try {
    if (response.body && !response.bodyUsed) await response.body.cancel();
  } catch {
    // already closed or errored: nothing to release
  }
}
