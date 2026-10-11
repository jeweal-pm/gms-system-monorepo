import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { TRPCError } from "@trpc/server";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import type { Request, Response } from "express";
import { AppModule } from "./app.module";
import { appRouter, type SessionUser, type TrpcContext } from "./trpc/router";

async function createContext({ req }: { req: Request; res: Response }): Promise<TrpcContext> {
  const cookie = req.headers.cookie;
  if (!cookie) return { session: null, license: null, activateLicense: null };

  try {
    const authUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
    const response = await fetch(`${authUrl}/internal/v1/session-context`, {
      headers: { cookie },
      signal: AbortSignal.timeout(3_500),
    });
    if (!response.ok) return { session: null, license: null, activateLicense: null };
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("session" in data) || !("license" in data)) return { session: null, license: null, activateLicense: null };
    const contextData = data as { session?: unknown; license?: unknown };
    if (contextData.session === null) return { session: null, license: null, activateLicense: null };
    if (typeof contextData.session !== "object" || contextData.session === null || !("user" in contextData.session)) return { session: null, license: null, activateLicense: null };
    const user = (contextData.session as { user?: unknown }).user;
    if (typeof user !== "object" || user === null) return { session: null, license: null, activateLicense: null };
    const userRecord = user as Record<string, unknown>;
    if (typeof userRecord.id !== "string" || typeof userRecord.email !== "string" || typeof userRecord.name !== "string") return { session: null, license: null, activateLicense: null };
    const sessionUser: SessionUser = { id: userRecord.id, email: userRecord.email, name: userRecord.name, role: typeof userRecord.role === "string" ? userRecord.role : undefined };
    const license = parseLicenseStatus(contextData.license);
    if (!license) return { session: { user: sessionUser }, license: { state: "UNVERIFIABLE" }, activateLicense: null };
    return {
      session: { user: sessionUser },
      license,
      activateLicense: async (licenseKey: string) => {
        const activation = await fetch(`${authUrl}/internal/v1/license/activate`, {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ licenseKey }),
          signal: AbortSignal.timeout(3_500),
        });
        const payload: unknown = await activation.json().catch(() => null);
        if (!activation.ok) {
          const error = typeof payload === "object" && payload !== null && "error" in payload
            ? (payload as { error?: { code?: unknown; message?: unknown } }).error
            : undefined;
          const code = typeof error?.code === "string" ? error.code : "LICENSE_UNVERIFIABLE";
          const trpcCode = code === "INVALID_KEY" ? "BAD_REQUEST"
            : code === "ALREADY_ACTIVATED" ? "CONFLICT"
              : code === "TOO_MANY_ATTEMPTS" ? "TOO_MANY_REQUESTS"
                : code === "UNAUTHORIZED" ? "UNAUTHORIZED"
                  : code === "LICENSE_REQUIRED" || code === "LICENSE_EXPIRED" || code === "LICENSE_REVOKED" ? "FORBIDDEN"
                    : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({ code: trpcCode, message: code });
        }
        const status = parseLicenseStatus(payload);
        if (!status) throw new Error("LICENSE_UNVERIFIABLE");
        return status;
      },
    };
  } catch {
    return { session: null, license: null, activateLicense: null };
  }
}

function parseLicenseStatus(value: unknown): TrpcContext["license"] {
  if (typeof value !== "object" || value === null || !("state" in value)) return null;
  const status = value as Record<string, unknown>;
  const states = ["VALID", "EXPIRING", "EXPIRED", "REVOKED", "REQUIRED", "GRACE", "UNVERIFIABLE"];
  if (typeof status.state !== "string" || !states.includes(status.state)) return null;
  return {
    state: status.state as NonNullable<TrpcContext["license"]>["state"],
    type: status.type === "trial" || status.type === "paid" ? status.type : undefined,
    expiresAt: typeof status.expiresAt === "string" ? status.expiresAt : undefined,
    daysRemaining: typeof status.daysRemaining === "number" ? status.daysRemaining : undefined,
    checkedAt: typeof status.checkedAt === "string" ? status.checkedAt : undefined,
    retryAfter: typeof status.retryAfter === "number" ? status.retryAfter : undefined,
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.use("/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
