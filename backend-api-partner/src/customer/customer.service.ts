import { Injectable, Logger } from "@nestjs/common";
import { validationException, type FieldError } from "../common/errors";
import { prisma } from "../database/prisma-client";
import { AddressType, Prisma } from "../generated/prisma/client";
import { decodeCursor, encodeCursor } from "./cursor";
import { customerNotFound, customerStale, mapPersistenceError } from "./customer.errors";
import { LIST_LIMIT_MAX, type CustomerInput, type ListQuery, type UpdateCustomerInput } from "./customer.schemas";
import { COUNTRY_CODES, CURRENCY_CODES, OPTIONS_RESPONSE } from "./reference-data";

/** Write transactions stay below the gateway's 5 s mutation timeout (architecture.md §10). */
const WRITE_TX = { timeout: 4_000, maxWait: 2_000 } as const;
/** List read transaction stays below the gateway's 3 s read timeout. */
const READ_TX = { timeout: 2_500, maxWait: 2_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead } as const;

type Tx = Prisma.TransactionClient;
type AddressInput = CustomerInput["invoiceAddresses"][number] | CustomerInput["shippingAddresses"][number];
type ListRow = { id: string; name: string; nameKey: string; code: string | null; active: boolean; updatedAt: Date | string };

const SCALAR_FIELDS = ["name", "code", "currencyCode", "active", "firstName", "middleName", "lastName", "phoneE164", "phoneCountry", "email"] as const;

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized).toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Server-derived type/position; first entry becomes default when none is marked (architecture.md §7). */
function addressRows(type: AddressType, addresses: AddressInput[]) {
  const hasDefault = addresses.some((address) => address.isDefault);
  return addresses.map((address, index) => ({
    type,
    position: index + 1,
    name: address.name,
    taxId: type === AddressType.INVOICE && "taxId" in address ? address.taxId : null,
    address: address.address,
    countryCode: address.countryCode,
    state: address.state,
    city: address.city,
    postcode: address.postcode,
    isDefault: hasDefault ? address.isDefault : index === 0,
  }));
}

function allAddressRows(input: CustomerInput) {
  return [...addressRows(AddressType.INVOICE, input.invoiceAddresses), ...addressRows(AddressType.SHIPPING, input.shippingAddresses)];
}

/** D-09: membership in the runtime lists, or equal to a value already stored on this customer. */
function membershipErrors(input: CustomerInput, stored?: { currencyCode: string; countryCodes: Set<string> }): FieldError[] {
  const errors: FieldError[] = [];
  if (!CURRENCY_CODES.has(input.currencyCode) && input.currencyCode !== stored?.currencyCode) errors.push({ path: "currencyCode", code: "unknown" });
  const check = (list: AddressInput[], field: string) => list.forEach((address, index) => {
    if (!COUNTRY_CODES.has(address.countryCode) && !stored?.countryCodes.has(address.countryCode)) errors.push({ path: `${field}.${index}.countryCode`, code: "unknown" });
  });
  check(input.invoiceAddresses, "invoiceAddresses");
  check(input.shippingAddresses, "shippingAddresses");
  return errors;
}

/** Keys and email are lowered by PostgreSQL itself so the CHECK constraints always hold (D-02). */
async function normalizedKeys(tx: Tx, input: CustomerInput) {
  const [row] = await tx.$queryRaw<{ nameKey: string; codeKey: string | null; email: string }[]>`
    SELECT lower(${input.name}::text) AS "nameKey", lower(${input.code}::text) AS "codeKey", lower(${input.email}::text) AS "email"`;
  return row;
}

async function scalarData(tx: Tx, input: CustomerInput) {
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

function customerInput(input: UpdateCustomerInput): CustomerInput {
  const { expectedUpdatedAt: _expected, ...fields } = input;
  return fields;
}

@Injectable()
export class CustomerService {
  private readonly logger = new Logger("Customer");

  options() {
    return OPTIONS_RESPONSE;
  }

  async list(query: ListQuery) {
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

    try {
      const { rows, total } = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const rows = await tx.$queryRaw<ListRow[]>`
          SELECT "id"::text AS "id", "name", "name_key" AS "nameKey", "code", "active", "updated_at" AS "updatedAt"
          FROM "partner"."customer" ${where(pageFilters)}
          ORDER BY "name_key" ASC, "id" ASC
          LIMIT ${limit + 1}`;
        const [count] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS "total" FROM "partner"."customer" ${where(filters)}`;
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
      throw mapPersistenceError(error, "list");
    }
  }

  async get(id: string) {
    let customer;
    try {
      customer = await prisma.customer.findUnique({
        where: { id },
        include: { addresses: { orderBy: [{ type: "asc" }, { position: "asc" }] } },
      });
    } catch (error) {
      throw mapPersistenceError(error, "get");
    }
    if (!customer) throw customerNotFound();
    const toAddress = (address: (typeof customer.addresses)[number]) => ({
      id: address.id,
      position: address.position,
      name: address.name,
      address: address.address,
      countryCode: address.countryCode,
      state: address.state,
      city: address.city,
      postcode: address.postcode,
      isDefault: address.isDefault,
    });
    return {
      id: customer.id,
      name: customer.name,
      code: customer.code,
      active: customer.active,
      updatedAt: customer.updatedAt.toISOString(),
      currencyCode: customer.currencyCode,
      firstName: customer.firstName,
      middleName: customer.middleName,
      lastName: customer.lastName,
      phone: customer.phoneE164 && customer.phoneCountry ? { country: customer.phoneCountry, e164: customer.phoneE164 } : null,
      email: customer.email,
      invoiceAddresses: customer.addresses.filter((a) => a.type === AddressType.INVOICE).map((a) => ({ ...toAddress(a), taxId: a.taxId })),
      shippingAddresses: customer.addresses.filter((a) => a.type === AddressType.SHIPPING).map(toAddress),
      createdAt: customer.createdAt.toISOString(),
    };
  }

  async create(actorId: string, input: CustomerInput) {
    const invalid = membershipErrors(input);
    if (invalid.length > 0) throw validationException(invalid);
    try {
      const created = await prisma.$transaction(async (tx) => {
        const now = new Date();
        return tx.customer.create({
          data: { ...(await scalarData(tx, input)), createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId, addresses: { create: allAddressRows(input) } },
          select: { id: true, updatedAt: true },
        });
      }, WRITE_TX);
      this.logger.log({
        event: "customer.created", actorId, customerId: created.id,
        invoiceAddressCount: input.invoiceAddresses.length, shippingAddressCount: input.shippingAddresses.length,
      });
      return { id: created.id, updatedAt: created.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "create");
    }
  }

  /** Whole replacement with optimistic version (D-05, sequence 4). */
  async update(actorId: string, id: string, body: UpdateCustomerInput) {
    const input = customerInput(body);
    const expected = new Date(body.expectedUpdatedAt);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const stored = await tx.customer.findUnique({ where: { id }, include: { addresses: { select: { countryCode: true } } } });
        if (!stored) throw customerNotFound();
        const invalid = membershipErrors(input, { currencyCode: stored.currencyCode, countryCodes: new Set(stored.addresses.map((a) => a.countryCode)) });
        if (invalid.length > 0) throw validationException(invalid);

        const data = await scalarData(tx, input);
        // GREATEST(now, expected + 1 ms): the version always moves forward.
        const next = new Date(Math.max(Date.now(), expected.getTime() + 1));
        const updated = await tx.customer.updateMany({ where: { id, updatedAt: expected }, data: { ...data, updatedAt: next, updatedBy: actorId } });
        if (updated.count === 0) {
          const exists = await tx.customer.count({ where: { id } });
          throw exists === 0 ? customerNotFound() : customerStale();
        }
        await tx.customerAddress.deleteMany({ where: { customerId: id } });
        await tx.customerAddress.createMany({ data: allAddressRows(input).map((row) => ({ ...row, customerId: id })) });
        const changedFields = SCALAR_FIELDS.filter((field) => stored[field] !== data[field]);
        return { updatedAt: next, changedFields };
      }, WRITE_TX);
      this.logger.log({
        event: "customer.updated", actorId, customerId: id, changedFields: result.changedFields, addressesReplaced: true,
        invoiceAddressCount: input.invoiceAddresses.length, shippingAddressCount: input.shippingAddresses.length,
      });
      return { id, updatedAt: result.updatedAt.toISOString() };
    } catch (error) {
      throw mapPersistenceError(error, "update");
    }
  }

  /** Hard delete; addresses cascade (D-06). Repeat delete returns 404. */
  async delete(actorId: string, id: string) {
    let count: number;
    try {
      ({ count } = await prisma.customer.deleteMany({ where: { id } }));
    } catch (error) {
      throw mapPersistenceError(error, "delete");
    }
    if (count === 0) throw customerNotFound();
    this.logger.log({ event: "customer.deleted", actorId, customerId: id });
    return { ok: true as const };
  }
}
