import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import type { AuthorizationRow } from "./principal";

/** ADR-0049 D4: at most this many approvers receive one event. */
export const APPROVER_LIMIT = 200;

/**
 * Live authorization through `gms_inventory_authz_reader` (pool max 1; SELECT on two auth views only, BE-LS-001).
 * Never falls back to the app connection.
 */
export class AuthzDatabase {
  private readonly client: PrismaClient;

  constructor(connectionString: string) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 1_000 }, { schema: "auth" }) });
  }

  async read(userId: string, sessionId: string): Promise<AuthorizationRow | null> {
    const rows = await this.client.$queryRaw<AuthorizationRow[]>`
      SELECT session_id, user_id, session_expires_at, account_active, account_role, permissions, user_name
      FROM "auth"."current_authorization"
      WHERE user_id = ${userId} AND session_id = ${sessionId}
      LIMIT 1`;
    return rows[0] ?? null;
  }

  /** Active holders of `<leaf>:APPROVE` + `<leaf>:VIEW`, plus Super Admins (bounded). */
  async approvers(leaf: string): Promise<string[]> {
    if (!/^[a-z0-9-]{1,64}$/.test(leaf)) return [];
    const wanted = [`${leaf}:APPROVE`, `${leaf}:VIEW`];
    const rows = await this.client.$queryRaw<{ user_id: string }[]>`
      SELECT user_id FROM "auth"."permission_holders"
      WHERE account_active AND (account_role = 'admin' OR permissions @> ${wanted}::text[])
      ORDER BY user_id LIMIT ${APPROVER_LIMIT}`;
    return rows.map((row) => row.user_id);
  }

  disconnect() {
    return this.client.$disconnect();
  }
}
