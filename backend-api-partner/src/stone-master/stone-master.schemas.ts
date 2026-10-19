import { z } from "zod";
import { expectedUpdatedAtSchema } from "../common/partner-schemas";
import { OPTION_KINDS } from "./stone-master.kinds";
import { isPermutation, PART_KEYS, STONE_CODE_PATTERN } from "./stone-code";

/** SA-SM-04: trimmed, stored UPPERCASE, 1–20 of A–Z 0–9 . - / (so the unique index is case-insensitive). */
export const codeSchema = z.string().trim().transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9./-]{1,20}$/));
const nameSchema = z.string().trim().min(1).max(120);
const uuid = z.uuid();
const version = { expectedUpdatedAt: expectedUpdatedAtSchema };

const simpleFields = { code: codeSchema, name: nameSchema, active: z.boolean() };

/** HSN optional, 4–8 digits; "" means none (SA-SM-04). */
const hsnSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().regex(/^[0-9]{4,8}$/).nullable(),
);
const stoneNameFields = { ...simpleFields, groupId: uuid, hsn: hsnSchema };
const shapeFields = { ...simpleFields, sizeIds: z.array(uuid).min(1).max(100) };

const partsSchema = z.object({
  stoneNameId: uuid,
  sizeId: uuid.nullable(),
  shapeId: uuid,
  colorId: uuid,
  cuttingId: uuid.nullable(),
  clarityId: uuid.nullable(),
  qualityId: uuid.nullable(),
}).strict();

const stoneCodeFields = {
  mode: z.enum(["AUTO", "MANUAL"]),
  code: z.string().max(200).optional(),
  parts: partsSchema,
  partOrder: z.array(z.enum(PART_KEYS)).refine(isPermutation, { message: "not_permutation", params: { code: "not_permutation" } }),
  active: z.boolean(),
};

function noDuplicateSizes(value: { sizeIds: string[] }, ctx: z.RefinementCtx) {
  if (new Set(value.sizeIds).size !== value.sizeIds.length) {
    ctx.addIssue({ code: "custom", path: ["sizeIds"], message: "duplicate", params: { code: "duplicate" } });
  }
}

/**
 * SA-SM-05: AUTO ignores any sent `code` (the server builds it); MANUAL requires a code of 1–60 of
 * A–Z 0–9 . - / (stored UPPERCASE).
 */
function stoneCodeRule<T extends { mode: "AUTO" | "MANUAL"; code?: string }>(value: T, ctx: z.RefinementCtx) {
  if (value.mode === "AUTO") return { ...value, code: undefined };
  const code = (value.code ?? "").trim().toUpperCase();
  if (!STONE_CODE_PATTERN.test(code)) {
    const reason = code === "" ? "required" : "invalid_format";
    ctx.addIssue({ code: "custom", path: ["code"], message: reason, params: { code: reason } });
    return z.NEVER;
  }
  return { ...value, code };
}

export const BODY_SCHEMAS = {
  simple: {
    create: z.object(simpleFields).strict(),
    update: z.object({ ...simpleFields, ...version }).strict(),
  },
  "stone-name": {
    create: z.object(stoneNameFields).strict(),
    update: z.object({ ...stoneNameFields, ...version }).strict(),
  },
  shape: {
    create: z.object(shapeFields).strict().superRefine(noDuplicateSizes),
    update: z.object({ ...shapeFields, ...version }).strict().superRefine(noDuplicateSizes),
  },
  "stone-code": {
    create: z.object(stoneCodeFields).strict().transform(stoneCodeRule),
    update: z.object({ ...stoneCodeFields, ...version }).strict().transform(stoneCodeRule),
  },
} as const;

export type SimpleInput = z.output<typeof BODY_SCHEMAS.simple.create>;
export type StoneNameInput = z.output<(typeof BODY_SCHEMAS)["stone-name"]["create"]>;
export type ShapeInput = z.output<typeof BODY_SCHEMAS.shape.create>;
export type StoneCodeInput = z.output<(typeof BODY_SCHEMAS)["stone-code"]["create"]>;

/** `GET /options?kinds=a,b&include=id,id` (SA-SM-08): include ≤ 20 selected ids that may be inactive. */
export const optionsQuerySchema = z.object({
  kinds: z.string().max(200)
    .transform((value) => value.split(",").map((part) => part.trim()).filter(Boolean))
    .pipe(z.array(z.enum(OPTION_KINDS)).min(1).max(OPTION_KINDS.length)),
  include: z.string().max(20 * 37).optional()
    .transform((value) => (value ? value.split(",").map((part) => part.trim()).filter(Boolean) : []))
    .pipe(z.array(uuid).max(20)),
}).strict();

export type OptionsQuery = z.output<typeof optionsQuerySchema>;
