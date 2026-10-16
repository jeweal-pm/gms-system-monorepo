import { TRPCError } from "@trpc/server";
import type { Request } from "express";
import { NO_AUTHZ, type SessionAuthz, type SessionUser, type TrpcContext } from "./trpc/router";
import { MAX_GRANTS, PERMISSION_KEY_PATTERN } from "./trpc/user-admin-schemas";

/**
 * Cookie → session, licence and authz from auth session-context. Shared by the tRPC middleware and
 * the REST controllers (company-profile BE-CP-006), so both apply the same checks. Moved unchanged
 * from main.ts.
 */
export async function createContext({ req }: { req: Request }): Promise<TrpcContext> {
  const cookie = req.headers.cookie;
  if (!cookie) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };

  try {
    const authUrl = process.env.AUTH_SERVICE_URL ?? "http://localhost:3101";
    const response = await fetch(`${authUrl}/internal/v1/session-context`, {
      headers: { cookie },
      signal: AbortSignal.timeout(3_500),
    });
    if (!response.ok) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("session" in data) || !("license" in data)) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    const contextData = data as { session?: unknown; license?: unknown };
    if (contextData.session === null) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    if (typeof contextData.session !== "object" || contextData.session === null || !("user" in contextData.session)) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    const user = (contextData.session as { user?: unknown }).user;
    if (typeof user !== "object" || user === null) return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    const userRecord = user as Record<string, unknown>;
    if (typeof userRecord.id !== "string" || typeof userRecord.email !== "string" || typeof userRecord.name !== "string") return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
    const sessionUser: SessionUser = {
      id: userRecord.id,
      username: typeof userRecord.username === "string" ? userRecord.username : "",
      email: userRecord.email,
      name: userRecord.name,
      role: typeof userRecord.role === "string" ? userRecord.role : undefined,
    };
    const license = parseLicenseStatus(contextData.license);
    const authz = parseAuthz((data as { authz?: unknown }).authz);
    if (!license) return { session: { user: sessionUser }, license: { state: "UNVERIFIABLE" }, authz, cookie, activateLicense: null };
    return {
      session: { user: sessionUser },
      license,
      authz,
      cookie,
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
    return { session: null, license: null, authz: NO_AUTHZ, cookie: null, activateLicense: null };
  }
}

/** Fail closed (ADR-0016 §4): a missing or malformed block means no Super Admin and no grants. */
function parseAuthz(value: unknown): SessionAuthz {
  if (typeof value !== "object" || value === null) return NO_AUTHZ;
  const record = value as { isSuperAdmin?: unknown; permissions?: unknown };
  if (typeof record.isSuperAdmin !== "boolean" || !Array.isArray(record.permissions) || record.permissions.length > MAX_GRANTS) return NO_AUTHZ;
  if (!record.permissions.every((key): key is string => typeof key === "string" && PERMISSION_KEY_PATTERN.test(key))) return NO_AUTHZ;
  return { isSuperAdmin: record.isSuperAdmin, permissions: [...new Set(record.permissions)] };
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
