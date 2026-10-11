import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../database/prisma-client";
import { EmailService } from "../email/email.service";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import { generatePassword, passwordSchema } from "./password-policy";

const createUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  role: z.literal("SUPER_ADMIN"),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).strict();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly emailService: EmailService, private readonly licenseService: LicenseService) {}

  async createUser(apiKey: string | undefined, input: unknown) {
    const expectedKey = process.env.CRM_API_KEY;
    if (!expectedKey || !apiKey || !secureEquals(apiKey, expectedKey)) throw new UnauthorizedException("Invalid API key");
    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ error: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => issue.message) });

    const { email, name } = parsed.data;
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

    const password = generatePassword();
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

    try {
      await this.emailService.sendGeneratedPassword(normalizedEmail, name, password, "ข้อมูลเข้าสู่ระบบ GMS");
    } catch {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      this.logger.error("Credential delivery failed during CRM provisioning");
      throw new ServiceUnavailableException("Could not deliver the initial credential");
    }
    this.logger.log("CRM provisioned a user account");
    return { userId: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
  }

  async forgotPassword(input: unknown, ip: string) {
    const parsed = z.object({ email: z.email().max(254) }).strict().safeParse(input);
    if (!parsed.success) throw new BadRequestException({ error: "VALIDATION_ERROR", details: parsed.error.issues.map((issue) => issue.message) });

    const normalizedEmail = parsed.data.email.toLowerCase();
    const bucketKey = createHash("sha256").update(`${ip}:${normalizedEmail}`).digest("hex");
    const ipBucket = await incrementForgotLimit(createHash("sha256").update(ip).digest("hex"));
    const emailBucket = await incrementForgotLimit(bucketKey);
    if (ipBucket > 30 || emailBucket > 5) throw new HttpException("Too many forgot-password requests", HttpStatus.TOO_MANY_REQUESTS);
    void this.deliverForgotPassword(normalizedEmail);
    return { accepted: true };
  }

  private async deliverForgotPassword(email: string) {
    try {
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
      if (!user) return;
      const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" }, select: { id: true } });
      if (!account) return;

      const password = generatePassword();
      await this.emailService.sendGeneratedPassword(user.email, user.name, password, "รหัสผ่านใหม่สำหรับ GMS");
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash, updatedAt: new Date() } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
    } catch {
      this.logger.error("Forgot-password request could not be completed");
    }
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

async function incrementForgotLimit(key: string) {
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "auth"."ForgotPasswordAttempt" ("key", "count", "expiresAt")
    VALUES (${key}, 1, NOW() + INTERVAL '1 minute')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ForgotPasswordAttempt"."expiresAt" <= NOW() THEN 1 ELSE "ForgotPasswordAttempt"."count" + 1 END,
      "expiresAt" = CASE WHEN "ForgotPasswordAttempt"."expiresAt" <= NOW() THEN NOW() + INTERVAL '1 minute' ELSE "ForgotPasswordAttempt"."expiresAt" END
    RETURNING "count"
  `;
  return row?.count ?? Number.POSITIVE_INFINITY;
}
