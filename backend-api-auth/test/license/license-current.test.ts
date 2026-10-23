import { generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpLicenseClient } from "../../src/license/license.client";
import { parseLicenseConfiguration, type LicenseConfiguration } from "../../src/license/license.config";
import { isCurrentLicenseFallbackAllowed, isCurrentLicenseOutage } from "../../src/license/license.service";
import { LicenseClientError, type LicenseClaims } from "../../src/license/license.types";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicDer = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const privateDer = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

function config(url = "http://127.0.0.1:1"): LicenseConfiguration {
  return parseLicenseConfiguration({
    NODE_ENV: "test", LICENSE_MODE: "remote", LICENSE_API_URL: url,
    LICENSE_INSTANCE_ID: "i-1", LICENSE_INSTANCE_API_KEY: "secret",
    LICENSE_JWT_ISSUER: "issuer", LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ test: publicDer }),
  });
}

describe("GP-LIC-02 v2 configuration and grace policy", () => {
  it("defaults to two days and rejects settings outside 0–2", () => {
    expect(config().offlineGraceDays).toBe(2);
    for (const value of ["0", "1", "2"]) {
      expect(parseLicenseConfiguration({
        NODE_ENV: "test", LICENSE_MODE: "remote", LICENSE_API_URL: "http://127.0.0.1:1",
        LICENSE_INSTANCE_ID: "i-1", LICENSE_INSTANCE_API_KEY: "secret",
        LICENSE_JWT_ISSUER: "issuer", LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ test: publicDer }),
        LICENSE_OFFLINE_GRACE_DAYS: value,
      }).offlineGraceDays).toBe(Number(value));
    }
    for (const value of ["3", "7", "-1", "abc", "1.5"]) {
      expect(() => parseLicenseConfiguration({
        NODE_ENV: "test", LICENSE_MODE: "remote", LICENSE_API_URL: "http://127.0.0.1:1",
        LICENSE_INSTANCE_ID: "i-1", LICENSE_INSTANCE_API_KEY: "secret",
        LICENSE_JWT_ISSUER: "issuer", LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ test: publicDer }),
        LICENSE_OFFLINE_GRACE_DAYS: value,
      })).toThrow("LICENSE_OFFLINE_GRACE_DAYS");
    }
  });

  it("allows only active signed v2 proof before all fixed deadlines", () => {
    const now = Date.UTC(2026, 9, 20);
    const claims: LicenseClaims = {
      sub: "a@example.com", iss: "issuer", aud: "f1-system-customer-backend", instance: "i-1",
      type: "paid", status: "active", contract_version: 2,
      license_expires_at: new Date(now + 10 * 86_400_000).toISOString(),
      iat: now / 1_000, exp: now / 1_000 + 3 * 86_400,
    };
    const checkedAt = new Date(now);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 2 * 86_400_000 - 1), 2)).toBe(true);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 2 * 86_400_000), 2)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 86_400_000 - 1), 1)).toBe(true);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 86_400_000), 1)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 1), 0)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed({ ...claims, status: "revoked" }, checkedAt, new Date(now + 1), 2)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed({ ...claims, contract_version: undefined }, checkedAt, new Date(now + 1), 2)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now - 1), 2)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed({ ...claims, license_expires_at: new Date(now + 1).toISOString() }, checkedAt, new Date(now + 1), 2)).toBe(false);
    expect(isCurrentLicenseFallbackAllowed(claims, checkedAt, new Date(now + 3 * 86_400_000), 2)).toBe(false);
  });

  it("classifies 429 and client denial as fail-closed rather than outage", () => {
    expect(isCurrentLicenseOutage(new LicenseClientError("RATE_LIMIT", 429, true))).toBe(false);
    expect(isCurrentLicenseOutage(new LicenseClientError("UNSUPPORTED_CONTRACT", 406, false))).toBe(false);
    expect(isCurrentLicenseOutage(new LicenseClientError("LICENSE_PROTOCOL_ERROR", 503, false))).toBe(false);
    expect(isCurrentLicenseOutage(new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true))).toBe(true);
  });
});

describe("GP-LIC-03 real HTTP v2 refresh boundary", () => {
  const servers: Array<ReturnType<typeof createServer>> = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllGlobals();
  });

  async function serve(status: number, body: unknown, onRequest?: (headers: Record<string, string | string[] | undefined>) => void) {
    const server = createServer((request, response) => {
      onRequest?.(request.headers);
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test port");
    return new HttpLicenseClient(config(`http://127.0.0.1:${address.port}`));
  }

  it("opts in with the v2 header and keeps the legacy refresh without it", async () => {
    const headers: Array<string | undefined> = [];
    const client = await serve(200, { token: "signed-token" }, (request) => headers.push(request["x-license-contract-version"] as string | undefined));
    expect(await client.refreshCurrent("a@example.com")).toBe("signed-token");
    expect(await client.refresh("a@example.com")).toBe("signed-token");
    expect(headers).toEqual(["2", undefined]);
  });

  it("makes one attempt and reports unsupported v2 and 429 without fallback", async () => {
    let count = 0;
    const client = await serve(406, { error: { code: "UNSUPPORTED_CONTRACT", message: "unsupported" } }, () => { count += 1; });
    await expect(client.refreshCurrent("a@example.com")).rejects.toMatchObject({ code: "UNSUPPORTED_CONTRACT", httpStatus: 406 });
    expect(count).toBe(1);
    const limited = await serve(429, { error: { code: "RATE_LIMIT", message: "slow down" } });
    await expect(limited.refreshCurrent("a@example.com")).rejects.toMatchObject({ httpStatus: 429 });
  });

  it("mock v2 proof has the approved signed claim and three-day lifetime", async () => {
    const { MockLicenseClient } = await import("../../src/license/license.client");
    const client = new MockLicenseClient({ ...config(), mode: "mock", mockKid: "test", mockPrivateKeyPkcs8Base64: privateDer });
    const token = await client.refreshCurrent("a@example.com");
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    expect(payload.contract_version).toBe(2);
    expect(payload.exp - payload.iat).toBe(3 * 86_400);
  });
});
