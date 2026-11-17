import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

/** ADR-0052 D14: app pool max 5 (idle 30 s, connect 2 s). */
export const INVENTORY_POOL = { max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 } as const;
/** Write transactions: 4 s, maxWait 2 s (as master `WRITE_TX`; below the 5 s master client timeout). */
export const WRITE_TX = { timeout: 4_000, maxWait: 2_000 } as const;

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export type Client = Db | Tx;
export { Prisma };

/**
 * The service's own client (schema `inventory`). `onQuery` (tests only, N+1 review) counts statements without bind
 * values; production never sets it.
 */
export function createDb(connectionString: string, options: { onQuery?: (sql: string) => void; pool?: { max?: number; idleTimeoutMillis?: number; connectionTimeoutMillis?: number } } = {}): Db {
  const adapter = new PrismaPg({ connectionString, ...INVENTORY_POOL, ...options.pool }, { schema: "inventory" });
  if (!options.onQuery) return new PrismaClient({ adapter });
  const client = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
  const listener = options.onQuery;
  (client as unknown as { $on(event: "query", fn: (event: { query: string }) => void): void }).$on("query", (event) => listener(event.query));
  return client;
}

export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;
