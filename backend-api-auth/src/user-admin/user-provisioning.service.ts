import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { prisma } from "../database/prisma-client";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import type { PermissionActionValue } from "../permission/catalog";

/**
 * One provisioning routine for both creation paths (ADR-0017 §1): CRM `POST /api/v1/users`
 * (Super Admin) and the user-permission page (regular users). Callers map
 * `ProvisioningError.reason` to their own public contract.
 */
export type ProvisionInput = {
  email: string; // already normalized (trimmed, lowercased)
  name: string;
  password: string;
  role: "admin" | "user";
  active?: boolean;
  phone?: { country: string; e164: string } | null;
  locationKeys?: string[];
  permissions?: { menuKey: string; action: PermissionActionValue }[];
  /** When set, the seat cap is checked under the advisory lock (regular users only). */
  seatLimit?: number;
};

export type ProvisioningFailure =
  | { reason: "EMAIL_ALREADY_EXISTS" }
  | { reason: "LICENSE_NOT_ELIGIBLE" }
  | { reason: "LICENSE_LOOKUP_FAILED"; cause: LicenseDomainError }
  | { reason: "SEAT_LIMIT_REACHED"; used: number; limit: number }
  | { reason: "LICENSE_CACHE_FAILED" };

export class ProvisioningError extends Error {
  constructor(readonly failure: ProvisioningFailure) {
    super("User provisioning could not be completed");
    this.name = "ProvisioningError";
  }
}

const SEAT_LOCK_KEY = "auth.user-seat";

@Injectable()
export class UserProvisioningService {
  private readonly logger = new Logger(UserProvisioningService.name);

  constructor(private readonly licenseService: LicenseService) {}

  countSeats() {
    return prisma.user.count({ where: { role: "user" } });
  }

  async provision(input: ProvisionInput): Promise<{ id: string; email: string; createdAt: Date; updatedAt: Date }> {
    const email = input.email;
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ProvisioningError({ reason: "EMAIL_ALREADY_EXISTS" });
    }
    if (input.seatLimit !== undefined) {
      // Cheap pre-check so a full deployment does not call the license server; re-checked under the lock.
      const used = await this.countSeats();
      if (used >= input.seatLimit) throw new ProvisioningError({ reason: "SEAT_LIMIT_REACHED", used, limit: input.seatLimit });
    }

    let preflight: { eligible: true; token?: string } | { eligible: false };
    try {
      preflight = await this.licenseService.lookupForProvisioning(email);
    } catch (error) {
      const cause = error instanceof LicenseDomainError ? error : new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
      throw new ProvisioningError({ reason: "LICENSE_LOOKUP_FAILED", cause });
    }
    if (!preflight.eligible) throw new ProvisioningError({ reason: "LICENSE_NOT_ELIGIBLE" });

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const now = new Date();
    const userId = randomUUID();
    let user: { id: string; email: string; createdAt: Date; updatedAt: Date };
    try {
      user = await prisma.$transaction(async (transaction) => {
        if (input.seatLimit !== undefined) {
          await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SEAT_LOCK_KEY}))`;
          const used = await transaction.user.count({ where: { role: "user" } });
          if (used >= input.seatLimit) throw new ProvisioningError({ reason: "SEAT_LIMIT_REACHED", used, limit: input.seatLimit });
        }
        const created = await transaction.user.create({
          data: {
            id: userId,
            name: input.name,
            email,
            emailVerified: true,
            role: input.role,
            active: input.active ?? true,
            phoneE164: input.phone?.e164 ?? null,
            phoneCountry: input.phone?.country ?? null,
            createdAt: now,
            updatedAt: now,
          },
          select: { id: true, email: true, createdAt: true, updatedAt: true },
        });
        await transaction.account.create({
          data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash, createdAt: now, updatedAt: now },
        });
        if (input.permissions && input.permissions.length > 0) {
          await transaction.userPermission.createMany({
            data: input.permissions.map((grant) => ({ userId, menuKey: grant.menuKey, action: grant.action })),
          });
        }
        if (input.locationKeys && input.locationKeys.length > 0) {
          await transaction.userLocation.createMany({ data: input.locationKeys.map((locationKey) => ({ userId, locationKey })) });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof ProvisioningError) throw error;
      if (isUniqueConstraintError(error)) throw new ProvisioningError({ reason: "EMAIL_ALREADY_EXISTS" });
      throw error;
    }

    try {
      await this.licenseService.cacheProvisionedToken(user.id, preflight.token);
    } catch {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      this.logger.error({ event: "user_provisioning.compensated", targetId: user.id, msg: "Provisioning stopped because license cache could not be committed" });
      throw new ProvisioningError({ reason: "LICENSE_CACHE_FAILED" });
    }
    return user;
  }
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
