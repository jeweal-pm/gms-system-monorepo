import { z } from "zod";
import { listInputSchema } from "./partner-schemas";

/**
 * stone-master SA revision 1 contract shapes (ADR-0024, SA-SM-04…10). Inputs mirror the partner rules
 * (strict); outputs are validated and unknown upstream fields are stripped.
 */

export const STONE_PART_KEYS = ["name", "size", "shape", "color", "cutting", "clarity", "quality"] as const;
export const STONE_OPTION_KINDS = ["group", "size", "shape", "color", "cutting", "clarity", "quality", "stone-name"] as const;

const uuid = z.uuid();
const codeSchema = z.string().trim().transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9./-]{1,20}$/));
const nameSchema = z.string().trim().min(1).max(120);
const expectedUpdatedAt = z.iso.datetime({ offset: false, precision: 3 });
const hsnSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().regex(/^[0-9]{4,8}$/).nullable(),
);

const simpleFields = { code: codeSchema, name: nameSchema, active: z.boolean() };
const stoneNameFields = { ...simpleFields, groupId: uuid, hsn: hsnSchema };
const shapeFields = { ...simpleFields, sizeIds: z.array(uuid).min(1).max(100) };
const stoneCodeFields = {
  mode: z.enum(["AUTO", "MANUAL"]),
  /** MANUAL: 1–60 of A–Z 0–9 . - / (checked by partner); AUTO: ignored, the server builds it. */
  code: z.string().trim().max(60).optional(),
  parts: z.object({
    // Owner 2026-10-20: only the parts at #1 and #2 are required (topPartsRequired).
    stoneNameId: uuid.nullable(),
    sizeId: uuid.nullable(),
    shapeId: uuid.nullable(),
    colorId: uuid.nullable(),
    cuttingId: uuid.nullable(),
    clarityId: uuid.nullable(),
    qualityId: uuid.nullable(),
  }).strict(),
  partOrder: z.array(z.enum(STONE_PART_KEYS)).length(STONE_PART_KEYS.length)
    .refine((order) => new Set(order).size === STONE_PART_KEYS.length, { message: "not_permutation" }),
  active: z.boolean(),
};

const PART_FIELD = { name: "stoneNameId", size: "sizeId", shape: "shapeId", color: "colorId", cutting: "cuttingId", clarity: "clarityId", quality: "qualityId" } as const;

/** Owner 2026-10-20: the parts at positions #1 and #2 are required (partner enforces the same rule). */
function topPartsRequired(value: { partOrder: (keyof typeof PART_FIELD)[]; parts: Record<string, string | null> }, ctx: z.RefinementCtx) {
  for (const part of value.partOrder.slice(0, 2)) {
    if (!value.parts[PART_FIELD[part]]) ctx.addIssue({ code: "custom", path: ["parts", PART_FIELD[part]], message: "required" });
  }
}

const idField = { id: uuid };
const withUpdate = <T extends z.ZodRawShape>(fields: T) => z.object({ ...idField, expectedUpdatedAt, ...fields }).strict();

export const stoneIdInputSchema = z.object(idField).strict();
export const stoneListInputSchema = listInputSchema;

export const STONE_INPUTS = {
  simple: { create: z.object(simpleFields).strict(), update: withUpdate(simpleFields) },
  stoneName: { create: z.object(stoneNameFields).strict(), update: withUpdate(stoneNameFields) },
  shape: {
    create: z.object(shapeFields).strict().refine((value) => new Set(value.sizeIds).size === value.sizeIds.length, { message: "duplicate", path: ["sizeIds"] }),
    update: withUpdate(shapeFields).refine((value) => new Set(value.sizeIds).size === value.sizeIds.length, { message: "duplicate", path: ["sizeIds"] }),
  },
  stoneCode: {
    create: z.object(stoneCodeFields).strict().superRefine(topPartsRequired),
    update: withUpdate(stoneCodeFields).superRefine(topPartsRequired),
  },
} as const;

export const stoneOptionsInputSchema = z.object({
  kinds: z.array(z.enum(STONE_OPTION_KINDS)).min(1).max(STONE_OPTION_KINDS.length),
  include: z.array(uuid).max(20).default([]),
}).strict();

// ---- outputs ----

const timestamps = { createdAt: z.string(), updatedAt: z.string() };
const simpleRow = { id: z.string(), code: z.string(), name: z.string(), active: z.boolean() };

const listOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item).max(50), nextCursor: z.string().nullable(), total: z.number().int().nonnegative() });

export const STONE_OUTPUTS = {
  simple: {
    list: listOf(z.object(simpleRow)),
    detail: z.object({ ...simpleRow, ...timestamps }),
  },
  stoneName: {
    list: listOf(z.object({ ...simpleRow, hsn: z.string().nullable(), group: z.object({ id: z.string(), code: z.string(), name: z.string() }) })),
    detail: z.object({ ...simpleRow, groupId: z.string(), hsn: z.string().nullable(), ...timestamps }),
  },
  shape: {
    list: listOf(z.object({ ...simpleRow, sizeCount: z.number().int().nonnegative() })),
    detail: z.object({ ...simpleRow, sizeIds: z.array(z.string()).max(100), ...timestamps }),
  },
  stoneCode: {
    list: listOf(z.object({ id: z.string(), code: z.string(), mode: z.enum(["AUTO", "MANUAL"]), active: z.boolean(), stoneName: z.object({ code: z.string(), name: z.string() }).nullable() })),
    detail: z.object({
      id: z.string(),
      code: z.string(),
      mode: z.enum(["AUTO", "MANUAL"]),
      parts: z.object({
        stoneNameId: z.string().nullable(), sizeId: z.string().nullable(), shapeId: z.string().nullable(), colorId: z.string().nullable(),
        cuttingId: z.string().nullable(), clarityId: z.string().nullable(), qualityId: z.string().nullable(),
      }),
      partOrder: z.array(z.enum(STONE_PART_KEYS)).length(STONE_PART_KEYS.length),
      active: z.boolean(),
      ...timestamps,
    }),
  },
} as const;

export const stoneMutationOutputSchema = z.object({ id: z.string(), updatedAt: z.string() });
export const stoneDeleteOutputSchema = z.object({ ok: z.literal(true) });

const optionItem = z.object(simpleRow);
const optionList = z.array(optionItem).max(1000);
export const stoneOptionsOutputSchema = z.object({
  group: optionList.optional(),
  size: optionList.optional(),
  shape: z.array(optionItem.extend({ sizeIds: z.array(z.string()).max(100) })).max(1000).optional(),
  color: optionList.optional(),
  cutting: optionList.optional(),
  clarity: optionList.optional(),
  quality: optionList.optional(),
  stoneName: optionList.optional(),
});
