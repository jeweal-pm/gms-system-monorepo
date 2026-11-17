import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * IT-LM-B01…B03 (location-master SA rev 1, ADR-0053) on a disposable PostgreSQL (`PARTNER_TEST_DATABASE_URL`, never
 * the dev database on 5432): the table and its case-insensitive unique name, list paging and search, versions, a
 * concurrent duplicate, and the active names the documents offer.
 */
const testUrl = process.env.PARTNER_TEST_DATABASE_URL;
const canRun = Boolean(testUrl && /^postgresql:\/\/[^/]+@127\.0\.0\.1:(?!5432\/)[0-9]+\/f1_system$/.test(testUrl));
const ACTOR = `lm-it-${randomUUID().slice(0, 8)}`;
const TAG = `LM${randomUUID().slice(0, 6)}`;

type PrismaClient = typeof import("../../src/database/prisma-client").prisma;
type Service = InstanceType<typeof import("../../src/location-master/location-master.service").LocationMasterService>;

let prisma: PrismaClient;
let service: Service;
let activeLocationNames: typeof import("../../src/location-master/location-master.service").activeLocationNames;
let cursorMax: number;

function failure(error: unknown) {
  if (!(error instanceof HttpException)) throw error;
  const body = error.getResponse() as { error: { code: string; fieldErrors?: { path: string; code: string }[] } };
  return { status: error.getStatus(), code: body.error.code, fieldErrors: body.error.fieldErrors };
}
const caught = (promise: Promise<unknown>) => promise.then(() => null, failure);

describe.runIf(canRun)("location master on PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubEnv("PARTNER_DATABASE_URL", testUrl!);
    ({ prisma } = await import("../../src/database/prisma-client"));
    const module = await import("../../src/location-master/location-master.service");
    service = new module.LocationMasterService();
    activeLocationNames = module.activeLocationNames;
    cursorMax = module.LOCATION_CURSOR_MAX;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.location.deleteMany({ where: { name: { startsWith: TAG } } });
      await prisma.$disconnect();
    }
    vi.unstubAllEnvs();
  });

  it("IT-LM-B01 the table refuses a padded or long name and a second spelling of a name (unique lower(name))", async () => {
    const base = { createdBy: ACTOR, updatedBy: ACTOR };
    await prisma.location.create({ data: { name: `${TAG} Vault`, ...base } });
    await expect(prisma.location.create({ data: { name: `${TAG} VAULT`, ...base } })).rejects.toThrow();
    await expect(prisma.location.create({ data: { name: ` ${TAG} padded`, ...base } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`INSERT INTO partner.location (id, name, created_by, updated_by) VALUES (gen_random_uuid(), '${"x".repeat(41)}', 'it', 'it')`)).rejects.toThrow();
  });

  it("IT-LM-B02 create / read / list (search, paging) / update / delete with versions; duplicates answer NAME_TAKEN", async () => {
    const created = await service.create(ACTOR, { name: `${TAG} Safe A`, active: true });
    for (const name of ["Safe B", "Safe C", "Shelf 1"]) await service.create(ACTOR, { name: `${TAG} ${name}`, active: true });
    expect(await caught(service.create(ACTOR, { name: `${TAG.toLowerCase()} safe a`, active: true }))).toMatchObject({ status: 409, code: "LOCATION_NAME_TAKEN", fieldErrors: [{ path: "name", code: "duplicate" }] });

    const first = await service.list({ q: `${TAG} Saf`, limit: 2 });
    expect(first.items.map((item) => item.name)).toEqual([`${TAG} Safe A`, `${TAG} Safe B`]);
    expect(first.nextCursor).not.toBeNull();
    const second = await service.list({ q: `${TAG} Saf`, limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((item) => item.name)).toEqual([`${TAG} Safe C`]);
    expect(second.nextCursor).toBeNull();

    const read = await service.get(created.id);
    expect(read).toMatchObject({ name: `${TAG} Safe A`, active: true, updatedAt: created.updatedAt });
    const updated = await service.update(ACTOR, created.id, { name: `${TAG} Safe A1`, active: false, expectedUpdatedAt: created.updatedAt });
    expect(await caught(service.update(ACTOR, created.id, { name: `${TAG} Safe A2`, active: false, expectedUpdatedAt: created.updatedAt }))).toMatchObject({ status: 409, code: "LOCATION_CHANGED" });
    expect(await caught(service.update(ACTOR, created.id, { name: `${TAG} SAFE B`, active: false, expectedUpdatedAt: updated.updatedAt }))).toMatchObject({ code: "LOCATION_NAME_TAKEN" });
    expect((await service.list({ q: TAG, active: "false" })).items.map((item) => item.name)).toEqual([`${TAG} Safe A1`]);

    expect(await caught(service.delete(ACTOR, created.id, created.updatedAt))).toMatchObject({ code: "LOCATION_CHANGED" });
    await service.delete(ACTOR, created.id, updated.updatedAt);
    expect(await caught(service.get(created.id))).toMatchObject({ status: 404, code: "LOCATION_NOT_FOUND" });
  });

  it("IT-LM-B02 `%` / `_` are plain characters for the duplicate check; a renamed row keeps its own name", async () => {
    const percent = await service.create(ACTOR, { name: `${TAG} 1%`, active: true });
    await service.create(ACTOR, { name: `${TAG} A_B`, active: true });
    // ILIKE would read `_` / `%` as wildcards and refuse these (security-auditor 2026-11-16).
    const axb = await service.create(ACTOR, { name: `${TAG} AXB`, active: true });
    const twelve = await service.create(ACTOR, { name: `${TAG} 12`, active: true });
    expect((await service.get(axb.id)).name).toBe(`${TAG} AXB`);
    expect((await service.get(twelve.id)).name).toBe(`${TAG} 12`);
    expect(await caught(service.create(ACTOR, { name: `${TAG.toLowerCase()} a_b`, active: true }))).toMatchObject({ code: "LOCATION_NAME_TAKEN" });
    await service.update(ACTOR, percent.id, { name: `${TAG} 1%`, active: false, expectedUpdatedAt: percent.updatedAt });
    expect((await service.get(percent.id)).active).toBe(false);
  });

  it("IT-LM-B02 a 40-character Thai name still pages (the cursor fits LOCATION_CURSOR_MAX)", async () => {
    const prefix = `${TAG}T`;
    const thai = (letter: string) => `${prefix}${letter.repeat(40 - prefix.length)}`;
    for (const letter of ["ก", "ข", "ค"]) await service.create(ACTOR, { name: thai(letter), active: true });
    const first = await service.list({ q: prefix, limit: 1 });
    expect(first.nextCursor!.length).toBeGreaterThan(200);
    expect(first.nextCursor!.length).toBeLessThanOrEqual(cursorMax);
    const second = await service.list({ q: prefix, limit: 1, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.name).not.toBe(first.items[0]!.name);
  });

  it("IT-LM-B02 two concurrent creates of one name: exactly one wins", async () => {
    const results = await Promise.allSettled([1, 2, 3].map(() => service.create(ACTOR, { name: `${TAG} Race`, active: true })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(failure(result.reason)).toMatchObject({ code: "LOCATION_NAME_TAKEN" });
  });

  it("IT-LM-B03 the documents' options list active names only, sorted", async () => {
    await service.create(ACTOR, { name: `${TAG} Zeta`, active: true });
    await service.create(ACTOR, { name: `${TAG} Alpha off`, active: false });
    const names = (await activeLocationNames()).filter((name) => name.startsWith(TAG));
    expect(names).toEqual([...names].sort());
    expect(names).toContain(`${TAG} Zeta`);
    expect(names).not.toContain(`${TAG} Alpha off`);
  });
});
