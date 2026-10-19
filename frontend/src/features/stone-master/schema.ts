import { z } from "zod";
import type { FieldSet } from "./kinds";
import { DEFAULT_PART_ORDER, PART_KEYS, type PartKey } from "./stone-code";

/**
 * One form shape for every Stone Master page (form-guidelines.md); each page validates only its
 * fields. Select fields hold "" while nothing is chosen.
 */
export type StoneFormValues = {
  code: string;
  name: string;
  active: boolean;
  groupId: string;
  hsn: string;
  sizeIds: string[];
  mode: "AUTO" | "MANUAL";
  stoneNameId: string;
  sizeId: string;
  shapeId: string;
  colorId: string;
  cuttingId: string;
  clarityId: string;
  qualityId: string;
  partOrder: PartKey[];
};

export function emptyStoneForm(): StoneFormValues {
  return {
    code: "",
    name: "",
    active: true,
    groupId: "",
    hsn: "",
    sizeIds: [],
    mode: "AUTO",
    stoneNameId: "",
    sizeId: "",
    shapeId: "",
    colorId: "",
    cuttingId: "",
    clarityId: "",
    qualityId: "",
    partOrder: [...DEFAULT_PART_ORDER],
  };
}

export const CODE_PATTERN = /^[A-Za-z0-9./-]{1,20}$/;
export const STONE_CODE_PATTERN = /^[A-Za-z0-9./-]{1,60}$/;
export const STONE_SEARCH_MAX = 100;

const base = z.object({
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  groupId: z.string(),
  hsn: z.string(),
  sizeIds: z.array(z.string()),
  mode: z.enum(["AUTO", "MANUAL"]),
  stoneNameId: z.string(),
  sizeId: z.string(),
  shapeId: z.string(),
  colorId: z.string(),
  cuttingId: z.string(),
  clarityId: z.string(),
  qualityId: z.string(),
  partOrder: z.array(z.enum(PART_KEYS)),
});

type Issue = { path: keyof StoneFormValues; message: string };

/** Pure rules (exported for tests); the schema reports them on their fields. */
export function stoneFormIssues(fields: FieldSet, values: StoneFormValues): Issue[] {
  const issues: Issue[] = [];
  if (fields !== "stoneCode") {
    const code = values.code.trim();
    if (code === "") issues.push({ path: "code", message: "Code Name is required" });
    else if (!CODE_PATTERN.test(code)) issues.push({ path: "code", message: "Use up to 20 letters, digits, . - or /" });
    const name = values.name.trim();
    if (name === "") issues.push({ path: "name", message: "Name is required" });
    else if (name.length > 120) issues.push({ path: "name", message: "Name must be at most 120 characters" });
  }
  if (fields === "stoneName") {
    if (values.groupId === "") issues.push({ path: "groupId", message: "Select a stone group" });
    if (values.hsn.trim() !== "" && !/^[0-9]{4,8}$/.test(values.hsn.trim())) issues.push({ path: "hsn", message: "HSN must be 4–8 digits" });
  }
  if (fields === "shape") {
    if (values.sizeIds.length === 0) issues.push({ path: "sizeIds", message: "Select at least one size" });
    else if (values.sizeIds.length > 100) issues.push({ path: "sizeIds", message: "Select at most 100 sizes" });
  }
  if (fields === "stoneCode") {
    if (values.stoneNameId === "") issues.push({ path: "stoneNameId", message: "Select a name" });
    if (values.shapeId === "") issues.push({ path: "shapeId", message: "Select a shape" });
    if (values.colorId === "") issues.push({ path: "colorId", message: "Select a color" });
    if (values.mode === "MANUAL") {
      const code = values.code.trim();
      if (code === "") issues.push({ path: "code", message: "Stone Code is required" });
      else if (!STONE_CODE_PATTERN.test(code)) issues.push({ path: "code", message: "Use up to 60 letters, digits, . - or /" });
    }
  }
  return issues;
}

export function stoneFormSchema(fields: FieldSet) {
  return base.superRefine((values, ctx) => {
    for (const issue of stoneFormIssues(fields, values)) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
  });
}

/** Visual order for focusing the first invalid field. */
export const FIELD_ORDER: readonly (keyof StoneFormValues)[] = ["code", "name", "groupId", "hsn", "sizeIds", "stoneNameId", "sizeId", "shapeId", "colorId", "cuttingId", "clarityId", "qualityId"];
