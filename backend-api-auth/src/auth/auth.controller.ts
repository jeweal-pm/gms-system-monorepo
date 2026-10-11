import { Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Ip, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import { AuthService } from "./auth.service";
import { LicenseDomainError, LicenseService } from "../license/license.service";

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly licenseService: LicenseService) {}

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
    if (!session) throw licenseException(new LicenseDomainError("UNAUTHORIZED", 401));
    const user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: typeof session.user.role === "string" ? session.user.role : "user",
    };
    try {
      const license = await this.licenseService.resolveStatus(user.id, user.email);
      return { session: { user }, license };
    } catch (error) {
      if (error instanceof LicenseDomainError) {
        return { session: { user }, license: { state: error.code === "LICENSE_REQUIRED" ? "REQUIRED" : "UNVERIFIABLE", checkedAt: new Date().toISOString() } };
      }
      return { session: { user }, license: { state: "UNVERIFIABLE", checkedAt: new Date().toISOString() } };
    }
  }

  @Get("internal/v1/license/status")
  async licenseStatus(@Req() request: Request) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw licenseException(new LicenseDomainError("UNAUTHORIZED", 401));
    try {
      return await this.licenseService.resolveStatus(session.user.id, session.user.email);
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
      return await this.licenseService.activate(session.user.id, session.user.email, licenseKey);
    } catch (error) {
      if (error instanceof LicenseDomainError && error.retryAfter) response.setHeader("retry-after", String(error.retryAfter));
      throw licenseException(error);
    }
  }

  @Post("api/v1/auth/forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() body: unknown, @Ip() ip: string) {
    try {
      await this.authService.forgotPassword(body, ip);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Keep an accepted response for existing addresses and SMTP failures alike.
    }
    return { accepted: true, message: "หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งรหัสผ่านใหม่ไปให้แล้ว" };
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
  }
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
