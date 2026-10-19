import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { prisma } from "../database/prisma-client";
import { Prisma } from "../generated/prisma/client";
import { decodeCursor, encodeCursor } from "./cursor";
import { partnerException } from "./errors";
import { LIST_LIMIT_MAX, type ListQuery, type PartnerScalarInput } from "./partner-schemas";

/** Write transactions stay below the gateway's 5 s mutation timeout (customer architecture.md §10). */
export const WRITE_TX = { timeout: 4_000, maxWait: 2_000 } as const;
/** List read transaction stays below the gateway's 3 s read timeout. */
export const READ_TX = { timeout: 2_500, maxWait: 2_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } as const;

export type Tx = Prisma.TransactionClient;

/** Scalar columns compared for the `changedFields` log entry (names only, never values). */
export const SCALAR_FIELDS = ["name", "code", "currencyCode", "active", "firstName", "middleName", "lastName", "phoneE164", "phoneCountry", "email"] as const;

const UNAVAILABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"]);

export function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).toISOString();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Keys and email are lowered by PostgreSQL itself so the CHECK constraints always hold (customer D-02). */
export async function normalizedKeys(tx: Tx, input: { name: string; code: string; email: string }) {
  const [row] = await tx.$queryRaw<{ nameKey: string; codeKey: string; email: string }[]>`
    SELECT lower(${input.name}::text) AS "nameKey", lower(${input.code}::text) AS "codeKey", lower(${input.email}::text) AS "email"`;
  return row;
}

/** Column values for the shared scalar fields (same columns on `customer` and `vendor`). */
export async function scalarData(tx: Tx, input: PartnerScalarInput) {
  const keys = await normalizedKeys(tx, input);
  return {
    name: input.name,
    nameKey: keys.nameKey,
    code: input.code,
    codeKey: keys.codeKey,
    currencyCode: input.currencyCode,
    active: input.active,
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    phoneE164: input.phone?.e164 ?? null,
    phoneCountry: input.phone?.country ?? null,
    email: keys.email,
  };
}

type ScalarRecord = {
  id: string; name: string; code: string | null; active: boolean; updatedAt: Date; currencyCode: string;
  firstName: string; middleName: string | null; lastName: string | null; phoneE164: string | null; phoneCountry: string | null; email: string;
};
type AddressRecord = { id: string; position: number; name: string; address: string; countryCode: string; state: string; city: string; postcode: string; isDefault: boolean };

/** Detail scalars in contract order (`id … email`); `phone` is `null` unless both columns are set. */
export function scalarDetail(record: ScalarRecord) {
  return {
    id: record.id,
    name: record.name,
    code: record.code,
    active: record.active,
    updatedAt: record.updatedAt.toISOString(),
    currencyCode: record.currencyCode,
    firstName: record.firstName,
    middleName: record.middleName,
    lastName: record.lastName,
    phone: record.phoneE164 && record.phoneCountry ? { country: record.phoneCountry, e164: record.phoneE164 } : null,
    email: record.email,
  };
}

/** Address output fields in contract order (invoice addresses add `taxId` after these). */
export function addressDetail(address: AddressRecord) {
  return {
    id: address.id,
    position: address.position,
    name: address.name,
    address: address.address,
    countryCode: address.countryCode,
    state: address.state,
    city: address.city,
    postcode: address.postcode,
    isDefault: address.isDefault,
  };
}

type ListRow ={ id: string; name: string; nameKey: string; code: string | null; active: boolean; updatedAt: Date | string };

/** Fixed identifiers only (never user input): the partner tables that support the standard list. */
const LIST_TABLES = {
  customer: Prisma.raw(`"partner"."customer"`),
  vendor: Prisma.raw(`"partner"."vendor"`),
} as const;

/**
 * Standard keyset list (customer D-07, vendor architecture §6): contains-`ILIKE` on name OR code,
 * optional `active`, order `name_key, id`, ≤ 50 items, `total` in one read-only repeatable-read
 * transaction. Persistence errors are passed to `mapError`.
 */
export async function listPage(table: keyof typeof LIST_TABLES, query: ListQuery, mapError: (error: unknown, operation: string) => unknown) {
  const limit = query.limit ?? LIST_LIMIT_MAX;
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const filters: Prisma.Sql[] = [];
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    filters.push(Prisma.sql`("name" ILIKE ${pattern} OR "code" ILIKE ${pattern})`);
  }
  if (query.active) filters.push(Prisma.sql`"active" = ${query.active === "true"}`);
  const where = (parts: Prisma.Sql[]) => (parts.length > 0 ? Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}` : Prisma.empty);
  const pageFilters = cursor ? [...filters, Prisma.sql`("name_key", "id") > (${cursor.nameKey}::text, ${cursor.id}::uuid)`] : filters;
  const from = LIST_TABLES[table];

  try {
    const { rows, total } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const rows = await tx.$queryRaw<ListRow[]>`
        SELECT "id"::text AS "id", "name", "name_key" AS "nameKey", "code", "active", "updated_at" AS "updatedAt"
        FROM ${from} ${where(pageFilters)}
        ORDER BY "name_key" ASC, "id" ASC
        LIMIT ${limit + 1}`;
      const [count] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS "total" FROM ${from} ${where(filters)}`;
      return { rows, total: count.total };
    }, READ_TX);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((row) => ({ id: row.id, name: row.name, code: row.code, active: row.active, updatedAt: toIso(row.updatedAt) })),
      nextCursor: rows.length > limit && last ? encodeCursor({ nameKey: last.nameKey, id: last.id }) : null,
      total,
    };
  } catch (error) {
    throw mapError(error, "list");
  }
}

/** ADR-0021 §2: running-number prefix per partner table. */
export const CODE_PREFIX = { customer: "C", vendor: "V" } as const;
/** Digits (after leading zeros) that still fit a bigint after `+ 1`; longer suffixes are not counted. */
export const MAX_COUNTED_DIGITS = 18;

/** `<prefix>` + the number, zero-padded to at least 3 digits: C001, C999, C1000. */
export function formatPartnerCode(prefix: string, next: string): string {
  if (!/^[1-9][0-9]*$/.test(next)) throw new Error("invalid running number");
  return `${prefix}${next.padStart(3, "0")}`;
}

/**
 * ADR-0021 §2 suggestion (not a reservation): max numeric suffix of codes matching
 * `^[Pp][0-9]+$` (P = prefix, suffix ≤ 18 significant digits) + 1, computed in PostgreSQL as
 * bigint and returned as text; 1 when none match. Read-only; one aggregate over the table.
 */
export async function nextPartnerCode(table: keyof typeof LIST_TABLES, mapError: (error: unknown, operation: string) => unknown) {
  const prefix = CODE_PREFIX[table];
  const pattern = `^[${prefix}${prefix.toLowerCase()}][0-9]+$`;
  try {
    const [row] = await prisma.$queryRaw<{ next: string }[]>`
      SELECT (COALESCE(max(substring("code" FROM 2)::bigint), 0) + 1)::text AS "next"
      FROM ${LIST_TABLES[table]}
      WHERE "code" ~ ${pattern} AND length(ltrim(substring("code" FROM 2), '0')) <= ${MAX_COUNTED_DIGITS}`;
    return { code: formatPartnerCode(prefix, row.next) };
  } catch (error) {
    throw mapError(error, "nextCode");
  }
}

export function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : undefined;
}

/** Index/constraint names only (never values) from a Prisma unique-violation error. */
function violatedTarget(error: unknown): string {
  const meta = (error as { meta?: unknown }).meta;
  try {
    return JSON.stringify(meta ?? {});
  } catch {
    return "";
  }
}

function isPoolTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout exceeded when trying to connect|Connection terminated|Transaction already closed|expired transaction/i.test(error.message);
}

/** Connection, pool, and transaction-timeout failures that map to `503 PARTNER_UNAVAILABLE`. */
export function isPrismaUnavailable(error: unknown): boolean {
  const code = prismaCode(error);
  return (code !== undefined && UNAVAILABLE_CODES.has(code)) || isPoolTimeout(error);
}

type MapperOptions = {
  /** Log event prefix, e.g. `customer` → `customer.invariant_violation`. */
  entity: string;
  /** Logger context, e.g. `Customer`. */
  logContext: string;
  /** Unique-violation targets containing this marker are a taken Code Name (`code_key` column / `<entity>_code_key_key` index). */
  codeKeyMarker: string;
  notFound: () => HttpException;
  codeTaken: () => HttpException;
};

/**
 * Maps Prisma/driver errors explicitly (error-handling.md "Partner implementation rules"):
 * P2002 on the code key → `codeTaken`; other P2002 → 500 + `<entity>.invariant_violation`;
 * P2025 → `notFound`; connection/pool/timeout → 503 + `<entity>.db_unavailable`;
 * anything else (including partner HTTP exceptions) is returned unchanged.
 */
export function persistenceErrorMapper({ entity, logContext, codeKeyMarker, notFound, codeTaken }: MapperOptions) {
  const logger = new Logger(logContext);
  return (error: unknown, operation: string): unknown => {
    const code = prismaCode(error);
    if (code === "P2002") {
      if (violatedTarget(error).includes(codeKeyMarker)) return codeTaken();
      logger.error({ event: `${entity}.invariant_violation`, operation, prismaCode: code });
      return partnerException("INTERNAL_SERVER_ERROR", HttpStatus.INTERNAL_SERVER_ERROR);
    }
    if (code === "P2025") return notFound();
    if (isPrismaUnavailable(error)) {
      logger.warn({ event: `${entity}.db_unavailable`, operation, prismaCode: code ?? "driver" });
      return partnerException("PARTNER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
    return error;
  };
}
