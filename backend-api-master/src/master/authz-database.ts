import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

export type CurrentAuthorization = {
  session_id: string;
  user_id: string;
  session_expires_at: Date | string;
  account_active: boolean;
  account_role: string;
  permissions: string[];
  location_keys: string[];
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

  async onModuleInit() { await this.client.$connect(); }
  async onModuleDestroy() { await this.client.$disconnect(); }

  async read(userId: string, sessionId: string): Promise<CurrentAuthorization | null> {
    const rows = await this.client.$queryRaw<CurrentAuthorization[]>`
      SELECT session_id, user_id, session_expires_at, account_active, account_role, permissions, location_keys
      FROM "auth"."current_authorization"
      WHERE user_id = ${userId} AND session_id = ${sessionId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
