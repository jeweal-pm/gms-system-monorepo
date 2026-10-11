import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import * as argon2 from "argon2";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "../database/prisma-client";

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
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 4,
    maxPasswordLength: 64,
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
      verify: ({ hash, password }) => argon2.verify(hash, password),
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "user", input: false },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = normalizeLoginEmail(ctx.body.email);
      if (!email) return;

      const lockout = await prisma.loginLockout.findUnique({
        where: { emailHash: hashLoginEmail(email) },
        select: { lockedUntil: true },
      });
      if (!lockout?.lockedUntil) return;

      const remainingMs = lockout.lockedUntil.getTime() - Date.now();
      if (remainingMs <= 0) return;

      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      await recordLoginAttempt(user?.id ?? null, email, false);
      throw new APIError("LOCKED", {
        code: "ACCOUNT_LOCKED",
        message: "ใส่รหัสผ่านผิด 3 ครั้ง กรุณารอสักครู่ก่อนลองใหม่",
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)),
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = normalizeLoginEmail(ctx.body.email);
      if (!email) return;

      const returned = ctx.context.returned;
      if (isAPIError(returned) && returned.statusCode === 401) {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        const emailHash = hashLoginEmail(email);
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
        await recordLoginAttempt(user?.id ?? null, email, false);

        if (lockout?.locked_until) {
          return jsonStatusResponse({
            code: "ACCOUNT_LOCKED",
            message: "ใส่รหัสผ่านผิด 3 ครั้ง กรุณารอ 1 นาที",
            retryAfterSeconds: 60,
          }, 423);
        }

        return ctx.json({
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
          attemptsRemaining: Math.max(0, 3 - (lockout?.failed_login_count ?? 3)),
        }, { status: 401 });
      }

      const session = ctx.context.newSession;
      if (session) {
        if (session.session.id) await retainOnlyNewestSession(session.user.id);
        const emailHash = hashLoginEmail(email);
        await prisma.loginLockout.upsert({
          where: { emailHash },
          update: { failedLoginCount: 0, lockedUntil: null },
          create: { emailHash, failedLoginCount: 0, lockedUntil: null },
        });
        await prisma.user.update({
          where: { id: session.user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await recordLoginAttempt(session.user.id, email, true);
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

function normalizeLoginEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hashLoginEmail(email: string) {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "local-build-secret-change-before-deploy-00000000").update(email).digest("hex");
}

async function recordLoginAttempt(userId: string | null, email: string, success: boolean) {
  await prisma.loginAttempt.create({
    data: {
      id: randomUUID(),
      userId,
      emailHash: hashLoginEmail(email),
      success,
    },
  });
}

async function retainOnlyNewestSession(userId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
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
