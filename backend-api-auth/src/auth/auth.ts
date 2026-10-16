import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { deleteSessionCookie } from "better-auth/cookies";
import { username as usernamePlugin } from "better-auth/plugins";
import * as argon2 from "argon2";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../database/prisma-client";
import { isValidUsername, normalizeUsername, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH } from "./username-policy";

/** ADR-0020: the only sign-in route. `/sign-in/email` is disabled. */
const SIGN_IN_PATH = "/sign-in/username";

const frontendUrl = new URL(process.env.FRONTEND_URL ?? "http://localhost:3000");
const trustedOrigins = new Set([frontendUrl.origin]);
if (frontendUrl.hostname === "localhost") {
  const loopbackUrl = new URL(frontendUrl);
  loopbackUrl.hostname = "127.0.0.1";
  trustedOrigins.add(loopbackUrl.origin);
}

export const auth = betterAuth({
  appName: "GMS",
  baseURL: process.env.AUTH_BASE_URL ?? "http://localhost:3101",
  basePath: "/api/auth",
  secret: process.env.AUTH_SECRET ?? "local-build-secret-change-before-deploy-00000000",
  trustedOrigins: [...trustedOrigins],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // ADR-0015 (no password reset) + ADR-0020 (username is the only identity; email is internal,
  // username is immutable, no public availability probe). Profile password change uses
  // `PUT /api/v1/me/password`, not `/update-user`.
  disabledPaths: ["/request-password-reset", "/reset-password", "/sign-in/email", "/change-email", "/update-user", "/is-username-available"],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 4,
    maxPasswordLength: 64,
    password: {
      hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
      verify: ({ hash, password }) => argon2.verify(hash, password),
    },
  },
  plugins: [
    usernamePlugin({
      minUsernameLength: USERNAME_MIN_LENGTH,
      maxUsernameLength: USERNAME_MAX_LENGTH,
      usernameNormalization: normalizeUsername,
      usernameValidator: isValidUsername,
      // Normalize (trim + lowercase) before validating, so "User1" signs in as "user1".
      validationOrder: { username: "pre-normalization" },
      displayUsername: false,
    }),
  ],
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "user", input: false },
      active: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      [SIGN_IN_PATH]: { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const username = normalizeLoginUsername(ctx.body?.username);
      if (!username) return;

      const lockout = await prisma.loginLockout.findUnique({
        where: { emailHash: hashLoginIdentity(username) },
        select: { lockedUntil: true },
      });
      if (!lockout?.lockedUntil) return;

      const remainingMs = lockout.lockedUntil.getTime() - Date.now();
      if (remainingMs <= 0) return;

      const user = await findUserIdByUsername(username);
      await recordLoginAttempt(user?.id ?? null, username, false);
      throw new APIError("LOCKED", {
        code: "ACCOUNT_LOCKED",
        message: "ใส่รหัสผ่านผิด 3 ครั้ง กรุณารอสักครู่ก่อนลองใหม่",
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)),
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== SIGN_IN_PATH) return;
      const username = normalizeLoginUsername(ctx.body?.username);
      if (!username) return;

      const returned = ctx.context.returned;
      // 401 = wrong username/password; 422 = a username that cannot exist (too short/long or bad
      // characters). Both answer the same 401 and count toward the lockout (no format oracle).
      if (isAPIError(returned) && (returned.statusCode === 401 || returned.statusCode === 422)) {
        const user = await findUserIdByUsername(username);
        const emailHash = hashLoginIdentity(username);
        const [lockout] = await prisma.$queryRaw<Array<{ failed_login_count: number; locked_until: Date | null }>>`
          INSERT INTO "auth"."LoginLockout" ("email_hash", "failed_login_count", "locked_until")
          VALUES (${emailHash}, 1, NULL)
          ON CONFLICT ("email_hash") DO UPDATE SET
            "failed_login_count" = CASE WHEN "LoginLockout"."failed_login_count" >= 2 THEN 0 ELSE "LoginLockout"."failed_login_count" + 1 END,
            "locked_until" = CASE WHEN "LoginLockout"."failed_login_count" >= 2 THEN NOW() + INTERVAL '1 minute' ELSE NULL END
          RETURNING "failed_login_count", "locked_until"
        `;
        if (user) {
          await prisma.$executeRaw`
            UPDATE "auth"."User" AS account
            SET
              "failed_login_count" = bucket."failed_login_count",
              "locked_until" = bucket."locked_until",
              "updatedAt" = NOW()
            FROM "auth"."LoginLockout" AS bucket
            WHERE account."id" = ${user.id} AND bucket."email_hash" = ${emailHash}
          `;
        }
        await recordLoginAttempt(user?.id ?? null, username, false);

        if (lockout?.locked_until) {
          return jsonStatusResponse({
            code: "ACCOUNT_LOCKED",
            message: "ใส่รหัสผ่านผิด 3 ครั้ง กรุณารอ 1 นาที",
            retryAfterSeconds: 60,
          }, 423);
        }

        // A raw Response pins the status (ctx.json keeps the endpoint's original 422 status).
        return jsonStatusResponse({
          code: "INVALID_USERNAME_OR_PASSWORD",
          message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
          attemptsRemaining: Math.max(0, 3 - (lockout?.failed_login_count ?? 3)),
        }, 401);
      }

      const session = ctx.context.newSession;
      if (session) {
        const emailHash = hashLoginIdentity(username);
        // Correct password but deactivated account (ADR-0017 §5, BE-UP-011): drop the new session,
        // expire the cookie and answer 403 without touching the lockout counters.
        const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { active: true } });
        if (!account?.active) {
          await prisma.session.deleteMany({ where: { id: session.session.id } });
          deleteSessionCookie(ctx);
          await recordLoginAttempt(session.user.id, username, false);
          return jsonStatusResponse({
            code: "ACCOUNT_INACTIVE",
            message: "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
          }, 403);
        }
        if (session.session.id) await retainOnlyNewestSession(session.user.id);
        await prisma.loginLockout.upsert({
          where: { emailHash },
          update: { failedLoginCount: 0, lockedUntil: null },
          create: { emailHash, failedLoginCount: 0, lockedUntil: null },
        });
        await prisma.user.update({
          where: { id: session.user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await recordLoginAttempt(session.user.id, username, true);
      }
    }),
  },
  advanced: {
    defaultCookieAttributes: {
      secure: frontendUrl.protocol === "https:",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  },
});

function normalizeLoginUsername(value: unknown) {
  return typeof value === "string" ? normalizeUsername(value).slice(0, 256) : "";
}

/** HMAC of the normalized username (ADR-0020 §1). Column names keep the historical `email_hash`. */
export function hashLoginIdentity(username: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "local-build-secret-change-before-deploy-00000000").update(username).digest("hex");
}

async function findUserIdByUsername(username: string) {
  if (!isValidUsername(username)) return null;
  return prisma.user.findUnique({ where: { username }, select: { id: true } });
}

async function recordLoginAttempt(userId: string | null, username: string, success: boolean) {
  await prisma.loginAttempt.create({
    data: {
      id: randomUUID(),
      userId,
      emailHash: hashLoginIdentity(username),
      success,
    },
  });
}

async function retainOnlyNewestSession(userId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    await transaction.$executeRaw`
      DELETE FROM "auth"."Session" AS session
      WHERE session."userId" = ${userId}
        AND session."id" <> (
          SELECT newest."id" FROM "auth"."Session" AS newest
          WHERE newest."userId" = ${userId}
          ORDER BY newest."createdAt" DESC, newest."id" DESC
          LIMIT 1
        )
    `;
  });
}

function jsonStatusResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
