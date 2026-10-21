import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../database/prisma-client";

const REFRESH_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

/** A 32-byte bearer secret; only its SHA-256 digest is persisted. */
export function newRefreshSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function refreshSecretHash(secret: string): string {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("Invalid refresh credential");
  return createHash("sha256").update(secret).digest("hex");
}

/** RFC 9562 UUIDv7, generated in the app for PostgreSQL 16 compatibility. */
export function refreshId(now = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) throw new Error("Invalid UUIDv7 time");
  const bytes = randomBytes(16);
  for (let i = 5, value = now; i >= 0; i--, value = Math.floor(value / 256)) bytes[i] = value % 256;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type RefreshOutcome =
  | { state: "rotated"; userId: string; sessionId: string; secret: string }
  | { state: "invalid" | "reused" | "unavailable" };

/**
 * Staged storage primitive. The caller must verify current license eligibility outside
 * the transaction and may issue an access JWT only after a successful rotation.
 * No public route calls this until the complete login/license/CSRF cutover is verified.
 */
export class RefreshCredentialStore {
  async create(userId: string, sessionId: string): Promise<string> {
    const secret = newRefreshSecret();
    const tokenHash = refreshSecretHash(secret);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const [current] = await tx.$queryRaw<Array<{ valid: boolean }>>`
        SELECT (u."active" AND s."expiresAt" > now()) AS valid
        FROM "auth"."Session" s JOIN "auth"."User" u ON u."id" = s."userId"
        WHERE s."id" = ${sessionId} AND s."userId" = ${userId}
      `;
      if (!current?.valid) throw new Error("Session is not active");
      await tx.refreshFamily.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      const expiresAt = new Date(Date.now() + REFRESH_LIFETIME_MS);
      await tx.refreshFamily.create({ data: {
        id: refreshId(), userId, sessionId, expiresAt,
        credentials: { create: { id: refreshId(), tokenHash, expiresAt } },
      } });
    });
    return secret;
  }

  async rotate(secret: string): Promise<RefreshOutcome> {
    let hash: string;
    try { hash = refreshSecretHash(secret); } catch { return { state: "invalid" }; }
    return prisma.$transaction(async (tx): Promise<RefreshOutcome> => {
      // Family lock serializes concurrent uses even across auth replicas. Read again under
      // the lock so a loser sees consumed_at and revokes the family for replay.
      const [candidate] = await tx.$queryRaw<Array<{ family_id: string }>>`
        SELECT "family_id" FROM "auth"."RefreshCredential" WHERE "token_hash" = ${hash}
      `;
      if (!candidate) return { state: "invalid" };
      const [family] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "auth"."RefreshFamily" WHERE "id" = ${candidate.family_id}::uuid FOR UPDATE
      `;
      if (!family) return { state: "invalid" };
      const [row] = await tx.$queryRaw<Array<{
        id: string; family_id: string; consumed_at: Date | null; credential_expires_at: Date;
        family_expires_at: Date; revoked_at: Date | null; user_id: string; session_id: string;
        active: boolean; session_expires_at: Date | null;
      }>>`
        SELECT c."id", c."family_id", c."consumed_at", c."expires_at" AS credential_expires_at,
          f."expires_at" AS family_expires_at, f."revoked_at", f."user_id", f."session_id",
          u."active", s."expiresAt" AS session_expires_at
        FROM "auth"."RefreshCredential" c
        JOIN "auth"."RefreshFamily" f ON f."id" = c."family_id"
        JOIN "auth"."User" u ON u."id" = f."user_id"
        LEFT JOIN "auth"."Session" s ON s."id" = f."session_id" AND s."userId" = f."user_id"
        WHERE c."token_hash" = ${hash}
      `;
      if (!row || row.revoked_at) return { state: "invalid" };
      if (row.consumed_at) {
        await tx.refreshFamily.update({ where: { id: row.family_id }, data: { revokedAt: new Date() } });
        return { state: "reused" };
      }
      const now = Date.now();
      if (!row.active || !row.session_expires_at || row.session_expires_at.getTime() <= now ||
          row.family_expires_at.getTime() <= now || row.credential_expires_at.getTime() <= now) {
        await tx.refreshFamily.update({ where: { id: row.family_id }, data: { revokedAt: new Date() } });
        return { state: "invalid" };
      }
      const next = newRefreshSecret();
      await tx.refreshCredential.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
      await tx.refreshCredential.create({ data: {
        id: refreshId(), familyId: row.family_id, tokenHash: refreshSecretHash(next), expiresAt: row.family_expires_at,
      } });
      return { state: "rotated", userId: row.user_id, sessionId: row.session_id, secret: next };
    });
  }

  async revokeForSession(sessionId: string): Promise<void> {
    await prisma.refreshFamily.updateMany({ where: { sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeForUser(userId: string): Promise<void> {
    await prisma.refreshFamily.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
