import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeError } from "../../src/trpc/domain-error";
import { callPartner } from "../../src/trpc/partner-client";
import { appRouter, type TrpcContext } from "../../src/trpc/router";
import { STONE_INPUTS, STONE_OUTPUTS, stoneOptionsInputSchema } from "../../src/trpc/stone-master-schemas";

/** UT-SM-G01…G08: `stoneMaster.*` procedures (SA-SM-02/04/05/10). Partner is mocked. */

vi.mock("../../src/trpc/partner-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/trpc/partner-client")>()),
  callPartner: vi.fn(),
}));

function caller(permissions: string[], superAdmin = false) {
  const ctx: TrpcContext = {
    session: { user: { id: "user-1", username: "admin", email: "x@users.invalid", name: "Admin" } },
    license: { state: "VALID" },
    authz: { isSuperAdmin: superAdmin, permissions },
    cookie: "session=1",
    activateLicense: null,
  };
  return appRouter.createCaller(ctx);
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TRPCError) return { code: error.code, domainCode: describeError(error).domainCode };
    throw error;
  }
  throw new Error("expected the call to fail");
}

const ID = "11111111-1111-4111-8111-111111111111";
const VERSION = "2026-10-19T00:00:00.000Z";
const group = { code: "dia", name: "Diamond", active: true };
const stoneCode = {
  mode: "AUTO" as const,
  // Size is set: in the default order it sits at #2, which is required (owner 2026-10-20).
  parts: { stoneNameId: ID, sizeId: ID, shapeId: ID, colorId: ID, cuttingId: null, clarityId: null, qualityId: null },
  partOrder: ["name", "size", "shape", "color", "cutting", "clarity", "quality"] as ("name" | "size" | "shape" | "color" | "cutting" | "clarity" | "quality")[],
  active: true,
};

beforeEach(() => {
  vi.mocked(callPartner).mockReset();
  vi.mocked(callPartner).mockResolvedValue({});
});

describe("stoneMaster permissions", () => {
  it("UT-SM-G01 without stone-master:VIEW every read is PERMISSION_DENIED and partner is not called", async () => {
    const api = caller(["vendor:VIEW"]);
    for (const call of [api.stoneMaster.group.list({}), api.stoneMaster.stoneCode.get({ id: ID }), api.stoneMaster.options({ kinds: ["group"] })]) {
      expect(await failure(call)).toEqual({ code: "FORBIDDEN", domainCode: "PERMISSION_DENIED" });
    }
    expect(callPartner).not.toHaveBeenCalled();
  });

  it("UT-SM-G02 each mutation needs its own action", async () => {
    const view = caller(["stone-master:VIEW"]);
    expect(await failure(view.stoneMaster.group.create(group))).toMatchObject({ domainCode: "PERMISSION_DENIED" });
    expect(await failure(view.stoneMaster.group.update({ id: ID, expectedUpdatedAt: VERSION, ...group }))).toMatchObject({ domainCode: "PERMISSION_DENIED" });
    expect(await failure(view.stoneMaster.group.delete({ id: ID }))).toMatchObject({ domainCode: "PERMISSION_DENIED" });
    await caller(["stone-master:ADD"]).stoneMaster.group.create(group);
    await caller(["stone-master:EDIT"]).stoneMaster.group.update({ id: ID, expectedUpdatedAt: VERSION, ...group });
    await caller(["stone-master:DELETE"]).stoneMaster.group.delete({ id: ID });
    expect(vi.mocked(callPartner).mock.calls.map(([call]) => [call.method, call.path])).toEqual([
      ["POST", "/internal/v1/stone-master/group"],
      ["PUT", `/internal/v1/stone-master/group/${ID}`],
      ["DELETE", `/internal/v1/stone-master/group/${ID}`],
    ]);
  });

  it("UT-SM-G03 kinds map to partner slugs; update strips the id from the body", async () => {
    const api = caller([], true);
    await api.stoneMaster.stoneName.list({ q: "ru" });
    await api.stoneMaster.stoneCode.update({ id: ID, expectedUpdatedAt: VERSION, ...stoneCode });
    const [list, update] = vi.mocked(callPartner).mock.calls.map(([call]) => call);
    expect(list.path).toBe("/internal/v1/stone-master/stone-name?limit=50&q=ru");
    expect(update.path).toBe(`/internal/v1/stone-master/stone-code/${ID}`);
    expect(update.body).not.toHaveProperty("id");
    expect(update.body).toMatchObject({ expectedUpdatedAt: VERSION, mode: "AUTO" });
  });

  it("UT-SM-G04 options builds the query string", async () => {
    await caller(["stone-master:VIEW"]).stoneMaster.options({ kinds: ["group", "stone-name"], include: [ID] });
    expect(vi.mocked(callPartner).mock.calls[0][0].path).toBe(`/internal/v1/stone-master/options?kinds=group%2Cstone-name&include=${ID}`);
  });
});

describe("stoneMaster schemas", () => {
  it("UT-SM-G05 codes are uppercased and validated; unknown fields rejected", () => {
    expect(STONE_INPUTS.simple.create.parse(group).code).toBe("DIA");
    expect(STONE_INPUTS.simple.create.safeParse({ ...group, code: "a b" }).success).toBe(false);
    expect(STONE_INPUTS.simple.create.safeParse({ ...group, extra: 1 }).success).toBe(false);
  });

  it("UT-SM-G06 stone name HSN and shape sizes", () => {
    const name = { code: "RUB", name: "Ruby", groupId: ID, active: true };
    expect(STONE_INPUTS.stoneName.create.parse({ ...name, hsn: "" }).hsn).toBeNull();
    expect(STONE_INPUTS.stoneName.create.safeParse({ ...name, hsn: "12" }).success).toBe(false);
    expect(STONE_INPUTS.shape.create.safeParse({ code: "RD", name: "Round", active: true, sizeIds: [ID, ID] }).success).toBe(false);
  });

  it("UT-SM-G07 stone code part order must be a permutation", () => {
    expect(STONE_INPUTS.stoneCode.create.safeParse(stoneCode).success).toBe(true);
    expect(STONE_INPUTS.stoneCode.create.safeParse({ ...stoneCode, partOrder: ["name", "name", "shape", "color", "cutting", "clarity", "quality"] }).success).toBe(false);
  });

  it("UT-SM-G08 outputs validate list rows and options input bounds", () => {
    expect(STONE_OUTPUTS.stoneName.list.safeParse({ items: [{ id: ID, code: "RUB", name: "Ruby", active: true, hsn: null, group: { id: ID, code: "PRE", name: "Precious" } }], nextCursor: null, total: 1 }).success).toBe(true);
    expect(STONE_OUTPUTS.shape.list.safeParse({ items: [{ id: ID, code: "RD", name: "Round", active: true }], nextCursor: null, total: 1 }).success).toBe(false);
    expect(stoneOptionsInputSchema.safeParse({ kinds: [] }).success).toBe(false);
    expect(stoneOptionsInputSchema.parse({ kinds: ["size"] }).include).toEqual([]);
  });
});
