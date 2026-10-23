import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { AuthService } from "./auth.service";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import { loadSessionAuthz } from "../permission/grants";
import { registerAccessTokenEligibilityCheck } from "./access-token";
import { RefreshCredentialStore } from "./refresh-credential";

@Controller()
export class AuthController {
  private readonly refreshCredentials = new RefreshCredentialStore();

  constructor(private readonly authService: AuthService, private readonly licenseService: LicenseService) {
    registerAccessTokenEligibilityCheck(async (userId, username) => {
      const status = await this.licenseService.resolveStatus(userId, username);
      return status.state === "VALID" || status.state === "EXPIRING" || status.state === "GRACE";
    });
  }

  @Get("health/live")
  live() { return { status: "ok" }; }

  @Get("health/ready")
  async ready() {
    await auth.$context;
    return { status: "ok", dependencies: { database: "ok" } };
  }

  @Post("api/v1/users")
  @HttpCode(HttpStatus.CREATED)
  createUser(@Headers("x-api-key") apiKey: string | undefined, @Body() body: unknown) {
    return this.authService.createUser(apiKey, body);
  }

  @Get("internal/v1/session-context")
  async sessionContext(@Req() request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    // Inactive accounts are rejected as unauthenticated (defense in depth, ADR-0017 §5).
    if (!session || session.user.active === false) throw licenseException(new LicenseDomainError("UNAUTHORIZED", 401));
    const user = {
      id: session.user.id,
      username: session.user.username ?? "",
      // Internal `<id>@users.invalid` (ADR-0020); kept for compatibility, never shown.
      email: session.user.email,
      name: session.user.name,
      role: typeof session.user.role === "string" ? session.user.role : "user",
      active: true,
    };
    // Uncached grants (ADR-0016 §4): changes apply on the caller's next request.
    const authz = await loadSessionAuthz(user.id, user.role);
    try {
      const license = await this.licenseService.resolveStatus(user.id, user.username);
      return { session: { user }, license, authz };
    } catch (error) {
      if (error instanceof LicenseDomainError) {
        return { session: { user }, license: { state: error.code === "LICENSE_REQUIRED" ? "REQUIRED" : "UNVERIFIABLE", checkedAt: new Date().toISOString() }, authz };
      }
      return { session: { user }, license: { state: "UNVERIFIABLE", checkedAt: new Date().toISOString() }, authz };
    }
  }

  @Get("internal/v1/license/status")
  async licenseStatus(@Req() request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw licenseException(new LicenseDomainError("UNAUTHORIZED", 401));
    try {
      return await this.licenseService.resolveStatus(session.user.id, licenseSubject(session.user));
    } catch (error) {
      throw licenseException(error);
    }
  }

  @Post("internal/v1/license/activate")
  @HttpCode(HttpStatus.OK)
  async activateLicense(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw licenseException(new LicenseDomainError("UNAUTHORIZED", 401));
    const licenseKey = typeof body === "object" && body !== null && "licenseKey" in body
      ? (body as { licenseKey?: unknown }).licenseKey
      : undefined;
    try {
      return await this.licenseService.activate(session.user.id, licenseSubject(session.user), licenseKey);
    } catch (error) {
      if (error instanceof LicenseDomainError && error.retryAfter) response.setHeader("retry-after", String(error.retryAfter));
      throw licenseException(error);
    }
  }

  @Put("api/v1/me/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@Req() request: Request, @Body() body: unknown) {
    const headers = fromNodeHeaders(request.headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
    const input = this.authService.validatePasswordChange(body);
    const result = await auth.api.changePassword({
      headers,
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: false },
      asResponse: true,
    });
    if (!result.ok) {
      const details = await result.json().catch(() => null) as { code?: string; message?: string } | null;
      if (details?.code === "INVALID_PASSWORD") throw new HttpException("Unauthorized", HttpStatus.UNAUTHORIZED);
      throw new HttpException(details ?? "Could not update password", result.status);
    }
    await auth.api.revokeOtherSessions({ headers });
    await this.refreshCredentials.revokeForUser(session.user.id);
  }
}

/** ADR-0020 §2: the license identity is the immutable username. */
export function licenseSubject(user: { username?: string | null }) {
  return user.username ?? "";
}

function licenseException(error: unknown): HttpException {
  const domain = error instanceof LicenseDomainError ? error : new LicenseDomainError("LICENSE_UNVERIFIABLE", 503);
  const status = domain.httpStatus;
  const messages: Record<string, string> = {
    UNAUTHORIZED: "Authentication required",
    INVALID_KEY: "The license key is invalid",
    ALREADY_ACTIVATED: "The license is already activated",
    TOO_MANY_ATTEMPTS: "Too many activation attempts",
    LICENSE_REQUIRED: "An eligible license is required",
    LICENSE_EXPIRED: "The license has expired",
    LICENSE_REVOKED: "The license is not active",
    LICENSE_UNVERIFIABLE: "The license cannot be verified right now",
  };
  return new HttpException({ error: { code: domain.code, message: messages[domain.code] ?? "License operation failed" } }, status);
}
