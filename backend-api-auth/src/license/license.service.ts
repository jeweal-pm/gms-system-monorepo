import { Injectable } from "@nestjs/common";
import { compactVerify, decodeProtectedHeader, importSPKI, type JWTPayload } from "jose";
import { createLicenseClient } from "./license.client";
import { parseLicenseConfiguration, type LicenseConfiguration } from "./license.config";
import { InvalidLicenseTokenError, LicenseClientError, type LicenseClaims, type LicenseClient, type LicenseLookup, type LicensePublicStatus } from "./license.types";
import { prisma } from "../database/prisma-client";

const GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
const EXPIRING_DAYS = 14;
const STATUS_CACHE_TTL_MS = 15_000;
const STATUS_CACHE_MAX_ENTRIES = 4_096;

/*
 * ADR-0020 §2: every `email` parameter below is the license subject, which is now the user's
 * immutable username. The license server still receives it in its existing `email` field.
 */
export class LicenseDomainError extends Error {
  constructor(readonly code: string, readonly httpStatus: number, readonly retryAfter?: number) {
    super("License operation could not be completed");
    this.name = "LicenseDomainError";
  }
}

@Injectable()
export class LicenseService {
  private readonly config: LicenseConfiguration;
  private readonly client: LicenseClient;
  private readonly inFlight = new Map<string, Promise<LicensePublicStatus>>();
  private readonly statusCache = new Map<string, { expiresAt: number; status: LicensePublicStatus }>();

  constructor() {
    this.config = parseLicenseConfiguration(process.env);
    this.client = createLicenseClient(this.config);
  }

  async lookupForProvisioning(email: string): Promise<{ eligible: true; token?: string } | { eligible: false }> {
    const normalizedEmail = normalizeEmail(email);
    let result: LicenseLookup;
    try {
      result = await this.client.lookup(normalizedEmail);
    } catch (error) {
      throw mapClientError(error);
    }
    if (result.state === "pending") return { eligible: true };
    if (result.state === "none") return { eligible: false };
    const claims = await this.verifyToken(result.token, normalizedEmail, false);
    if (claims.status !== "active" || Date.parse(claims.license_expires_at) <= Date.now()) return { eligible: false };
    return { eligible: true, token: result.token };
  }

  async cacheProvisionedToken(userId: string, token?: string) {
    if (!token) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    if (!user) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    await this.verifyToken(token, normalizeEmail(user.username), false);
    await prisma.licenseCache.upsert({
      where: { userId },
      update: { token, fetchedAt: new Date(), lastErrorAt: null },
      create: { userId, token, fetchedAt: new Date(), lastErrorAt: null },
    });
  }

  /** Drops the in-memory status entry for a deleted account (user-permission BE-UP-008). */
  evictStatus(userId: string) {
    this.statusCache.delete(userId);
    this.inFlight.delete(userId);
  }

  async resolveStatus(userId: string, email: string): Promise<LicensePublicStatus> {
    const cached = this.statusCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.status;
    if (cached) this.statusCache.delete(userId);
    const current = this.inFlight.get(userId);
    if (current) return current;
    const operation = this.resolveStatusOnce(userId, normalizeEmail(email)).then((status) => {
      this.rememberStatus(userId, status);
      return status;
    });
    this.inFlight.set(userId, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlight.get(userId) === operation) this.inFlight.delete(userId);
    }
  }

  /** Staged v2 check. Protected routes must not call this until the private route is verified. */
  async resolveCurrentStatus(userId: string): Promise<LicensePublicStatus> {
    // Resolve the immutable license subject in auth rather than accepting a caller-supplied pair.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, active: true } })
      .catch(() => { throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503); });
    if (!user || !user.active) throw new LicenseDomainError("LICENSE_REQUIRED", 403);
    const subject = normalizeEmail(user.username);
    const orderRows = await prisma.$queryRaw<Array<{ check_order: bigint }>>`
      SELECT nextval('auth."LicenseCurrentCheckOrder"') AS check_order
    `.catch(() => { throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503); });
    const order = orderRows[0]?.check_order;
    if (typeof order !== "bigint") throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);

    let token: string;
    try {
      token = await this.client.refreshCurrent(subject);
    } catch (error) {
      if (error instanceof LicenseClientError && isCurrentLicenseOutage(error)) {
        return this.currentOfflineStatus(userId, subject);
      }
      await this.persistCurrentDecision(userId, order, "DENIED", null);
      if (error instanceof LicenseClientError && error.httpStatus === 404 && error.code === "LICENSE_NOT_FOUND") {
        return { state: "REQUIRED", checkedAt: new Date().toISOString() };
      }
      throw mapClientError(error);
    }

    let claims: LicenseClaims;
    try {
      claims = await this.verifyToken(token, subject, false, 2);
    } catch {
      await this.persistCurrentDecision(userId, order, "DENIED", null);
      throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    }
    const status = this.statusForClaims(claims);
    const eligible = status.state === "VALID" || status.state === "EXPIRING";
    await this.persistCurrentDecision(userId, order, eligible ? "ACTIVE" : "DENIED", eligible ? token : null);
    return status;
  }

  private async persistCurrentDecision(userId: string, order: bigint, state: "ACTIVE" | "DENIED", token: string | null) {
    const rows = await prisma.$queryRaw<Array<{ last_check_order: bigint }>>`
      INSERT INTO "auth"."LicenseCurrentDecision"
        ("user_id", "last_check_order", "state", "signed_token", "successful_at", "decided_at")
      VALUES (${userId}, ${order}, ${state}, ${token}, CASE WHEN ${state} = 'ACTIVE' THEN NOW() ELSE NULL END, NOW())
      ON CONFLICT ("user_id") DO UPDATE SET
        "last_check_order" = EXCLUDED."last_check_order",
        "state" = EXCLUDED."state",
        "signed_token" = EXCLUDED."signed_token",
        "successful_at" = EXCLUDED."successful_at",
        "decided_at" = EXCLUDED."decided_at"
      WHERE "LicenseCurrentDecision"."last_check_order" < EXCLUDED."last_check_order"
      RETURNING "last_check_order"
    `.catch(() => { throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503); });
    if (rows.length !== 1) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
  }

  private async currentOfflineStatus(userId: string, subject: string): Promise<LicensePublicStatus> {
    if (this.config.offlineGraceDays === 0) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    const rows = await prisma.$queryRaw<Array<{ state: string; signed_token: string | null; successful_at: Date | null; db_now: Date }>>`
      SELECT "state", "signed_token", "successful_at", NOW() AS db_now
      FROM "auth"."LicenseCurrentDecision" WHERE "user_id" = ${userId}
    `.catch(() => { throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503); });
    const cached = rows[0];
    if (cached?.state !== "ACTIVE" || !cached.signed_token || !cached.successful_at) {
      throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    }
    const claims = await this.verifyToken(cached.signed_token, subject, true, 2).catch(() => null);
    if (!claims || !isCurrentLicenseFallbackAllowed(claims, cached.successful_at, cached.db_now, this.config.offlineGraceDays)) {
      throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    }
    return { ...this.publicStatus(claims, "GRACE"), fallbackUntil: new Date(Math.min(
      cached.successful_at.getTime() + this.config.offlineGraceDays * 86_400_000,
      claims.exp * 1_000,
      Date.parse(claims.license_expires_at),
    )).toISOString() };
  }

  async activate(userId: string, email: string, keyInput: unknown): Promise<LicensePublicStatus> {
    const emailNormalized = normalizeEmail(email);
    const key = typeof keyInput === "string" ? keyInput.trim().toUpperCase() : "";
    const lock = await this.getActivationLock(userId);
    if (lock?.lockedUntil && lock.lockedUntil.getTime() > Date.now()) {
      throw new LicenseDomainError("TOO_MANY_ATTEMPTS", 429, Math.max(1, Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 1_000)));
    }
    if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4}$/.test(key)) {
      const failed = await this.recordActivationFailure(userId);
      if (failed.lockedUntil && failed.lockedUntil.getTime() > Date.now()) {
        throw new LicenseDomainError("TOO_MANY_ATTEMPTS", 429, 60);
      }
      throw new LicenseDomainError("INVALID_KEY", 400);
    }

    let token: string;
    try {
      token = await this.client.activate(emailNormalized, key);
      const claims = await this.verifyToken(token, emailNormalized, false);
      if (claims.status !== "active" || Date.parse(claims.license_expires_at) <= Date.now()) {
        throw new LicenseDomainError("LICENSE_REQUIRED", 403);
      }
    } catch (error) {
      if (error instanceof LicenseClientError && error.code === "INVALID_KEY") {
        const lockout = await this.recordActivationFailure(userId);
        if (lockout.lockedUntil && lockout.lockedUntil.getTime() > Date.now()) {
          throw new LicenseDomainError("TOO_MANY_ATTEMPTS", 429, 60);
        }
        throw new LicenseDomainError("INVALID_KEY", 400);
      }
      if (error instanceof LicenseDomainError) throw error;
      throw mapClientError(error);
    }

    await prisma.licenseCache.upsert({
      where: { userId },
      update: { token, fetchedAt: new Date(), lastErrorAt: null },
      create: { userId, token, fetchedAt: new Date(), lastErrorAt: null },
    });
    await prisma.licenseActivationLockout.deleteMany({ where: { userId } });
    const status = this.statusForClaims(await this.verifyToken(token, emailNormalized, false));
    this.rememberStatus(userId, status);
    return status;
  }

  private async resolveStatusOnce(userId: string, email: string): Promise<LicensePublicStatus> {
    const cache = await prisma.licenseCache.findUnique({ where: { userId }, select: { token: true, lastErrorAt: true } });
    if (cache) {
      try {
        const claims = await this.verifyToken(cache.token, email, false);
        const status = this.statusForClaims(claims);
        if (status.state === "VALID" || status.state === "EXPIRING") return status;
        return status;
      } catch (error) {
        if (!(error instanceof InvalidLicenseTokenError)) throw error;
        // Expired JWTs may be refreshed, but signature/claim failures never qualify for grace.
        const signedClaims = await this.verifyToken(cache.token, email, true).catch(() => null);
        if (!signedClaims) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
        if (Date.parse(signedClaims.license_expires_at) <= Date.now()) return this.publicStatus(signedClaims, "EXPIRED");
      }
    }

    try {
      const refreshed = cache
        ? await this.client.refresh(email)
        : await this.lookupToken(email);
      if (!refreshed) return { state: "REQUIRED", checkedAt: new Date().toISOString() };
      const claims = await this.verifyToken(refreshed, email, false);
      await prisma.licenseCache.upsert({
        where: { userId },
        update: { token: refreshed, fetchedAt: new Date(), lastErrorAt: null },
        create: { userId, token: refreshed, fetchedAt: new Date(), lastErrorAt: null },
      });
      return this.statusForClaims(claims);
    } catch (error) {
      if (error instanceof InvalidLicenseTokenError) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
      if (error instanceof LicenseClientError && error.code === "LICENSE_NOT_FOUND") {
        if (cache) await prisma.licenseCache.deleteMany({ where: { userId } });
        return { state: "REQUIRED", checkedAt: new Date().toISOString() };
      }
      if (!(error instanceof LicenseClientError) || !error.transient) throw mapClientError(error);
      const existing = await prisma.licenseCache.findUnique({ where: { userId }, select: { token: true, fetchedAt: true, lastErrorAt: true } });
      if (!existing) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
      const now = new Date();
      if (!existing.lastErrorAt) {
        await prisma.licenseCache.update({ where: { userId }, data: { lastErrorAt: now } });
      }
      if (now.getTime() - existing.fetchedAt.getTime() > GRACE_MS) throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
      const cachedClaims = await this.verifyToken(existing.token, email, true).catch(() => null);
      if (!cachedClaims || cachedClaims.status !== "active" || Date.parse(cachedClaims.license_expires_at) <= now.getTime()) {
        throw new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
      }
      return this.publicStatus(cachedClaims, "GRACE");
    }
  }

  private async lookupToken(email: string): Promise<string | null> {
    const result = await this.client.lookup(email);
    if (result.state === "active") return result.token;
    return null;
  }

  private async verifyToken(token: string, email: string, allowExpired: boolean, expectedVersion?: 2): Promise<LicenseClaims> {
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg !== "EdDSA" || typeof header.kid !== "string") throw new InvalidLicenseTokenError();
      const encodedKey = this.config.publicKeys[header.kid];
      if (!encodedKey) throw new InvalidLicenseTokenError();
      const der = Buffer.from(encodedKey, "base64");
      const pem = `-----BEGIN PUBLIC KEY-----\n${der.toString("base64").match(/.{1,64}/g)?.join("\n")}\n-----END PUBLIC KEY-----`;
      const publicKey = await importSPKI(pem, "EdDSA");
      const verified = await compactVerify(token, publicKey, { algorithms: ["EdDSA"] });
      const payload = JSON.parse(new TextDecoder().decode(verified.payload)) as JWTPayload & Record<string, unknown>;
      const aud = payload.aud;
      const nowSeconds = Math.floor(Date.now() / 1_000);
      if (
        payload.iss !== this.config.issuer ||
        !(aud === this.config.audience || (Array.isArray(aud) && aud.includes(this.config.audience))) ||
        payload.instance !== this.config.instanceId ||
        typeof payload.sub !== "string" || normalizeEmail(payload.sub) !== email ||
        (payload.type !== "trial" && payload.type !== "paid") ||
        (payload.status !== "active" && payload.status !== "suspended" && payload.status !== "revoked") ||
        typeof payload.license_expires_at !== "string" || !Number.isFinite(Date.parse(payload.license_expires_at)) ||
        typeof payload.iat !== "number" || !Number.isInteger(payload.iat) || payload.iat > nowSeconds + 30 ||
        typeof payload.exp !== "number" || !Number.isInteger(payload.exp) || payload.exp <= payload.iat ||
        (expectedVersion === 2 && (payload.contract_version !== 2 || payload.exp - payload.iat !== 3 * 86_400)) ||
        (!allowExpired && payload.exp <= nowSeconds)
      ) throw new InvalidLicenseTokenError();
      return payload as unknown as LicenseClaims;
    } catch {
      throw new InvalidLicenseTokenError();
    }
  }

  private statusForClaims(claims: LicenseClaims): LicensePublicStatus {
    if (claims.status !== "active") return this.publicStatus(claims, "REVOKED");
    if (Date.parse(claims.license_expires_at) <= Date.now()) return this.publicStatus(claims, "EXPIRED");
    const daysRemaining = Math.ceil((Date.parse(claims.license_expires_at) - Date.now()) / 86_400_000);
    return this.publicStatus(claims, daysRemaining <= EXPIRING_DAYS ? "EXPIRING" : "VALID");
  }

  private publicStatus(claims: LicenseClaims, state: LicensePublicStatus["state"]): LicensePublicStatus {
    const expiresAt = new Date(claims.license_expires_at);
    return {
      state,
      type: claims.type,
      expiresAt: expiresAt.toISOString(),
      daysRemaining: Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000),
      checkedAt: new Date().toISOString(),
    };
  }

  private async getActivationLock(userId: string) {
    return prisma.licenseActivationLockout.findUnique({ where: { userId }, select: { failedAttempts: true, lockedUntil: true } });
  }

  private async recordActivationFailure(userId: string) {
    const rows = await prisma.$queryRaw<Array<{ failed_attempts: number; locked_until: Date | null }>>`
      INSERT INTO "auth"."LicenseActivationLockout" ("user_id", "failed_attempts", "locked_until", "updated_at")
      VALUES (${userId}, 1, NULL, NOW())
      ON CONFLICT ("user_id") DO UPDATE SET
        "failed_attempts" = CASE WHEN "LicenseActivationLockout"."locked_until" IS NOT NULL AND "LicenseActivationLockout"."locked_until" <= NOW() THEN 1 ELSE "LicenseActivationLockout"."failed_attempts" + 1 END,
        "locked_until" = CASE WHEN (CASE WHEN "LicenseActivationLockout"."locked_until" IS NOT NULL AND "LicenseActivationLockout"."locked_until" <= NOW() THEN 1 ELSE "LicenseActivationLockout"."failed_attempts" + 1 END) >= 3 THEN NOW() + INTERVAL '1 minute' ELSE NULL END,
        "updated_at" = NOW()
      RETURNING "failed_attempts", "locked_until"
    `;
    return { failedAttempts: rows[0]?.failed_attempts ?? 0, lockedUntil: rows[0]?.locked_until ?? null };
  }

  private rememberStatus(userId: string, status: LicensePublicStatus) {
    this.statusCache.delete(userId);
    this.statusCache.set(userId, { expiresAt: Date.now() + STATUS_CACHE_TTL_MS, status });
    while (this.statusCache.size > STATUS_CACHE_MAX_ENTRIES) {
      const oldest = this.statusCache.keys().next().value;
      if (oldest === undefined) break;
      this.statusCache.delete(oldest);
    }
  }
}

export function isCurrentLicenseOutage(error: LicenseClientError): boolean {
  return error.transient && (error.code === "UPSTREAM_UNAVAILABLE" || error.httpStatus >= 500);
}

export function isCurrentLicenseFallbackAllowed(
  claims: LicenseClaims,
  checkedAt: Date,
  dbNow: Date,
  graceDays: 0 | 1 | 2,
): boolean {
  const now = dbNow.getTime();
  const checked = checkedAt.getTime();
  const naturalExpiry = Date.parse(claims.license_expires_at);
  return graceDays > 0 && claims.contract_version === 2 && claims.status === "active" &&
    Number.isFinite(now) && Number.isFinite(checked) && Number.isFinite(naturalExpiry) &&
    checked <= now && now < checked + graceDays * 86_400_000 &&
    now < claims.exp * 1_000 && now < naturalExpiry;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapClientError(error: unknown): LicenseDomainError {
  if (error instanceof LicenseDomainError) return error;
  if (error instanceof LicenseClientError) {
    if (error.code === "INVALID_KEY") return new LicenseDomainError("INVALID_KEY", 400);
    if (error.code === "ALREADY_ACTIVATED") return new LicenseDomainError("ALREADY_ACTIVATED", 409);
    if (error.code === "TOO_MANY_ATTEMPTS") return new LicenseDomainError("TOO_MANY_ATTEMPTS", 429, 60);
    if (error.transient || error.httpStatus >= 500) return new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
    return new LicenseDomainError("LICENSE_REQUIRED", 403);
  }
  return new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
}
