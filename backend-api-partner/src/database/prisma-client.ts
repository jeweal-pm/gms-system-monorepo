import { PrismaPg } from "@prisma/adapter-pg";
import { loadDatabaseUrl } from "../config";
import { PrismaClient } from "../generated/prisma/client";

/** Bounded pool (architecture.md "Capacity"): max 5 connections, finite acquire timeout. */
export const PARTNER_POOL = { max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 } as const;

const adapter = new PrismaPg({ connectionString: loadDatabaseUrl(), ...PARTNER_POOL }, { schema: "partner" });
export const prisma = new PrismaClient({ adapter });
