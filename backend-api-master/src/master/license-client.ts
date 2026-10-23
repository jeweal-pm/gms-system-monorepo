import { Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import type { MasterLicenseState } from "./auth-context";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DEADLINE_MS = 2_000;

export function currentLicenseUrl(serviceUrl: string): URL {
  let base: URL;
  try { base = new URL(serviceUrl); } catch { throw new Error("AUTH_SERVICE_URL must be an absolute HTTP URL"); }
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("AUTH_SERVICE_URL is invalid");
  return new URL(`${base.toString().replace(/\/$/, "")}/internal/v1/license/current`);
}

export async function readMasterServiceToken(path = process.env.MASTER_AUTH_SERVICE_TOKEN_FILE): Promise<string | null> {
  if (!path || path.length > 512) return null;
  try {
    let token = await readFile(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    if (!TOKEN_RE.test(token)) return null;
    const bytes = Buffer.from(token, "base64url");
    return bytes.length === 32 && bytes.toString("base64url") === token ? token : null;
  } catch { return null; }
}

@Injectable()
export class MasterLicenseClient {
  async check(userId: string, sessionId: string): Promise<MasterLicenseState> {
    const token = await readMasterServiceToken();
    if (!token) return "UNAVAILABLE";
    let url: URL;
    try { url = currentLicenseUrl(process.env.AUTH_SERVICE_URL ?? ""); } catch { return "UNAVAILABLE"; }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ userId, sessionId }),
        signal: AbortSignal.timeout(DEADLINE_MS),
        redirect: "error",
      });
      if (response.status === 200) {
        const body: unknown = await response.json();
        return isEligible(body) ? "ELIGIBLE" : "UNAVAILABLE";
      }
      if (response.status === 401) return "UNAUTHENTICATED";
      if (response.status === 403) return "DENIED";
      return "UNAVAILABLE";
    } catch { return "UNAVAILABLE"; }
  }
}

function isEligible(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.decision === "ELIGIBLE" && ["VALID", "EXPIRING", "GRACE"].includes(String(result.status)) &&
    typeof result.checkedAt === "string" && Number.isFinite(Date.parse(result.checkedAt)) &&
    (result.fallbackUntil === null || (typeof result.fallbackUntil === "string" && Number.isFinite(Date.parse(result.fallbackUntil))));
}
