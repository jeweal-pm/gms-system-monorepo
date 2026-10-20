import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LicenseClientError } from "../../src/license/license.types";

const mocks = vi.hoisted(() => ({
  refreshCurrent: vi.fn(), queryRaw: vi.fn(), userFindUnique: vi.fn(),
  offlineRow: null as null | { state: string; signed_token: string | null; successful_at: Date | null; db_now: Date },
  staleWrite: false, order: 0n,
}));
vi.mock("../../src/license/license.client", () => ({
  createLicenseClient: () => ({ refreshCurrent: mocks.refreshCurrent }),
}));
vi.mock("../../src/database/prisma-client", () => ({
  prisma: { $queryRaw: mocks.queryRaw, user: { findUnique: mocks.userFindUnique } },
}));

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const issuer = "license-test";
const audience = "f1-system-customer-backend";
const subject = "a@example.com";

async function token(status: "active" | "revoked" = "active", version = 2, expiresInDays = 90) {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({ instance: "instance-test", type: "paid", status,
    license_expires_at: new Date((now + expiresInDays * 86_400) * 1_000).toISOString(),
    ...(version === 2 ? { contract_version: 2 } : {}),
  }).setProtectedHeader({ alg: "EdDSA", kid: "test" }).setIssuer(issuer).setAudience(audience)
    .setSubject(subject).setIssuedAt(now).setExpirationTime(now + (version === 2 ? 3 : 1) * 86_400)
    .sign(privateKey);
}

describe("GP-LIC-04 ordered v2 service boundary", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LICENSE_MODE", "remote");
    vi.stubEnv("LICENSE_API_URL", "http://127.0.0.1:1");
    vi.stubEnv("LICENSE_INSTANCE_ID", "instance-test");
    vi.stubEnv("LICENSE_INSTANCE_API_KEY", "secret");
    vi.stubEnv("LICENSE_JWT_ISSUER", issuer);
    vi.stubEnv("LICENSE_PUBLIC_KEYS_JSON", JSON.stringify({ test: publicKey.export({ format: "der", type: "spki" }).toString("base64") }));
    vi.stubEnv("LICENSE_OFFLINE_GRACE_DAYS", "2");
    vi.clearAllMocks();
    mocks.offlineRow = null;
    mocks.staleWrite = false;
    mocks.order = 0n;
    mocks.userFindUnique.mockResolvedValue({ username: subject, active: true });
    mocks.queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("nextval")) return [{ check_order: ++mocks.order }];
      if (sql.includes("INSERT INTO")) return mocks.staleWrite ? [] : [{ last_check_order: mocks.order }];
      if (sql.includes('SELECT "state"')) return mocks.offlineRow ? [mocks.offlineRow] : [];
      throw new Error("unexpected test SQL");
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  async function service() {
    const { LicenseService } = await import("../../src/license/license.service");
    return new LicenseService();
  }

  it("derives the subject from auth user and checks online on each call", async () => {
    mocks.refreshCurrent.mockResolvedValue(await token());
    const license = await service();
    expect((await license.resolveCurrentStatus("user-1")).state).toBe("VALID");
    expect((await license.resolveCurrentStatus("user-1")).state).toBe("VALID");
    expect(mocks.refreshCurrent).toHaveBeenCalledTimes(2);
    expect(mocks.refreshCurrent).toHaveBeenCalledWith(subject);
    expect(mocks.order).toBe(2n);
  });

  it("denies disabled user or mismatched signed subject before eligibility", async () => {
    mocks.userFindUnique.mockResolvedValueOnce({ username: subject, active: false });
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ httpStatus: 403 });
    expect(mocks.refreshCurrent).not.toHaveBeenCalled();
    mocks.userFindUnique.mockResolvedValue({ username: "other@example.com", active: true });
    mocks.refreshCurrent.mockResolvedValue(await token());
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("denies signed revoke, unsupported v1 and explicit 404 without fallback", async () => {
    mocks.refreshCurrent.mockResolvedValueOnce(await token("revoked"))
      .mockResolvedValueOnce(await token("active", 1))
      .mockRejectedValueOnce(new LicenseClientError("LICENSE_NOT_FOUND", 404, false));
    const license = await service();
    expect((await license.resolveCurrentStatus("user-1")).state).toBe("REVOKED");
    await expect(license.resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    expect((await license.resolveCurrentStatus("user-1")).state).toBe("REQUIRED");
    expect(mocks.queryRaw.mock.calls.filter(([sql]) => (sql as TemplateStringsArray).join("?").includes("INSERT INTO"))).toHaveLength(3);
  });

  it("fails closed when an older online success loses the database order check", async () => {
    mocks.refreshCurrent.mockResolvedValue(await token());
    mocks.staleWrite = true;
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE", httpStatus: 503 });
  });

  it("429 stores denial and never enters grace; timeout uses only latest active proof", async () => {
    mocks.refreshCurrent.mockRejectedValueOnce(new LicenseClientError("RATE_LIMIT", 429, true))
      .mockRejectedValue(new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true));
    const license = await service();
    await expect(license.resolveCurrentStatus("user-1")).rejects.toMatchObject({ httpStatus: 503 });
    const proof = await token();
    mocks.offlineRow = { state: "ACTIVE", signed_token: proof, successful_at: new Date(Date.now() - 86_400_000), db_now: new Date() };
    expect((await license.resolveCurrentStatus("user-1")).state).toBe("GRACE");
    mocks.offlineRow = { ...mocks.offlineRow, state: "DENIED", signed_token: null, successful_at: null };
    await expect(license.resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("uses fixed DB time and denies when grace is disabled", async () => {
    mocks.refreshCurrent.mockRejectedValue(new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true));
    const proof = await token();
    const checkedAt = new Date(Date.now() - 86_400_000);
    mocks.offlineRow = { state: "ACTIVE", signed_token: proof, successful_at: checkedAt, db_now: new Date() };
    expect((await (await service()).resolveCurrentStatus("user-1")).state).toBe("GRACE");
    mocks.offlineRow = { ...mocks.offlineRow, db_now: new Date(checkedAt.getTime() + 2 * 86_400_000) };
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    vi.stubEnv("LICENSE_OFFLINE_GRACE_DAYS", "0");
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
  });

  it("fails closed with no prior decision or database availability", async () => {
    mocks.refreshCurrent.mockRejectedValue(new LicenseClientError("UPSTREAM_UNAVAILABLE", 503, true));
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    mocks.userFindUnique.mockRejectedValueOnce(new Error("database unavailable"));
    await expect((await service()).resolveCurrentStatus("user-1")).rejects.toMatchObject({ code: "LICENSE_UNVERIFIABLE" });
    expect(mocks.refreshCurrent).toHaveBeenCalledTimes(1);
  });
});
