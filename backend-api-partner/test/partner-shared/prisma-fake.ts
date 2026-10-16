import { randomUUID } from "node:crypto";
import { vi } from "vitest";

/**
 * In-memory stand-in for the partner Prisma client used by the customer/vendor service tests
 * (same boundary as `test/company-profile/company-profile.service.test.ts`: `src/database/prisma-client`
 * is replaced; SQL, CHECKs and indexes are covered by the opt-in live tests). Transactions roll the
 * tables back when the callback throws, like PostgreSQL would.
 *
 * Usage in a test file (hoisted):
 *   vi.mock("../../src/database/prisma-client", async () => (await import("../partner-shared/prisma-fake")).prismaModule);
 */

export type Entity = "customer" | "vendor";
export type FakeAddress = Record<string, unknown> & { id: string; position: number; isDefault: boolean; countryCode: string; type?: string };
export type FakeRow = Record<string, unknown> & {
  id: string; code: string; codeKey: string; currencyCode: string; updatedAt: Date; createdAt: Date; addresses: FakeAddress[];
};
export type RawCall = { text: string; strings: readonly string[]; values: unknown[] };

export const fake = {
  tables: { customer: new Map<string, FakeRow>(), vendor: new Map<string, FakeRow>() },
  /** Thrown by the next Prisma call while set (simulates driver/Prisma failures). */
  failWith: null as unknown,
  /** Every `$queryRaw` call (template text joined with `?`, values kept for assertions). */
  raw: [] as RawCall[],
  executed: [] as string[],
  transactionOptions: [] as unknown[],
  /** Rows returned by the list `SELECT` and the `count(*)` total. */
  listRows: [] as Record<string, unknown>[],
  total: 0,
  /** `next` returned by the next-code aggregate (text, as PostgreSQL returns it). */
  nextValue: "1",
};

export function resetFake() {
  fake.tables.customer.clear();
  fake.tables.vendor.clear();
  fake.failWith = null;
  fake.raw = [];
  fake.executed = [];
  fake.transactionOptions = [];
  fake.listRows = [];
  fake.total = 0;
  fake.nextValue = "1";
}

/** Prisma-shaped error (only `code` and `meta` are read by the mapper). */
export function prismaError(code: string, meta?: unknown) {
  return Object.assign(new Error(`prisma ${code}`), { code, ...(meta === undefined ? {} : { meta }) });
}

function guard() {
  if (fake.failWith) throw fake.failWith;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sortAddresses(addresses: FakeAddress[]) {
  return [...addresses].sort((a, b) => String(a.type ?? "").localeCompare(String(b.type ?? "")) || a.position - b.position);
}

function uniqueCode(entity: Entity, codeKey: string, exceptId?: string) {
  for (const row of fake.tables[entity].values()) {
    if (row.codeKey === codeKey && row.id !== exceptId) {
      throw prismaError("P2002", { modelName: entity, driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: `${entity}_code_key_key` } } } });
    }
  }
}

function rawQuery(strings: readonly string[], ...values: unknown[]) {
  guard();
  const text = strings.join("?");
  fake.raw.push({ text, strings, values });
  if (text.includes("lower(")) {
    const [name, code, email] = values.map((value) => String(value).toLowerCase());
    return Promise.resolve([{ nameKey: name, codeKey: code, email }]);
  }
  if (text.includes("COALESCE(max")) return Promise.resolve([{ next: fake.nextValue }]);
  if (text.includes("count(*)")) return Promise.resolve([{ total: fake.total }]);
  if (text.includes('AS "nameKey"')) return Promise.resolve(clone(fake.listRows));
  throw new Error(`unexpected raw query: ${text}`);
}

function entityModel(entity: Entity) {
  const table = () => fake.tables[entity];
  return {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      guard();
      const row = table().get(where.id);
      return row ? clone({ ...row, addresses: sortAddresses(row.addresses) }) : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> & { addresses: { create: Record<string, unknown>[] } } }) => {
      guard();
      const { addresses, ...scalars } = data;
      uniqueCode(entity, String(scalars.codeKey));
      const id = randomUUID();
      const row = { ...clone(scalars), id, addresses: addresses.create.map((address) => ({ ...clone(address), id: randomUUID() })) } as FakeRow;
      table().set(id, row);
      return { id, updatedAt: row.updatedAt };
    }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; updatedAt: Date }; data: Record<string, unknown> }) => {
      guard();
      const row = table().get(where.id);
      if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      uniqueCode(entity, String(data.codeKey), row.id);
      Object.assign(row, clone(data));
      return { count: 1 };
    }),
    count: vi.fn(async ({ where }: { where: { id: string } }) => {
      guard();
      return table().has(where.id) ? 1 : 0;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
      guard();
      return { count: table().delete(where.id) ? 1 : 0 };
    }),
  };
}

function addressModel(entity: Entity) {
  const key = `${entity}Id`;
  return {
    deleteMany: vi.fn(async ({ where }: { where: Record<string, string> }) => {
      guard();
      const row = fake.tables[entity].get(where[key]);
      const count = row?.addresses.length ?? 0;
      if (row) row.addresses = [];
      return { count };
    }),
    createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
      guard();
      for (const entry of data) {
        const { [key]: ownerId, ...address } = entry;
        fake.tables[entity].get(String(ownerId))?.addresses.push({ ...clone(address), id: randomUUID() } as FakeAddress);
      }
      return { count: data.length };
    }),
  };
}

const client = {
  $queryRaw: vi.fn(rawQuery),
  $executeRaw: vi.fn(async (strings: readonly string[]) => {
    guard();
    fake.executed.push(strings.join("?"));
    return 0;
  }),
  customer: entityModel("customer"),
  vendor: entityModel("vendor"),
  customerAddress: addressModel("customer"),
  vendorAddress: addressModel("vendor"),
};

export const prisma = {
  ...client,
  $transaction: vi.fn(async (callback: (tx: typeof client) => Promise<unknown>, options?: unknown) => {
    guard();
    fake.transactionOptions.push(options);
    const snapshot = { customer: clone(fake.tables.customer), vendor: clone(fake.tables.vendor) };
    try {
      return await callback(client);
    } catch (error) {
      fake.tables.customer = snapshot.customer;
      fake.tables.vendor = snapshot.vendor;
      throw error;
    }
  }),
};

export const prismaModule = { prisma, PARTNER_POOL: { max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 } };

/** Seeds a stored row directly (bypassing the service) and returns it. */
export function seedRow(entity: Entity, overrides: Partial<FakeRow> = {}): FakeRow {
  const id = overrides.id ?? randomUUID();
  const row: FakeRow = {
    id,
    name: "Seed",
    nameKey: "seed",
    code: "S-1",
    codeKey: "s-1",
    currencyCode: "THB",
    active: true,
    firstName: "Seed",
    middleName: null,
    lastName: null,
    phoneE164: null,
    phoneCountry: null,
    email: "seed@example.com",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    createdBy: "seed",
    updatedBy: "seed",
    addresses: [],
    ...overrides,
  };
  fake.tables[entity].set(id, row);
  return row;
}
