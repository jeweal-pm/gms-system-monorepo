import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentLicenseUrl, MasterLicenseClient, readMasterServiceToken } from "../../src/master/license-client";
import { requireMasterAuthzDatabaseUrl } from "../../src/master/authz-database";

const envKeys = ["MASTER_AUTH_SERVICE_TOKEN_FILE", "AUTH_SERVICE_URL", "MASTER_AUTHZ_DATABASE_URL"] as const;
const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
const dirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of envKeys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("master internal license client and reader URL contract", () => {
  it("UT-MAUTH-06 appends the approved endpoint to existing AUTH_SERVICE_URL", () => {
    expect(currentLicenseUrl("http://backend-api-auth:3101/").toString()).toBe("http://backend-api-auth:3101/internal/v1/license/current");
    expect(() => currentLicenseUrl("https://user:pass@auth.example")).toThrow();
  });

  it("UT-MAUTH-07 requires a dedicated PostgreSQL URL and never falls back", () => {
    expect(() => requireMasterAuthzDatabaseUrl({})).toThrow("MASTER_AUTHZ_DATABASE_URL is required");
    expect(() => requireMasterAuthzDatabaseUrl({ MASTER_AUTHZ_DATABASE_URL: "http://localhost/db" })).toThrow();
    expect(requireMasterAuthzDatabaseUrl({ MASTER_AUTHZ_DATABASE_URL: "postgresql://reader:secret@db:5432/gms" })).toContain("reader");
  });

  it("UT-MAUTH-08 rejects malformed file token and sends the valid file token with bounded private request", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gms-master-token-"));
    dirs.push(dir);
    const token = randomBytes(32).toString("base64url");
    const file = join(dir, "token");
    await writeFile(file, `${token}\n`, { mode: 0o600 });
    process.env.MASTER_AUTH_SERVICE_TOKEN_FILE = file;
    process.env.AUTH_SERVICE_URL = "http://auth.test:3101";
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ decision: "ELIGIBLE", status: "VALID", checkedAt: "2026-10-21T00:00:00.000Z", fallbackUntil: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await new MasterLicenseClient().check("user-1", "session-1");
    expect(result).toBe("ELIGIBLE");
    expect(fetcher).toHaveBeenCalledWith(new URL("http://auth.test:3101/internal/v1/license/current"), expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ authorization: `Bearer ${token}` }),
      body: JSON.stringify({ userId: "user-1", sessionId: "session-1" }), redirect: "error",
    }));

    for (const [status, expected] of [[401, "UNAUTHENTICATED"], [403, "DENIED"], [503, "UNAVAILABLE"]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));
      await expect(new MasterLicenseClient().check("user-1", "session-1")).resolves.toBe(expected);
    }

    await writeFile(file, `${token}\nextra`, { mode: 0o600 });
    expect(await readMasterServiceToken(file)).toBeNull();
  });
});
