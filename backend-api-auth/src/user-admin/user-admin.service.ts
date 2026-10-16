import { randomUUID } from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import * as argon2 from "argon2";
import { auth, hashLoginIdentity } from "../auth/auth";
import { prisma } from "../database/prisma-client";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import { catalogResponse, isGrantInCatalog, MAX_GRANTS_PER_USER, parsePermissionKey, toPermissionKey, type PermissionActionValue } from "../permission/catalog";
import { SUPER_ADMIN_ROLE } from "../permission/grants";
import { isKnownLocation, LOCATION_OPTIONS } from "./location-options";
import { parseUserSeatLimit, USER_LIST_CAP } from "./seat-limit";
import { userAdminException, zodFieldErrors, type FieldError } from "./user-admin.errors";
import { createUserInputSchema, updateUserInputSchema, userIdSchema } from "./user-admin.schemas";
import { ProvisioningError, UserProvisioningService } from "./user-provisioning.service";

const USABLE_LICENSE_STATES = new Set(["VALID", "EXPIRING", "GRACE"]);
const PHOTO_VERSION_LENGTH = 16;

export type Actor = { id: string };

@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);
  private readonly seatLimit = parseUserSeatLimit(process.env.USER_SEAT_LIMIT);

  constructor(private readonly provisioning: UserProvisioningService, private readonly licenseService: LicenseService) {}

  /** Any valid, active session (catalog is static; gateway enforces the license). */
  async requireSession(request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session || session.user.active === false) throw userAdminException("UNAUTHORIZED", HttpStatus.UNAUTHORIZED);
    return session;
  }

  /**
   * Auth re-checks session, usable license and Super Admin on every user-admin call, because
   * port 3101 is reachable inside the Compose network (authorization.md trust boundary).
   */
  async requireSuperAdmin(request: Request): Promise<Actor> {
    const session = await this.requireSession(request);
    let state: string;
    try {
      state = (await this.licenseService.resolveStatus(session.user.id, session.user.username ?? "")).state;
    } catch (error) {
      state = error instanceof LicenseDomainError && error.code === "LICENSE_REQUIRED" ? "REQUIRED" : "UNVERIFIABLE";
    }
    if (!USABLE_LICENSE_STATES.has(state)) {
      if (state === "UNVERIFIABLE") throw userAdminException("LICENSE_UNVERIFIABLE", HttpStatus.SERVICE_UNAVAILABLE);
      throw userAdminException(state === "EXPIRED" ? "LICENSE_EXPIRED" : state === "REVOKED" ? "LICENSE_REVOKED" : "LICENSE_REQUIRED", HttpStatus.FORBIDDEN);
    }
    if (session.user.role !== SUPER_ADMIN_ROLE) {
      this.logger.log({ event: "user_admin.denied", actorId: session.user.id, msg: "Super Admin required" });
      throw userAdminException("SUPER_ADMIN_REQUIRED", HttpStatus.FORBIDDEN);
    }
    return { id: session.user.id };
  }

  catalog() {
    return catalogResponse();
  }

  locationOptions() {
    return { items: LOCATION_OPTIONS };
  }

  async list() {
    const [rows, used] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ role: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: USER_LIST_CAP,
        select: { id: true, name: true, username: true, role: true, active: true, updatedAt: true, photo: { select: { userId: true } } },
      }),
      this.provisioning.countSeats(),
    ]);
    // "admin" sorts before "user", so Super Admins come first, then createdAt ascending.
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        username: row.username,
        isSuperAdmin: row.role === SUPER_ADMIN_ROLE,
        active: row.active,
        hasPhoto: row.photo !== null,
        updatedAt: row.updatedAt.toISOString(),
      })),
      usage: { used, limit: this.seatLimit },
    };
  }

  async get(rawId: string) {
    const id = parseUserId(rawId);
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, username: true, role: true, active: true, updatedAt: true,
        phoneE164: true, phoneCountry: true,
        locations: { select: { locationKey: true }, orderBy: { locationKey: "asc" }, take: 20 },
        permissions: { select: { menuKey: true, action: true }, take: MAX_GRANTS_PER_USER },
        photo: { select: { sha256: true } },
      },
    });
    if (!user) throw userAdminException("USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    const isSuperAdmin = user.role === SUPER_ADMIN_ROLE;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      isSuperAdmin,
      active: user.active,
      hasPhoto: user.photo !== null,
      updatedAt: user.updatedAt.toISOString(),
      phone: user.phoneE164 && user.phoneCountry ? { country: user.phoneCountry, e164: user.phoneE164 } : null,
      locationKeys: user.locations.map((location) => location.locationKey),
      permissions: isSuperAdmin
        ? "ALL" as const
        : user.permissions.filter((grant) => isGrantInCatalog(grant.menuKey, grant.action)).map((grant) => toPermissionKey(grant.menuKey, grant.action)).sort(),
      photoVersion: user.photo ? user.photo.sha256.slice(0, PHOTO_VERSION_LENGTH) : null,
      // SA rev 2: true = permissions, active, password and delete are locked (personal info stays editable).
      readOnly: isSuperAdmin,
    };
  }

  async create(actor: Actor, body: unknown) {
    const parsed = createUserInputSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const fieldErrors = zodFieldErrors(parsed.error);
      if (issues.every((issue) => issue.path[0] === "password" && issue.code !== "invalid_type")) {
        throw userAdminException("PASSWORD_POLICY_VIOLATION", HttpStatus.BAD_REQUEST, fieldErrors);
      }
      throw userAdminException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, fieldErrors);
    }
    const input = parsed.data;

    const grants = this.validateSets(actor, input.permissions, input.locationKeys);

    let created: { id: string; updatedAt: Date };
    try {
      created = await this.provisioning.provision({
        username: input.username,
        name: input.name,
        password: input.password,
        role: "user",
        active: input.active,
        phone: input.phone,
        locationKeys: input.locationKeys,
        permissions: grants,
        seatLimit: this.seatLimit,
      });
    } catch (error) {
      if (!(error instanceof ProvisioningError)) throw error;
      const failure = error.failure;
      switch (failure.reason) {
        case "USERNAME_TAKEN":
          throw userAdminException("USERNAME_TAKEN", HttpStatus.CONFLICT, [{ path: "username", code: "duplicate" }]);
        case "SEAT_LIMIT_REACHED":
          this.logger.log({ event: "user_admin.limit_reached", actorId: actor.id, used: failure.used, limit: failure.limit, msg: "User limit reached" });
          throw userAdminException("USER_LIMIT_REACHED", HttpStatus.CONFLICT);
        case "LICENSE_NOT_ELIGIBLE":
          this.logger.log({ event: "user_admin.license_not_eligible", actorId: actor.id, msg: "Target username has no eligible license" });
          throw userAdminException("USER_LICENSE_NOT_ELIGIBLE", HttpStatus.UNPROCESSABLE_ENTITY);
        case "LICENSE_LOOKUP_FAILED":
          if (failure.cause.httpStatus < 500) throw userAdminException("USER_LICENSE_NOT_ELIGIBLE", HttpStatus.UNPROCESSABLE_ENTITY);
          throw userAdminException("USER_LICENSE_UNVERIFIABLE", HttpStatus.SERVICE_UNAVAILABLE);
        case "LICENSE_CACHE_FAILED":
          throw userAdminException("USER_LICENSE_UNVERIFIABLE", HttpStatus.SERVICE_UNAVAILABLE);
      }
    }
    this.logger.log({
      event: "user_admin.created",
      actorId: actor.id,
      targetId: created.id,
      fields: ["username", "password", "name", "phone", "locationKeys", "active", "permissions"],
      msg: "User created",
    });
    return { id: created.id, updatedAt: created.updatedAt.toISOString() };
  }

  /**
   * SA rev 2 (ADR-0020 §4): regular users accept every field; a Super Admin target (which
   * includes the caller) accepts only name, phone and locationKeys. Username never changes.
   */
  async update(actor: Actor, rawId: string, body: unknown) {
    const id = parseUserId(rawId);
    const parsed = updateUserInputSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      const fieldErrors = zodFieldErrors(parsed.error);
      if (issues.every((issue) => issue.path[0] === "password" && issue.code !== "invalid_type")) {
        throw userAdminException("PASSWORD_POLICY_VIOLATION", HttpStatus.BAD_REQUEST, fieldErrors);
      }
      throw userAdminException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, fieldErrors);
    }
    const input = parsed.data;
    const grants = input.permissions !== undefined || input.locationKeys !== undefined
      ? this.validateSets(actor, input.permissions ?? [], input.locationKeys ?? [])
      : [];

    // Cheap pre-check so a locked Super Admin request never pays for Argon2; re-checked under the row lock.
    const current = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!current) throw userAdminException("USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (current.role === SUPER_ADMIN_ROLE && (input.permissions !== undefined || input.password !== undefined || input.active === false)) {
      this.logger.warn({ event: "user_admin.update_denied", actorId: actor.id, targetId: id, msg: "Super Admin permissions, status and password are locked" });
      throw userAdminException("SUPER_ADMIN_LOCKED", HttpStatus.FORBIDDEN);
    }
    // Hash outside the transaction (Argon2 is slow).
    const passwordHash = input.password !== undefined ? await argon2.hash(input.password, { type: argon2.argon2id }) : null;

    const outcome = await prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ role: string; username: string; updatedAt: Date }>>`
        SELECT "role", "username", "updatedAt" FROM "auth"."User" WHERE "id" = ${id} FOR UPDATE`;
      const target = rows[0];
      if (!target) return { kind: "NOT_FOUND" as const };
      if (input.username !== undefined && input.username !== target.username) return { kind: "USERNAME_IMMUTABLE" as const };
      if (input.expectedUpdatedAt !== undefined && Date.parse(input.expectedUpdatedAt) !== target.updatedAt.getTime()) return { kind: "USER_CHANGED" as const };
      const isSuperAdmin = target.role === SUPER_ADMIN_ROLE;
      if (isSuperAdmin && (input.permissions !== undefined || passwordHash !== null || input.active === false)) {
        return { kind: "SUPER_ADMIN_LOCKED" as const };
      }

      const now = new Date();
      const updated = await transaction.user.update({
        where: { id },
        data: {
          updatedAt: now,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phoneE164: input.phone?.e164 ?? null, phoneCountry: input.phone?.country ?? null } : {}),
          ...(!isSuperAdmin && input.active !== undefined ? { active: input.active } : {}),
          ...(passwordHash !== null ? { failedLoginCount: 0, lockedUntil: null } : {}),
        },
        select: { updatedAt: true },
      });
      if (input.locationKeys !== undefined) {
        await transaction.userLocation.deleteMany({ where: { userId: id } });
        await transaction.userLocation.createMany({ data: input.locationKeys.map((locationKey) => ({ userId: id, locationKey })) });
      }
      if (input.permissions !== undefined) {
        await transaction.userPermission.deleteMany({ where: { userId: id } });
        if (grants.length > 0) {
          await transaction.userPermission.createMany({ data: grants.map((grant) => ({ userId: id, menuKey: grant.menuKey, action: grant.action })) });
        }
      }
      let revokeSessions = input.active === false;
      if (passwordHash !== null) {
        const changed = await transaction.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: passwordHash, updatedAt: now } });
        if (changed.count === 0) {
          await transaction.account.create({ data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash, createdAt: now, updatedAt: now } });
        }
        await transaction.loginLockout.deleteMany({ where: { emailHash: hashLoginIdentity(target.username) } });
        revokeSessions = true;
      }
      if (revokeSessions) await transaction.session.deleteMany({ where: { userId: id } });
      return { kind: "UPDATED" as const, updatedAt: updated.updatedAt };
    }, { timeout: 4_000 });

    switch (outcome.kind) {
      case "NOT_FOUND":
        throw userAdminException("USER_NOT_FOUND", HttpStatus.NOT_FOUND);
      case "USERNAME_IMMUTABLE":
        throw userAdminException("USERNAME_IMMUTABLE", HttpStatus.BAD_REQUEST, [{ path: "username", code: "immutable" }]);
      case "USER_CHANGED":
        throw userAdminException("USER_CHANGED", HttpStatus.CONFLICT);
      case "SUPER_ADMIN_LOCKED":
        this.logger.warn({ event: "user_admin.update_denied", actorId: actor.id, targetId: id, msg: "Super Admin permissions, status and password are locked" });
        throw userAdminException("SUPER_ADMIN_LOCKED", HttpStatus.FORBIDDEN);
    }
    this.logger.log({
      event: "user_admin.updated",
      actorId: actor.id,
      targetId: id,
      fields: (["name", "password", "phone", "locationKeys", "active", "permissions"] as const).filter((field) => input[field] !== undefined),
      msg: "User updated",
    });
    return { id, updatedAt: outcome.updatedAt.toISOString() };
  }

  /** Shared create/update validation for permission keys and location keys. */
  private validateSets(actor: Actor, permissions: string[], locationKeys: string[]) {
    const duplicates: FieldError[] = [];
    if (new Set(permissions).size !== permissions.length) duplicates.push({ path: "permissions", code: "duplicate" });
    if (new Set(locationKeys).size !== locationKeys.length) duplicates.push({ path: "locationKeys", code: "duplicate" });
    if (duplicates.length > 0) throw userAdminException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, duplicates);

    const grants: { menuKey: string; action: PermissionActionValue }[] = [];
    let unknownPermissions = 0;
    for (const key of permissions) {
      const grant = parsePermissionKey(key);
      if (grant) grants.push(grant);
      else unknownPermissions += 1;
    }
    if (unknownPermissions > 0) {
      this.logger.warn({ event: "user_admin.permission_unknown", actorId: actor.id, count: unknownPermissions, msg: "Unknown permission keys rejected" });
      throw userAdminException("PERMISSION_UNKNOWN", HttpStatus.BAD_REQUEST, [{ path: "permissions", code: "unknown" }]);
    }
    if (locationKeys.some((key) => !isKnownLocation(key))) {
      throw userAdminException("LOCATION_UNKNOWN", HttpStatus.BAD_REQUEST, [{ path: "locationKeys", code: "unknown" }]);
    }
    return grants;
  }

  async delete(actor: Actor, rawId: string) {
    const id = parseUserId(rawId);
    const outcome = await prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<Array<{ role: string }>>`SELECT "role" FROM "auth"."User" WHERE "id" = ${id} FOR UPDATE`;
      const target = rows[0];
      if (!target) return "NOT_FOUND" as const;
      if (target.role !== "user" || id === actor.id) return "READ_ONLY" as const;
      // Cascades: Session, Account, LicenseCache, LicenseActivationLockout, UserPermission,
      // UserLocation, UserPhoto. LoginAttempt.user_id is set to NULL.
      await transaction.user.delete({ where: { id } });
      return "DELETED" as const;
    });
    if (outcome === "NOT_FOUND") throw userAdminException("USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    if (outcome === "READ_ONLY") {
      this.logger.warn({ event: "user_admin.delete_denied", actorId: actor.id, targetId: id, msg: "Super Admin or self cannot be deleted" });
      throw userAdminException("SUPER_ADMIN_LOCKED", HttpStatus.FORBIDDEN);
    }
    // The license server is not called (QL1 stays external policy).
    this.licenseService.evictStatus(id);
    this.logger.log({ event: "user_admin.deleted", actorId: actor.id, targetId: id, msg: "User deleted" });
    return { ok: true as const };
  }
}

function parseUserId(rawId: string) {
  const parsed = userIdSchema.safeParse(rawId);
  if (!parsed.success) throw userAdminException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST, [{ path: "id", code: "invalid" }]);
  return parsed.data;
}
