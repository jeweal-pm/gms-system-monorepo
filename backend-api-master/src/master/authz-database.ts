import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { setApproverLookup } from "../notification/notification-recipients";

/** ADR-0049 D4: at most this many approvers receive one event. */
export const APPROVER_LIMIT = 200;

export type CurrentAuthorization = {
  session_id: string;
  user_id: string;
  session_expires_at: Date | string;
  account_active: boolean;
  account_role: string;
  permissions: string[];
  location_keys: string[];
  /** ADR-0046 D5: the session owner's own User.name (never another user's); normalized by the auth context. */
  user_name: string | null;
};

export function requireMasterAuthzDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.MASTER_AUTHZ_DATABASE_URL;
  if (!raw) throw new Error("MASTER_AUTHZ_DATABASE_URL is required");
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("MASTER_AUTHZ_DATABASE_URL must be a valid PostgreSQL URL"); }
  if ((url.protocol !== "postgresql:" && url.protocol !== "postgres:") || !url.hostname || !url.username || !url.password || url.hash) {
    throw new Error("MASTER_AUTHZ_DATABASE_URL must be a credentialed PostgreSQL URL");
  }
  return url.toString();
}

/** Separate one-connection client; never uses or falls back to the domain partner connection. */
@Injectable()
export class MasterAuthzDatabase implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: requireMasterAuthzDatabaseUrl(), max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 1_000 }, { schema: "auth" }),
    });
  }

  async onModuleInit() {
    await this.client.$connect();
    setApproverLookup((documentType) => this.approvers(documentType));
  }

  async onModuleDestroy() {
    setApproverLookup(null);
    await this.client.$disconnect();
  }

  /**
   * ADR-0049 D4: active users who may approve `leaf` (APPROVE + VIEW on it) or are Super Admins, from the auth-owned
   * `auth.permission_holders` view. Bounded to APPROVER_LIMIT ids.
   */
  async approvers(leaf: string): Promise<string[]> {
    if (!/^[a-z0-9-]{1,64}$/.test(leaf)) return [];
    const wanted = [`${leaf}:APPROVE`, `${leaf}:VIEW`];
    const rows = await this.client.$queryRaw<{ user_id: string }[]>`
      SELECT user_id
      FROM "auth"."permission_holders"
      WHERE account_active AND (account_role = 'admin' OR permissions @> ${wanted}::text[])
      ORDER BY user_id
      LIMIT ${APPROVER_LIMIT}
    `;
    return rows.map((row) => row.user_id);
  }

  async read(userId: string, sessionId: string): Promise<CurrentAuthorization | null> {
    const rows = await this.client.$queryRaw<CurrentAuthorization[]>`
      SELECT session_id, user_id, session_expires_at, account_active, account_role, permissions, location_keys, user_name
      FROM "auth"."current_authorization"
      WHERE user_id = ${userId} AND session_id = ${sessionId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
