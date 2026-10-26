import { describe, expect, it } from "vitest";
import { BODY_SCHEMAS, bodySchemasFor, optionsQuerySchema } from "../../src/stone-master/stone-master.schemas";
import { buildAutoCode, DEFAULT_PART_ORDER, isPermutation, sizePartCode } from "../../src/stone-master/stone-code";
import { mapStoneError } from "../../src/stone-master/stone-master.errors";

/** UT-SM-P01…P08: stone master input rules (SA-SM-04/05/08) and error mapping (SA-SM-06). */

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
// Size is set: in the default order it sits at #2, which is required (owner 2026-10-20).
const parts = { stoneNameId: ID, sizeId: ID, shapeId: ID, colorId: ID, cuttingId: null, clarityId: null, qualityId: null };

describe("simple body (SA-SM-04)", () => {
  it("UT-SM-P01 code is trimmed and uppercased; format and length enforced", () => {
    expect(BODY_SCHEMAS.simple.create.parse({ code: " dia ", name: " Diamond ", active: true })).toEqual({ code: "DIA", name: "Diamond", active: true });
    expect(BODY_SCHEMAS.simple.create.parse({ code: "2.0x3.0", name: "2.0 x 3.0 mm", active: true }).code).toBe("2.0X3.0");
    for (const code of ["", "A B", "A_B", "x".repeat(21)]) {
      expect(BODY_SCHEMAS.simple.create.safeParse({ code, name: "N", active: true }).success).toBe(false);
    }
    expect(BODY_SCHEMAS.simple.create.safeParse({ code: "A", name: "", active: true }).success).toBe(false);
    expect(BODY_SCHEMAS.simple.create.safeParse({ code: "A", name: "N", active: true, extra: 1 }).success).toBe(false);
  });

  it("UT-SM-P02 update requires expectedUpdatedAt", () => {
    expect(BODY_SCHEMAS.simple.update.safeParse({ code: "A", name: "N", active: true }).success).toBe(false);
    expect(BODY_SCHEMAS.simple.update.safeParse({ code: "A", name: "N", active: true, expectedUpdatedAt: "2026-10-19T00:00:00.000Z" }).success).toBe(true);
  });
});

describe("stone name and shape", () => {
  it("UT-SM-P03 HSN optional 4–8 digits; empty string means none", () => {
    const base = { code: "RUB", name: "Ruby", groupId: ID, active: true };
    expect(BODY_SCHEMAS["stone-name"].create.parse({ ...base, hsn: "" }).hsn).toBeNull();
    expect(BODY_SCHEMAS["stone-name"].create.parse({ ...base, hsn: "7103" }).hsn).toBe("7103");
    expect(BODY_SCHEMAS["stone-name"].create.safeParse({ ...base, hsn: "71A3" }).success).toBe(false);
    expect(BODY_SCHEMAS["stone-name"].create.safeParse({ ...base, hsn: "123" }).success).toBe(false);
  });

  it("UT-SM-P04 shape needs 1–100 unique sizes", () => {
    const base = { code: "RD", name: "Round", active: true };
    expect(BODY_SCHEMAS.shape.create.safeParse({ ...base, sizeIds: [ID] }).success).toBe(true);
    expect(BODY_SCHEMAS.shape.create.safeParse({ ...base, sizeIds: [] }).success).toBe(false);
    const duplicate = BODY_SCHEMAS.shape.create.safeParse({ ...base, sizeIds: [ID, ID] });
    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.issues[0]).toMatchObject({ path: ["sizeIds"], params: { code: "duplicate" } });
  });
});

describe("stone code (SA-SM-05)", () => {
  it("UT-SM-P05 AUTO drops any sent code; MANUAL requires a valid code, uppercased", () => {
    const base = { parts, partOrder: [...DEFAULT_PART_ORDER], active: true };
    expect(BODY_SCHEMAS["stone-code"].create.parse({ ...base, mode: "AUTO", code: "anything" }).code).toBeUndefined();
    expect(BODY_SCHEMAS["stone-code"].create.parse({ ...base, mode: "MANUAL", code: " sap-blue-2mm " }).code).toBe("SAP-BLUE-2MM");
    expect(BODY_SCHEMAS["stone-code"].create.safeParse({ ...base, mode: "MANUAL", code: "" }).success).toBe(false);
    expect(BODY_SCHEMAS["stone-code"].create.safeParse({ ...base, mode: "MANUAL", code: "has space" }).success).toBe(false);
  });

  it("UT-SM-P06b the parts at #1 and #2 are required (owner 2026-10-20)", () => {
    const order = ["name", "clarity", "shape", "color", "cutting", "size", "quality"];
    const missing = BODY_SCHEMAS["stone-code"].create.safeParse({ mode: "AUTO", parts, partOrder: order, active: true });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]).toMatchObject({ path: ["parts", "clarityId"], params: { code: "required" } });
    const ok = BODY_SCHEMAS["stone-code"].create.safeParse({ mode: "AUTO", parts: { ...parts, clarityId: ID }, partOrder: order, active: true });
    expect(ok.success).toBe(true);
  });

  it("UT-SM-P06c only #1 and #2 are required: name, shape and color may be empty elsewhere (owner 2026-10-20)", () => {
    const order = ["clarity", "quality", "name", "size", "shape", "color", "cutting"];
    const onlyTop = { stoneNameId: null, sizeId: null, shapeId: null, colorId: null, cuttingId: null, clarityId: ID, qualityId: ID2 };
    expect(BODY_SCHEMAS["stone-code"].create.safeParse({ mode: "AUTO", parts: onlyTop, partOrder: order, active: true }).success).toBe(true);
  });

  it("UT-SM-P06 part order must be a permutation of the seven keys", () => {
    expect(isPermutation(["name", "size", "shape", "color", "cutting", "clarity", "quality"])).toBe(true);
    expect(isPermutation(["name", "name", "shape", "color", "cutting", "clarity", "quality"])).toBe(false);
    expect(isPermutation(["name", "shape"])).toBe(false);
    const bad = BODY_SCHEMAS["stone-code"].create.safeParse({ mode: "AUTO", parts, partOrder: ["name"], active: true });
    expect(bad.success).toBe(false);
  });

  it("UT-SM-P07 auto code: first two parts joined, then \"-\", then the rest without separators", () => {
    const codes = { name: "RD", size: "1.0", shape: "RD", color: "D", cutting: "EX", clarity: "VVS1", quality: null };
    expect(buildAutoCode(DEFAULT_PART_ORDER, codes)).toBe("RD1.0-RDDEXVVS1");
    expect(buildAutoCode(["color", "name", "size", "shape", "cutting", "clarity", "quality"], codes)).toBe("DRD-1.0RDEXVVS1");
    expect(buildAutoCode(DEFAULT_PART_ORDER, { name: "RUB", shape: "OV" })).toBe("RUBOV");
    expect(buildAutoCode(DEFAULT_PART_ORDER, { name: "RUB" })).toBe("RUB");
    expect(buildAutoCode(DEFAULT_PART_ORDER, {})).toBe("");
  });
});

describe("options query and errors", () => {
  it("UT-SM-P08 options kinds/include parsing; FK violations map by operation", () => {
    expect(optionsQuerySchema.parse({ kinds: "group,stone-name", include: `${ID},${ID2}` })).toEqual({ kinds: ["group", "stone-name"], include: [ID, ID2] });
    expect(optionsQuerySchema.safeParse({ kinds: "group,nope" }).success).toBe(false);
    expect(optionsQuerySchema.safeParse({ kinds: "group", include: "not-a-uuid" }).success).toBe(false);

    const fk = Object.assign(new Error("fk"), { code: "P2003" });
    const status = (error: unknown) => (error as { getStatus(): number; getResponse(): { error: { code: string } } });
    expect(status(mapStoneError(fk, "delete")).getResponse().error.code).toBe("STONE_MASTER_IN_USE");
    expect(status(mapStoneError(fk, "create")).getResponse().error.code).toBe("STONE_MASTER_REFERENCE_INVALID");
    const unique = Object.assign(new Error("unique"), { code: "P2002", meta: { target: "stone_group_code_key" } });
    expect(status(mapStoneError(unique, "create")).getResponse().error.code).toBe("STONE_MASTER_CODE_TAKEN");
  });
});

describe("size (owner 2026-10-23)", () => {
  it("UT-SM-P09 a size has only a name: 1–20 of letters, digits, space . - /; a code is rejected", () => {
    expect(bodySchemasFor("size").create.parse({ name: " 2.0 mm ", active: true })).toEqual({ name: "2.0 mm", active: true });
    for (const name of ["", "2.0 × 3.0", "x".repeat(21)]) {
      expect(bodySchemasFor("size").create.safeParse({ name, active: true }).success).toBe(false);
    }
    expect(bodySchemasFor("size").create.safeParse({ code: "1.0", name: "1.0", active: true }).success).toBe(false);
    expect(bodySchemasFor("size").update.safeParse({ name: "1.0", active: true }).success).toBe(false);
    expect(bodySchemasFor("color")).toBe(BODY_SCHEMAS.simple);
    expect(bodySchemasFor("shape")).toBe(BODY_SCHEMAS.shape);
    expect(sizePartCode(" 2.0 mm ")).toBe("2.0MM");
  });

  it("UT-SM-P09b a duplicate size name is STONE_MASTER_CODE_TAKEN on `name`", () => {
    const unique = Object.assign(new Error("unique"), { code: "P2002", meta: { target: "stone_size_name_key" } });
    const response = (mapStoneError(unique, "create") as { getResponse(): { error: { code: string; fieldErrors: Array<{ path: string }> } } }).getResponse();
    expect(response.error.code).toBe("STONE_MASTER_CODE_TAKEN");
    expect(response.error.fieldErrors[0].path).toBe("name");
  });
});
