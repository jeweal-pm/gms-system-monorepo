import { HttpException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PART_ORDER } from "../../src/stone-master/stone-code";
// Static import is fine: vi.mock calls are hoisted above it (no top-level await; the tsconfig is CommonJS).
import { StoneMasterService } from "../../src/stone-master/stone-master.service";

/**
 * UT-SM-P10…P19: StoneMasterService rules against a mocked Prisma (references, size-in-shape, auto
 * code, version conflict, in use, options). Real SQL is covered by the live gateway checks in the TODO.
 */

const db = vi.hoisted(() => {
  type Ref = { code: string; active: boolean };
  const table = () => new Map<string, Ref>();
  return {
    refs: {
      stoneGroup: table(), stoneSize: table(), stoneShape: table(), stoneColor: table(), stoneCutting: table(), stoneClarity: table(), stoneQuality: table(), stoneName: table(),
    } as Record<string, Map<string, Ref>>,
    shapeSizes: new Set<string>(),
    storedStoneCode: null as Record<string, unknown> | null,
    storedGroupId: null as string | null,
    updateCount: 1,
    existsCount: 1,
    deleteError: null as unknown,
    created: [] as Array<{ model: string; data: Record<string, unknown> }>,
    updated: [] as Array<{ model: string; data: Record<string, unknown> }>,
    findManyArgs: [] as unknown[],
  };
});

vi.mock("../../src/database/prisma-client", () => {
  const refDelegate = (model: string) => ({
    // A size has no code (owner 2026-10-23): its name is the seeded code value.
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const ref = db.refs[model].get(where.id);
      return ref ? { name: ref.code, ...ref } : null;
    }),
    findMany: vi.fn(async (args: { where?: { id?: { in: string[] } } }) => {
      db.findManyArgs.push(args);
      const ids = args.where?.id?.in;
      if (ids) return ids.filter((id) => db.refs[model].has(id)).map((id) => ({ id, active: db.refs[model].get(id)!.active }));
      return [...db.refs[model].entries()].map(([id, ref]) => ({ id, code: ref.code, name: ref.code, active: ref.active, sizes: [{ sizeId: "s" }] }));
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      db.created.push({ model, data });
      return { id: "00000000-0000-4000-8000-0000000000aa", updatedAt: new Date("2026-10-19T00:00:00.000Z") };
    }),
    updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
      db.updated.push({ model, data: args.data });
      return { count: db.updateCount };
    }),
    count: vi.fn(async () => db.existsCount),
    deleteMany: vi.fn(async () => {
      if (db.deleteError) throw db.deleteError;
      return { count: 1 };
    }),
  });
  const tx = {
    stoneGroup: refDelegate("stoneGroup"),
    stoneSize: refDelegate("stoneSize"),
    stoneShape: refDelegate("stoneShape"),
    stoneColor: refDelegate("stoneColor"),
    stoneCutting: refDelegate("stoneCutting"),
    stoneClarity: refDelegate("stoneClarity"),
    stoneQuality: refDelegate("stoneQuality"),
    stoneName: { ...refDelegate("stoneName"), findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
      if (select && "groupId" in select && !("code" in select)) return db.storedGroupId ? { groupId: db.storedGroupId } : null;
      return db.refs.stoneName.get(where.id) ?? null;
    }) },
    stoneCode: { ...refDelegate("stoneCode"), findUnique: vi.fn(async () => db.storedStoneCode) },
    stoneShapeSize: {
      findUnique: vi.fn(async ({ where }: { where: { shapeId_sizeId: { shapeId: string; sizeId: string } } }) =>
        (db.shapeSizes.has(`${where.shapeId_sizeId.shapeId}:${where.shapeId_sizeId.sizeId}`) ? {} : null)),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma: { ...tx, $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) } };
});


const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [NAME, SIZE, SHAPE, COLOR, CUT, CLARITY, GROUP] = [1, 2, 3, 4, 5, 6, 7].map(id);
const EXPECTED = "2026-10-19T00:00:00.000Z";

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      const body = error.getResponse() as { error: { code: string; fieldErrors?: Array<{ path: string }> } };
      return { status: error.getStatus(), code: body.error.code, path: body.error.fieldErrors?.[0]?.path };
    }
    throw error;
  }
  throw new Error("expected failure");
}

function seed() {
  for (const map of Object.values(db.refs)) map.clear();
  db.refs.stoneName.set(NAME, { code: "RD", active: true });
  db.refs.stoneSize.set(SIZE, { code: "1.0", active: true });
  db.refs.stoneShape.set(SHAPE, { code: "RD", active: true });
  db.refs.stoneColor.set(COLOR, { code: "D", active: true });
  db.refs.stoneCutting.set(CUT, { code: "EX", active: true });
  db.refs.stoneClarity.set(CLARITY, { code: "VVS1", active: true });
  db.refs.stoneGroup.set(GROUP, { code: "DIA", active: true });
  db.shapeSizes.clear();
  db.shapeSizes.add(`${SHAPE}:${SIZE}`);
}

const parts = { stoneNameId: NAME, sizeId: SIZE, shapeId: SHAPE, colorId: COLOR, cuttingId: CUT, clarityId: CLARITY, qualityId: null };

beforeEach(() => {
  seed();
  db.storedStoneCode = null;
  db.storedGroupId = null;
  db.updateCount = 1;
  db.existsCount = 1;
  db.deleteError = null;
  db.created = [];
  db.updated = [];
  db.findManyArgs = [];
});

describe("stone code", () => {
  it("UT-SM-P10 AUTO builds RD1.0-RDDEXVVS1 from the part codes in order", async () => {
    await new StoneMasterService().create("stone-code", "actor", { mode: "AUTO", code: undefined, parts, partOrder: [...DEFAULT_PART_ORDER], active: true });
    expect(db.created[0].data).toMatchObject({ code: "RD1.0-RDDEXVVS1", mode: "AUTO", stoneNameId: NAME, createdBy: "actor" });
  });

  it("UT-SM-P11 MANUAL keeps the client code", async () => {
    await new StoneMasterService().create("stone-code", "actor", { mode: "MANUAL", code: "SAP-BLUE-2MM", parts, partOrder: [...DEFAULT_PART_ORDER], active: true });
    expect(db.created[0].data.code).toBe("SAP-BLUE-2MM");
  });

  it("UT-SM-P12 a size not available on the shape is rejected", async () => {
    db.shapeSizes.clear();
    expect(await failure(new StoneMasterService().create("stone-code", "a", { mode: "AUTO", code: undefined, parts, partOrder: [...DEFAULT_PART_ORDER], active: true })))
      .toEqual({ status: 422, code: "STONE_MASTER_REFERENCE_INVALID", path: "parts.sizeId" });
  });

  it("UT-SM-P13 a newly chosen inactive part is rejected; an unchanged stored inactive part may stay", async () => {
    db.refs.stoneColor.set(COLOR, { code: "D", active: false });
    const body = { mode: "AUTO" as const, code: undefined, parts, partOrder: [...DEFAULT_PART_ORDER], active: true };
    expect(await failure(new StoneMasterService().create("stone-code", "a", body))).toMatchObject({ code: "STONE_MASTER_REFERENCE_INVALID", path: "parts.colorId" });

    db.storedStoneCode = { ...parts };
    await expect(new StoneMasterService().update("stone-code", "a", id(99), { ...body, expectedUpdatedAt: EXPECTED })).resolves.toMatchObject({ id: id(99) });
  });

  it("UT-SM-P14 an auto code longer than 60 characters is a validation error", async () => {
    for (const map of [db.refs.stoneName, db.refs.stoneShape, db.refs.stoneColor, db.refs.stoneCutting, db.refs.stoneClarity, db.refs.stoneSize]) {
      for (const [key, ref] of map) map.set(key, { ...ref, code: "X".repeat(20) });
    }
    expect(await failure(new StoneMasterService().create("stone-code", "a", { mode: "AUTO", code: undefined, parts, partOrder: [...DEFAULT_PART_ORDER], active: true })))
      .toMatchObject({ status: 400, code: "VALIDATION_ERROR", path: "code" });
  });
});

describe("optional parts (owner 2026-10-20)", () => {
  it("UT-SM-P20 only the top two parts set: the code uses them; a size without a shape is rejected", async () => {
    const order = ["clarity", "cutting", "name", "size", "shape", "color", "quality"] as typeof DEFAULT_PART_ORDER[number][];
    const empty = { stoneNameId: null, sizeId: null, shapeId: null, colorId: null, qualityId: null };
    await new StoneMasterService().create("stone-code", "a", { mode: "AUTO", code: undefined, parts: { ...empty, cuttingId: CUT, clarityId: CLARITY }, partOrder: order, active: true });
    expect(db.created[0].data).toMatchObject({ code: "VVS1EX", stoneNameId: null, shapeId: null });
    expect(await failure(new StoneMasterService().create("stone-code", "a", { mode: "AUTO", code: undefined, parts: { ...empty, cuttingId: CUT, clarityId: CLARITY, sizeId: SIZE }, partOrder: order, active: true })))
      .toMatchObject({ code: "STONE_MASTER_REFERENCE_INVALID", path: "parts.sizeId" });
  });
});

describe("references and versions", () => {
  it("UT-SM-P15 stone name needs an active group; the stored inactive group may stay on update", async () => {
    db.refs.stoneGroup.set(GROUP, { code: "DIA", active: false });
    const body = { code: "RUB", name: "Ruby", groupId: GROUP, hsn: null, active: true };
    expect(await failure(new StoneMasterService().create("stone-name", "a", body))).toMatchObject({ code: "STONE_MASTER_REFERENCE_INVALID", path: "groupId" });
    db.storedGroupId = GROUP;
    await expect(new StoneMasterService().update("stone-name", "a", id(50), { ...body, expectedUpdatedAt: EXPECTED })).resolves.toMatchObject({ id: id(50) });
  });

  it("UT-SM-P16 shape sizes must exist and be active", async () => {
    db.refs.stoneSize.set(SIZE, { code: "1.0", active: false });
    expect(await failure(new StoneMasterService().create("shape", "a", { code: "RD", name: "Round", sizeIds: [SIZE], active: true })))
      .toMatchObject({ code: "STONE_MASTER_REFERENCE_INVALID", path: "sizeIds" });
    expect(await failure(new StoneMasterService().create("shape", "a", { code: "RD", name: "Round", sizeIds: [id(404)], active: true })))
      .toMatchObject({ code: "STONE_MASTER_REFERENCE_INVALID", path: "sizeIds" });
  });

  it("UT-SM-P17 a stale version is STONE_MASTER_CHANGED; a missing row is STONE_MASTER_NOT_FOUND", async () => {
    db.updateCount = 0;
    const body = { code: "DIA", name: "Diamond", active: true, expectedUpdatedAt: EXPECTED };
    expect(await failure(new StoneMasterService().update("group", "a", GROUP, body))).toMatchObject({ status: 409, code: "STONE_MASTER_CHANGED" });
    db.existsCount = 0;
    expect(await failure(new StoneMasterService().update("group", "a", GROUP, body))).toMatchObject({ status: 404, code: "STONE_MASTER_NOT_FOUND" });
  });

  it("UT-SM-P18 deleting a referenced row is STONE_MASTER_IN_USE", async () => {
    db.deleteError = Object.assign(new Error("fk"), { code: "P2003" });
    expect(await failure(new StoneMasterService().delete("group", "a", GROUP))).toMatchObject({ status: 409, code: "STONE_MASTER_IN_USE" });
  });

  it("UT-SM-P19 options: active only unless included; shapes carry sizeIds", async () => {
    const result = await new StoneMasterService().options({ kinds: ["group", "shape"], include: [] });
    expect(Object.keys(result)).toEqual(["group", "shape"]);
    expect((result.shape as Array<{ sizeIds: string[] }>)[0].sizeIds).toEqual(["s"]);
    expect(db.findManyArgs[0]).toMatchObject({ where: { active: true }, take: 1000 });
    await new StoneMasterService().options({ kinds: ["group"], include: [GROUP] });
    expect(db.findManyArgs[2]).toMatchObject({ where: { OR: [{ active: true }, { id: { in: [GROUP] } }] } });
  });
});

describe("size name only and saved auto codes (owner 2026-10-23)", () => {
  const body = { mode: "AUTO" as const, code: undefined, parts, partOrder: [...DEFAULT_PART_ORDER], active: true };
  const versioned = (input: object) => ({ ...input, expectedUpdatedAt: EXPECTED });

  it("UT-SM-P21 the size part of an auto code is the size name, uppercased without spaces", async () => {
    db.refs.stoneSize.set(SIZE, { code: "2.0 mm", active: true });
    await new StoneMasterService().create("stone-code", "a", body);
    expect(db.created[0].data.code).toBe("RD2.0MM-RDDEXVVS1");
  });

  it("UT-SM-P22 saving an edit rebuilds the auto code from the current part codes, even with the same parts", async () => {
    db.refs.stoneColor.set(COLOR, { code: "GRL", active: true });
    db.storedStoneCode = { ...parts };
    await new StoneMasterService().update("stone-code", "a", id(99), versioned({ ...body, active: false }));
    expect(db.updated[0].data).toMatchObject({ code: "RD1.0-RDGRLEXVVS1", active: false });

    const reordered = ["color", "name", "size", "shape", "cutting", "clarity", "quality"] as typeof DEFAULT_PART_ORDER[number][];
    await new StoneMasterService().update("stone-code", "a", id(99), versioned({ ...body, partOrder: reordered }));
    expect(db.updated[1].data.code).toBe("GRLRD-1.0RDEXVVS1");
  });

  it("UT-SM-P23 sizes list, search, cursor and options use the name, never a code", async () => {
    await new StoneMasterService().list("size", { q: "mm", limit: 10 });
    const listArgs = db.findManyArgs[0] as { select: unknown; orderBy: unknown; where: { AND: unknown[] } };
    expect(listArgs.select).toEqual({ id: true, name: true, active: true });
    expect(listArgs.orderBy).toEqual([{ name: "asc" }, { id: "asc" }]);
    expect(listArgs.where.AND).toEqual([{ OR: [{ name: { contains: "mm", mode: "insensitive" } }] }]);

    await new StoneMasterService().options({ kinds: ["size"], include: [] });
    expect(db.findManyArgs[1]).toMatchObject({ select: { id: true, name: true, active: true }, orderBy: { name: "asc" } });

    const cursor = Buffer.from(JSON.stringify({ c: "2.0 mm", i: SIZE, v: 1 })).toString("base64url");
    await new StoneMasterService().list("size", { cursor, limit: 10 });
    expect((db.findManyArgs[2] as { where: { AND: unknown[] } }).where.AND).toEqual([{ OR: [{ name: { gt: "2.0 mm" } }, { name: "2.0 mm", id: { gt: SIZE } }] }]);
  });
});
