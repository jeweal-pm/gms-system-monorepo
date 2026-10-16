import { SignJWT } from "jose";
import { createPrivateKey, randomInt } from "node:crypto";
import { z } from "zod";
import type { LicenseConfiguration } from "./license.config";
import { LicenseClientError } from "./license.types";
import type { LicenseClient, LicenseLookup } from "./license.types";

const lookupSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("none") }).strict(),
  z.object({ state: z.literal("pending") }).strict(),
  z.object({ state: z.literal("active"), token: z.string().min(1).max(8_192) }).strict(),
]);
const tokenSchema = z.object({ token: z.string().min(1).max(8_192) }).strict();
const errorSchema = z.object({ error: z.object({ code: z.string().min(1).max(64), message: z.string().max(512) }).strict() }).strict();

export function createLicenseClient(config: LicenseConfiguration): LicenseClient {
  return config.mode === "mock" ? new MockLicenseClient(config) : new HttpLicenseClient(config);
}

export class HttpLicenseClient implements LicenseClient {
  constructor(private readonly config: LicenseConfiguration) {}

  async lookup(email: string): Promise<LicenseLookup> {
    const body = await this.post("/v1/licenses/lookup", { email });
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success) throw protocolError();
    return parsed.data;
  }

  async activate(email: string, key: string): Promise<string> {
    const body = await this.post("/v1/licenses/activate", { email, key }, true);
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw protocolError();
    return parsed.data.token;
  }

  async refresh(email: string): Promise<string> {
    const body = await this.post("/v1/licenses/refresh", { email });
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw protocolError();
    return parsed.data.token;
  }

  private async post(path: string, payload: Record<string, string>, acceptAlreadyActivated = false): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.postOnce(path, payload, acceptAlreadyActivated);
      } catch (error) {
        const retryable = error instanceof LicenseClientError && error.transient && error.httpStatus !== 429;
        if (!retryable || attempt === 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, randomInt(50, 151)));
      }
    }
    throw new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true);
  }

  private async postOnce(path: string, payload: Record<string, string>, acceptAlreadyActivated: boolean): Promise<unknown> {
    const base = this.config.apiUrl;
    if (!base || !this.config.instanceApiKey) throw protocolError();
    const url = new URL(path, base);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-instance-id": this.config.instanceId,
          authorization: `Bearer ${this.config.instanceApiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(1_400),
      });
    } catch {
      throw new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true);
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > 16_384) throw protocolError();
    const raw = await readBoundedText(response, 16_384);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw protocolError(); }

    if (!response.ok) {
      if (acceptAlreadyActivated && response.status === 409) {
        const activated = tokenSchema.safeParse(body);
        if (activated.success) return activated.data;
      }
      const error = errorSchema.safeParse(body);
      if (!error.success) throw protocolError(response.status >= 500);
      const code = error.data.error.code;
      const transient = response.status >= 500 || response.status === 408 || response.status === 429;
      throw new LicenseClientError(code, response.status, transient);
    }
    return body;
  }
}

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw protocolError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof LicenseClientError) throw error;
    throw new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true);
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(body);
}

export class MockLicenseClient implements LicenseClient {
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  constructor(private readonly config: LicenseConfiguration) {
    if (config.mode !== "mock" || !config.mockKid || !config.mockPrivateKeyPkcs8Base64) {
      throw new Error("Mock license client requires development signing key configuration");
    }
    this.privateKey = createPrivateKey({ key: Buffer.from(config.mockPrivateKeyPkcs8Base64, "base64"), format: "der", type: "pkcs8" });
  }

  /**
   * `email` is the license subject (the username, ADR-0020 §2). The scenario is the whole
   * username (`license-expired`) or, for legacy subjects, the part before `@`
   * (`license-expired@example.com`).
   */
  async lookup(email: string): Promise<LicenseLookup> {
    const scenario = email.split("@")[0]?.toLowerCase() ?? "";
    if (scenario === "license-outage") throw new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true);
    if (scenario === "license-pending") return { state: "pending" };
    if (scenario === "license-expired") return { state: "active", token: await this.issue(email, "active", -1) };
    if (scenario === "license-revoked") return { state: "active", token: await this.issue(email, "revoked", 90) };
    if (scenario === "license-suspended") return { state: "active", token: await this.issue(email, "suspended", 90) };
    const days = scenario === "license-expiring" ? 7 : 90;
    return { state: "active", token: await this.issue(email, "active", days) };
  }

  async activate(email: string, key: string): Promise<string> {
    if (email.split("@")[0]?.toLowerCase() === "license-outage") throw new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true);
    if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}$/.test(key)) {
      throw new LicenseClientError("INVALID_KEY", 400, false);
    }
    return this.issue(email, "active", 90);
  }

  async refresh(email: string): Promise<string> {
    const lookup = await this.lookup(email);
    if (lookup.state !== "active") throw new LicenseClientError("LICENSE_NOT_FOUND", 404, false);
    return lookup.token;
  }

  private async issue(email: string, status: "active" | "suspended" | "revoked", days: number): Promise<string> {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    return new SignJWT({
      instance: this.config.instanceId,
      type: "paid",
      status,
      license_expires_at: expiresAt,
    })
      .setProtectedHeader({ alg: "EdDSA", kid: this.config.mockKid!, typ: "JWT" })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(email)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 86_400)
      .sign(this.privateKey);
  }
}

function protocolError(transient = false) {
  return new LicenseClientError("LICENSE_PROTOCOL_ERROR", 503, transient);
}
