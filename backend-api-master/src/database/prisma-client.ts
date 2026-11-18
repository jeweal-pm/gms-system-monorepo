import { PrismaPg } from "@prisma/adapter-pg";
import { loadDatabaseUrl } from "../config";
import { PrismaClient } from "../generated/prisma/client";

/** Bounded pool (architecture.md "Capacity"): max 5 connections, finite acquire timeout. */
export const PARTNER_POOL = { max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 } as const;

/**
 * N+1 review instrumentation (load-to-stock testing.md NP-LS-*): query events are emitted only when a test sets
 * `PRISMA_QUERY_EVENTS=1` outside production; the events are counted, never logged with bind values.
 */
const queryEvents = process.env.PRISMA_QUERY_EVENTS === "1" && process.env.NODE_ENV !== "production";

const adapter = new PrismaPg({ connectionString: loadDatabaseUrl(), ...PARTNER_POOL }, { schema: "partner" });
export const prisma = new PrismaClient({ adapter, ...(queryEvents ? { log: [{ emit: "event" as const, level: "query" as const }] } : {}) });
