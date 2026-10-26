import { Injectable, Logger } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import { LIST_LIMIT_MAX } from "../common/partner-schemas";
import { WRITE_TX, type Tx } from "../common/persistence";
import { prisma } from "../database/prisma-client";
import type { Currency } from "../generated/prisma/client";
import { CURRENCY_OPTIONS_LIMIT } from "./currency-directory";
import { currencyBaseLocked, currencyChanged, currencyInUse, currencyNotFound, mapCurrencyError } from "./currency.errors";
import type { CreateCurrencyInput, UpdateCurrencyInput } from "./currency.schemas";

const PROFILE_ID = 1;

type Client = Tx | typeof prisma;
type RateFields = { active: boolean; sellingRate: string | null; buyingRate: string | null };
export type CurrencyListQuery = { q?: string; cursor?: string | null; limit?: number };

/** numeric(18,4) → "33.2500"; null stays null (SA-CUR-03). */
function rate(value: { toFixed(digits: number): string } | null): string | null {
  return value === null ? null : value.toFixed(4);
}

const iso = (value: Date) => value.toISOString();

/** SA-CUR-02: the base currency is the Company Profile currency (null before the profile exists). */
async function baseCode(client: Client): Promise<string | null> {
  const profile = await client.companyProfile.findUnique({ where: { id: PROFILE_ID }, select: { currencyCode: true } });
  return profile?.currencyCode ?? null;
}

/**
 * SA-CUR-02/04: the base currency stores no rates and can't be inactive; any other currency needs both
 * rates. Returns the rate columns to write.
 */
function rateData(code: string, base: string | null, input: RateFields) {
  if (code === base) {
    if (!input.active) throw currencyBaseLocked();
    return { sellingRate: null, buyingRate: null };
  }
  const missing: FieldError[] = [];
  if (input.sellingRate === null) missing.push({ path: "sellingRate", code: "required" });
  if (input.buyingRate === null) missing.push({ path: "buyingRate", code: "required" });
  if (missing.length > 0) throw validationException(missing);
  return { sellingRate: input.sellingRate, buyingRate: input.buyingRate };
}

/** GREATEST(now, expected + 1 ms): the optimistic version always moves forward (vendor rule). */
function nextVersion(expected: Date): Date {
  return new Date(Math.max(Date.now(), expected.getTime() + 1));
}

const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

function listItem(row: Pick<Currency, "id" | "code" | "name" | "active" | "sellingRate" | "buyingRate">) {
  return { id: row.id, code: row.code, name: row.name, active: row.active, sellingRate: rate(row.sellingRate), buyingRate: rate(row.buyingRate) };
}

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger("Currency");

  /** SA-CUR-03: keyset on the unique code, ≤ 50 rows per page, `total` of every currency. */
  async list(query: CurrencyListQuery) {
    const limit = Math.min(query.limit ?? LIST_LIMIT_MAX, LIST_LIMIT_MAX);
    const after = query.cursor && /^[A-Z]{3}$/.test(query.cursor) ? query.cursor : null;
    if (query.cursor && !after) throw validationException([{ path: "cursor", code: "invalid" }]);
    const and: object[] = [];
    if (query.q) and.push({ OR: [{ code: contains(query.q) }, { name: contains(query.q) }] });
    if (after) and.push({ code: { gt: after } });
    try {
      const [rows, total, base] = await Promise.all([
        prisma.currency.findMany({
          where: { AND: and },
          select: { id: true, code: true, name: true, active: true, sellingRate: true, buyingRate: true },
          orderBy: { code: "asc" },
          take: limit + 1,
        }),
        prisma.currency.count(),
        baseCode(prisma),
      ]);
      const page = rows.slice(0, limit);
      const last = page[page.length - 1];
      return { items: page.map(listItem), nextCursor: rows.length > limit && last ? last.code : null, total, baseCode: base };
    } catch (error) {
      throw mapCurrencyError(error, "list");
    }
  }

  async get(id: string) {
    try {
      const [row, base] = await Promise.all([prisma.currency.findUnique({ where: { id } }), baseCode(prisma)]);
      if (!row) throw currencyNotFound();
      return {
        ...listItem(row),
        description: row.description,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        baseCode: base,
      };
    } catch (error) {
      throw mapCurrencyError(error, "get");
    }
  }

  async create(actorId: string, input: CreateCurrencyInput) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const rates = rateData(input.code, await baseCode(tx), input);
        const now = new Date();
        return tx.currency.create({
          data: { code: input.code, name: input.name, description: input.description, active: input.active, ...rates, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId },
          select: { id: true, updatedAt: true },
        });
      }, WRITE_TX);
      this.logger.log({ event: "currency.created", actorId, id: created.id, code: input.code });
      return { id: created.id, updatedAt: iso(created.updatedAt) };
    } catch (error) {
      throw mapCurrencyError(error, "create");
    }
  }

  /** Whole replacement with the optimistic version; the code never changes (Q-CUR-04). */
  async update(actorId: string, id: string, input: UpdateCurrencyInput) {
    const expected = new Date(input.expectedUpdatedAt);
    try {
      const updatedAt = await prisma.$transaction(async (tx) => {
        const stored = await tx.currency.findUnique({ where: { id }, select: { code: true } });
        if (!stored) throw currencyNotFound();
        const rates = rateData(stored.code, await baseCode(tx), input);
        const next = nextVersion(expected);
        const result = await tx.currency.updateMany({
          where: { id, updatedAt: expected },
          data: { name: input.name, description: input.description, active: input.active, ...rates, updatedAt: next, updatedBy: actorId },
        });
        if (result.count === 0) throw currencyChanged();
        return next;
      }, WRITE_TX);
      this.logger.log({ event: "currency.updated", actorId, id });
      return { id, updatedAt: iso(updatedAt) };
    } catch (error) {
      throw mapCurrencyError(error, "update");
    }
  }

  /** SA-CUR-06: refused while Company Profile, a vendor or a customer stores the code. */
  async delete(actorId: string, id: string) {
    try {
      await prisma.$transaction(async (tx) => {
        const stored = await tx.currency.findUnique({ where: { id }, select: { code: true } });
        if (!stored) throw currencyNotFound();
        const where = { currencyCode: stored.code };
        const [profile, vendors, customers] = await Promise.all([tx.companyProfile.count({ where }), tx.vendor.count({ where }), tx.customer.count({ where })]);
        if (profile + vendors + customers > 0) throw currencyInUse();
        const { count } = await tx.currency.deleteMany({ where: { id } });
        if (count === 0) throw currencyNotFound();
      }, WRITE_TX);
    } catch (error) {
      throw mapCurrencyError(error, "delete");
    }
    this.logger.log({ event: "currency.deleted", actorId, id });
    return { ok: true as const };
  }

  /** SA-CUR-03: every currency with its rates (≤ 500, by code) for selects that also need a rate (Quotation). */
  async options() {
    try {
      const [rows, base] = await Promise.all([
        prisma.currency.findMany({ select: { code: true, name: true, active: true, sellingRate: true, buyingRate: true }, orderBy: { code: "asc" }, take: CURRENCY_OPTIONS_LIMIT }),
        baseCode(prisma),
      ]);
      return {
        items: rows.map((row) => ({ code: row.code, name: row.name, active: row.active, sellingRate: rate(row.sellingRate), buyingRate: rate(row.buyingRate) })),
        baseCode: base,
      };
    } catch (error) {
      throw mapCurrencyError(error, "options");
    }
  }
}
