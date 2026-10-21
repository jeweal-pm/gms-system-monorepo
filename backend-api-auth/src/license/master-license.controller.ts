import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LicenseDomainError, LicenseService } from "./license.service";
import { prisma } from "../database/prisma-client";

const MAX_BODY_BYTES = 1_024;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const HANDLER_DEADLINE_MS = 1_900;

/** Private partner-to-auth decision API. The token is read only from a mounted file. */
@Controller()
export class MasterLicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  @Post("internal/v1/license/current")
  @HttpCode(HttpStatus.OK)
  async current(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "private, no-store");
    const presented = request.headers.authorization;
    if (typeof presented !== "string" || !/^Bearer [A-Za-z0-9_-]{43}$/.test(presented)) {
      throw internalError(401, "SERVICE_UNAUTHENTICATED");
    }
    const expected = await readServiceTokenDigest();
    if (!expected) throw internalError(503, "LICENSE_UNVERIFIABLE");
    const actual = createHash("sha256").update(presented.slice(7)).digest();
    if (!timingSafeEqual(actual, expected)) throw internalError(401, "SERVICE_UNAUTHENTICATED");

    let encoded: string;
    try { encoded = JSON.stringify(body); } catch { throw internalError(400, "VALIDATION_ERROR"); }
    if (Buffer.byteLength(encoded ?? "") > MAX_BODY_BYTES || !isStrictInput(body)) throw internalError(400, "VALIDATION_ERROR");
    const deadline = Date.now() + HANDLER_DEADLINE_MS;

    let current: { session_id: string; user_id: string; session_expires_at: Date; account_active: boolean } | undefined;
    try {
      const rows = await withDeadline(prisma.$queryRaw<typeof current[]>`
        SELECT session_id, user_id, session_expires_at, account_active
        FROM "auth"."current_authorization"
        WHERE user_id = ${body.userId} AND session_id = ${body.sessionId}
        LIMIT 1
      `, deadline);
      current = rows[0];
    } catch {
      throw internalError(503, "LICENSE_UNVERIFIABLE");
    }
    if (!current || current.user_id !== body.userId || current.session_id !== body.sessionId || !current.account_active || current.session_expires_at <= new Date()) {
      throw internalError(401, "AUTHORIZATION_CONTEXT_INVALID");
    }

    try {
      const status = await withDeadline(this.licenseService.resolveCurrentStatus(body.userId), deadline);
      if (status.state === "VALID" || status.state === "EXPIRING" || status.state === "GRACE") {
        return { decision: "ELIGIBLE", status: status.state, checkedAt: status.checkedAt ?? new Date().toISOString(), fallbackUntil: status.fallbackUntil ?? null };
      }
      const code = status.state === "REVOKED" ? "LICENSE_REVOKED" : status.state === "EXPIRED" ? "LICENSE_EXPIRED" : "LICENSE_REQUIRED";
      const error = internalError(403, code);
      throw error;
    } catch (error) {
      if (isHttpEnvelope(error)) throw error;
      if (error instanceof LicenseDomainError) {
        const code = error.code === "LICENSE_REVOKED" ? "LICENSE_REVOKED" : error.code === "LICENSE_EXPIRED" ? "LICENSE_EXPIRED" : error.code === "LICENSE_REQUIRED" ? "LICENSE_REQUIRED" : "LICENSE_UNVERIFIABLE";
        throw internalError(error.httpStatus === 403 ? 403 : 503, code);
      }
      throw internalError(503, "LICENSE_UNVERIFIABLE");
    }
  }
}

async function readServiceTokenDigest(): Promise<Buffer | null> {
  const path = process.env.MASTER_AUTH_SERVICE_TOKEN_FILE;
  if (!path || path.length > 512) return null;
  try {
    let token = await readFile(path, "utf8");
    if (token.endsWith("\r\n")) token = token.slice(0, -2);
    else if (token.endsWith("\n")) token = token.slice(0, -1);
    if (!TOKEN_RE.test(token)) return null;
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length !== 32 || bytes.toString("base64url") !== token) return null;
    return createHash("sha256").update(token).digest();
  } catch { return null; }
}

function isStrictInput(value: unknown): value is { userId: string; sessionId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).length === 2 && Object.keys(object).every((key) => key === "userId" || key === "sessionId") &&
    typeof object.userId === "string" && object.userId.length >= 1 && object.userId.length <= 128 &&
    typeof object.sessionId === "string" && object.sessionId.length >= 1 && object.sessionId.length <= 128;
}

function internalError(status: number, code: string) {
  const messages: Record<string, string> = {
    SERVICE_UNAUTHENTICATED: "Service authentication required",
    VALIDATION_ERROR: "Request is invalid",
    AUTHORIZATION_CONTEXT_INVALID: "Authorization context is invalid",
    LICENSE_REQUIRED: "An eligible license is required",
    LICENSE_EXPIRED: "The license has expired",
    LICENSE_REVOKED: "The license is not active",
    LICENSE_UNVERIFIABLE: "The license cannot be verified right now",
  };
  return new HttpException({ error: { code, message: messages[code] ?? "Request failed", requestId: randomUUID() } }, status);
}

function isHttpEnvelope(value: unknown): value is Error & { status: number; code: string } {
  return value instanceof HttpException;
}

function withDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error("deadline exceeded"));
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("deadline exceeded")), remaining); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}
