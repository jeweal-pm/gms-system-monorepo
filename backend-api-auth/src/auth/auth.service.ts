import { timingSafeEqual, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../database/prisma-client";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import { passwordSchema } from "./password-policy";

const createUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  role: z.literal("SUPER_ADMIN"),
  password: passwordSchema,
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).strict();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly licenseService: LicenseService) {}

  async createUser(apiKey: string | undefined, input: unknown) {
    const expectedKey = process.env.CRM_API_KEY;
    if (!expectedKey || !apiKey || !secureEquals(apiKey, expectedKey)) throw new UnauthorizedException("Invalid API key");
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      if (issues.every((issue) => issue.path[0] === "password" && issue.code !== "invalid_type")) {
        throw new BadRequestException({ error: "PASSWORD_POLICY_VIOLATION", violations: issues.map((issue) => issue.message) });
      }
      throw new BadRequestException({ error: "VALIDATION_ERROR", details: issues.map((issue) => issue.message) });
    }

    const { email, name, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email: normalizedEmail } })) throw new ConflictException({ error: "EMAIL_ALREADY_EXISTS" });

    let licensePreflight: { eligible: true; token?: string } | { eligible: false };
    try {
      licensePreflight = await this.licenseService.lookupForProvisioning(normalizedEmail);
    } catch (error) {
      if (error instanceof LicenseDomainError) throw licenseHttpException(error);
      throw licenseHttpException(new LicenseDomainError("LICENSE_UNVERIFIABLE", 503));
    }
    if (!licensePreflight.eligible) {
      throw new HttpException({ error: { code: "LICENSE_REQUIRED", message: "An eligible license is required before creating this account" } }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const now = new Date();
    const userId = randomUUID();
    let user: { id: string; email: string; createdAt: Date };
    try {
      user = await prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: { id: userId, name, email: normalizedEmail, emailVerified: true, role: "admin", createdAt: now, updatedAt: now },
          select: { id: true, email: true, createdAt: true },
        });
        await transaction.account.create({
          data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash, createdAt: now, updatedAt: now },
        });
        return createdUser;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictException({ error: "EMAIL_ALREADY_EXISTS" });
      throw error;
    }

    try {
      await this.licenseService.cacheProvisionedToken(user.id, licensePreflight.token);
    } catch {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      this.logger.error("CRM provisioning stopped because license cache could not be committed");
      throw licenseHttpException(new LicenseDomainError("LICENSE_UNVERIFIABLE", 503));
    }
    this.logger.log("CRM provisioned a user account");
    return { userId: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
  }

  validatePasswordChange(input: unknown) {
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ error: "PASSWORD_POLICY_VIOLATION", violations: parsed.error.issues.map((issue) => issue.message) });
    if (parsed.data.newPassword !== parsed.data.confirmPassword) throw new BadRequestException({ error: "PASSWORD_CONFIRMATION_MISMATCH", violations: ["รหัสผ่านยืนยันไม่ตรงกัน"] });
    return parsed.data;
  }
}

function secureEquals(value: string, expected: string) {
  const actualBytes = Buffer.from(value);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function licenseHttpException(error: LicenseDomainError) {
  const messages: Record<string, string> = {
    INVALID_KEY: "The license key is invalid",
    ALREADY_ACTIVATED: "The license is already activated",
    TOO_MANY_ATTEMPTS: "Too many activation attempts",
    LICENSE_REQUIRED: "An eligible license is required",
    LICENSE_UNVERIFIABLE: "The license cannot be verified right now",
  };
  return new HttpException({ error: { code: error.code, message: messages[error.code] ?? "License operation failed" } }, error.httpStatus);
}
