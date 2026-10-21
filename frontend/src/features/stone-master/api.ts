import { isCallerLicenseCode, readDomainError } from "@/lib/trpc-error";
import type { FieldSet } from "./kinds";
import { DEFAULT_PART_ORDER, PART_KEYS, type PartKey } from "./stone-code";
import { emptyStoneForm, type StoneFormValues } from "./schema";

/**
 * stone-master data boundary (data-fetching.md, error-handling.md): contract → form values and
 * back, drawer row text, select labels and domain-code messages. The api-master contract is
 * consumed by the typed master tRPC client; the shapes differ per page, so they are read through
 * these small view types.
 */

export type StoneParts = {
  stoneNameId: string | null;
  sizeId: string | null;
  shapeId: string | null;
  colorId: string | null;
  cuttingId: string | null;
  clarityId: string | null;
  qualityId: string | null;
};

export type StoneDetail = {
  id: string;
  code: string;
  name?: string;
  active: boolean;
  updatedAt: string;
  groupId?: string;
  hsn?: string | null;
  sizeIds?: string[];
  mode?: "AUTO" | "MANUAL";
  parts?: StoneParts;
  partOrder?: PartKey[];
};

export type StoneListItem = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  hsn?: string | null;
  group?: { code: string; name: string };
  sizeCount?: number;
  mode?: "AUTO" | "MANUAL";
  stoneName?: { code: string; name: string } | null;
};

export type StoneOption = { id: string; code: string; name: string; active: boolean; sizeIds?: string[] };
export type OptionKey = "group" | "size" | "shape" | "color" | "cutting" | "clarity" | "quality" | "stoneName";
export type StoneOptions = Partial<Record<OptionKey, StoneOption[]>>;

/** Option kinds each page needs (SA-SM-08; gateway kind names). */
export const OPTION_KINDS_BY_FIELDS: Readonly<Record<FieldSet, readonly ("group" | "size" | "shape" | "color" | "cutting" | "clarity" | "quality" | "stone-name")[]>> = {
  simple: [],
  stoneName: ["group"],
  shape: ["size"],
  stoneCode: ["stone-name", "size", "shape", "color", "cutting", "clarity", "quality"],
};

/** Part → options key. */
export const PART_OPTION: Readonly<Record<PartKey, OptionKey>> = {
  name: "stoneName",
  size: "size",
  shape: "shape",
  color: "color",
  cutting: "cutting",
  clarity: "clarity",
  quality: "quality",
};

/** "DIA · Diamond", marked when inactive (shown only for a saved choice). */
export function optionLabel(option: StoneOption): string {
  return `${option.code} · ${option.name}${option.active ? "" : " (inactive)"}`;
}

/** Q-SM-03: the Size part offers only the sizes available on the chosen shape (none before a shape). */
export function sizesForShape(options: StoneOptions | undefined, shapeId: string): StoneOption[] {
  const shape = options?.shape?.find((entry) => entry.id === shapeId);
  if (!shape) return [];
  return (options?.size ?? []).filter((option) => shape.sizeIds?.includes(option.id));
}

/** After a shape change: keep the size only if the new shape has it (UT-SM-05). */
export function sizeAfterShapeChange(options: StoneOptions | undefined, shapeId: string, sizeId: string): string {
  if (sizeId === "") return "";
  return sizesForShape(options, shapeId).some((option) => option.id === sizeId) ? sizeId : "";
}

/** Ids a saved record references, sent as `include` so inactive choices still display. */
export function referencedIds(fields: FieldSet, detail: StoneDetail | undefined): string[] {
  if (!detail) return [];
  if (fields === "stoneName") return detail.groupId ? [detail.groupId] : [];
  if (fields === "shape") return (detail.sizeIds ?? []).slice(0, 20);
  if (fields === "stoneCode" && detail.parts) return Object.values(detail.parts).filter((id): id is string => typeof id === "string");
  return [];
}

export function toFormValues(fields: FieldSet, detail: StoneDetail): StoneFormValues {
  const values = emptyStoneForm();
  values.code = detail.code;
  values.active = detail.active;
  values.name = detail.name ?? "";
  if (fields === "stoneName") {
    values.groupId = detail.groupId ?? "";
    values.hsn = detail.hsn ?? "";
  }
  if (fields === "shape") values.sizeIds = [...(detail.sizeIds ?? [])];
  if (fields === "stoneCode" && detail.parts) {
    values.mode = detail.mode ?? "AUTO";
    values.stoneNameId = detail.parts.stoneNameId ?? "";
    values.sizeId = detail.parts.sizeId ?? "";
    values.shapeId = detail.parts.shapeId ?? "";
    values.colorId = detail.parts.colorId ?? "";
    values.cuttingId = detail.parts.cuttingId ?? "";
    values.clarityId = detail.parts.clarityId ?? "";
    values.qualityId = detail.parts.qualityId ?? "";
    values.partOrder = detail.partOrder && detail.partOrder.length === PART_KEYS.length ? [...detail.partOrder] : [...DEFAULT_PART_ORDER];
  }
  return values;
}

/** Duplicate (ui-spec "Duplicate"): every field copied, Code cleared (codes are unique, no running number). */
export function toDuplicateValues(fields: FieldSet, detail: StoneDetail): StoneFormValues {
  return { ...toFormValues(fields, detail), code: "" };
}

const orNull = (value: string) => (value === "" ? null : value);

/** Form values → strict create input for the page's kind (update adds `id` + `expectedUpdatedAt`). */
export function toInput(fields: FieldSet, values: StoneFormValues): Record<string, unknown> {
  const simple = { code: values.code.trim().toUpperCase(), name: values.name.trim(), active: values.active };
  if (fields === "simple") return simple;
  if (fields === "stoneName") return { ...simple, groupId: values.groupId, hsn: orNull(values.hsn.trim()) };
  if (fields === "shape") return { ...simple, sizeIds: values.sizeIds };
  return {
    mode: values.mode,
    ...(values.mode === "MANUAL" ? { code: values.code.trim().toUpperCase() } : {}),
    parts: {
      stoneNameId: orNull(values.stoneNameId),
      sizeId: orNull(values.sizeId),
      shapeId: orNull(values.shapeId),
      colorId: orNull(values.colorId),
      cuttingId: orNull(values.cuttingId),
      clarityId: orNull(values.clarityId),
      qualityId: orNull(values.qualityId),
    },
    partOrder: values.partOrder,
    active: values.active,
  };
}

/** Drawer row text per page (ui-spec "Row text"). */
export function rowText(fields: FieldSet, item: StoneListItem): { primary: string; secondary: string } {
  if (fields === "stoneName") {
    const parts = [item.code, item.group?.code, item.group?.name, item.hsn ? `HSN ${item.hsn}` : null].filter(Boolean);
    return { primary: item.name, secondary: parts.join(" · ") };
  }
  if (fields === "shape") {
    const count = item.sizeCount ?? 0;
    return { primary: item.name, secondary: `${item.code} · ${count} size${count === 1 ? "" : "s"}` };
  }
  if (fields === "stoneCode") {
    const mode = item.mode === "MANUAL" ? "Manual code" : "Auto code";
    return { primary: item.code, secondary: item.stoneName ? `${item.stoneName.name} · ${mode}` : mode };
  }
  return { primary: item.name, secondary: item.code };
}

// ---- errors ----

export type FieldError = { name: keyof StoneFormValues; message: string };
export type SaveOutcome = {
  fieldErrors: FieldError[];
  formError: string | null;
  stale?: boolean;
  notFound?: boolean;
  refetchOptions?: boolean;
  recheckAccess?: boolean;
};

const REFERENCE_FIELD: Readonly<Record<string, keyof StoneFormValues>> = {
  groupId: "groupId",
  sizeIds: "sizeIds",
  "parts.stoneNameId": "stoneNameId",
  "parts.sizeId": "sizeId",
  "parts.shapeId": "shapeId",
  "parts.colorId": "colorId",
  "parts.cuttingId": "cuttingId",
  "parts.clarityId": "clarityId",
  "parts.qualityId": "qualityId",
};

const REFERENCE_MESSAGE: Readonly<Partial<Record<keyof StoneFormValues, string>>> = {
  groupId: "Select an active stone group",
  sizeIds: "Select active sizes",
  stoneNameId: "Select an active name",
  sizeId: "This size isn't available for the chosen shape",
  shapeId: "Select an active shape",
  colorId: "Select an active color",
  cuttingId: "Select an active cutting",
  clarityId: "Select an active clarity",
  qualityId: "Select an active quality",
};

export function mapSaveError(error: unknown, fields: FieldSet): SaveOutcome {
  const { domainCode, fieldErrors } = readDomainError(error);
  switch (domainCode) {
    case "STONE_MASTER_CODE_TAKEN":
      return { fieldErrors: [{ name: "code", message: fields === "stoneCode" ? "This stone code is already used" : "This code is already used" }], formError: null };
    case "STONE_MASTER_REFERENCE_INVALID": {
      const name = REFERENCE_FIELD[fieldErrors[0]?.path ?? ""];
      return name
        ? { fieldErrors: [{ name, message: REFERENCE_MESSAGE[name] ?? "Select an active item" }], formError: null, refetchOptions: true }
        : { fieldErrors: [], formError: "A selected item is no longer available. Check the selections and try again.", refetchOptions: true };
    }
    case "STONE_MASTER_CHANGED":
      return { fieldErrors: [], formError: "This record was changed by someone else. Cancel to load the latest version, then edit again.", stale: true };
    case "STONE_MASTER_NOT_FOUND":
      return { fieldErrors: [], formError: "This record no longer exists.", notFound: true };
    case "VALIDATION_ERROR": {
      const mapped = fieldErrors.flatMap((entry): FieldError[] => {
        const name = (REFERENCE_FIELD[entry.path] ?? (["code", "name", "hsn"].includes(entry.path) ? entry.path : undefined)) as keyof StoneFormValues | undefined;
        const message = entry.path === "code" && entry.code === "too_big"
          ? "The built code is longer than 60 characters"
          : entry.code === "required" ? "This part is required" : "Check this field";
        return name ? [{ name, message }] : [];
      });
      return { fieldErrors: mapped, formError: mapped.length < fieldErrors.length || fieldErrors.length === 0 ? "Some details couldn't be saved. Check the form and try again." : null };
    }
    case "PERMISSION_DENIED":
      return { fieldErrors: [], formError: "You don't have permission to do this. Nothing was saved.", recheckAccess: true };
    default:
      if (isCallerLicenseCode(domainCode)) return { fieldErrors: [], formError: "Your license doesn't allow this right now. Nothing was saved." };
      if (domainCode === "UNAUTHORIZED") return { fieldErrors: [], formError: "Your session has ended. Sign in again." };
      return { fieldErrors: [], formError: "Couldn't save. Try again." };
  }
}

export type DeleteOutcome = { kind: "gone"; message: string } | { kind: "dialog"; message: string; recheckAccess?: boolean };

export function mapDeleteError(error: unknown, singular: string): DeleteOutcome {
  const { domainCode } = readDomainError(error);
  if (domainCode === "STONE_MASTER_NOT_FOUND") return { kind: "gone", message: "This record was already deleted." };
  if (domainCode === "STONE_MASTER_IN_USE") return { kind: "dialog", message: `This ${singular.toLowerCase()} is used by other records. Turn off Active instead.` };
  if (domainCode === "PERMISSION_DENIED") return { kind: "dialog", message: "You don't have permission to delete this.", recheckAccess: true };
  if (isCallerLicenseCode(domainCode)) return { kind: "dialog", message: "Your license doesn't allow this right now. Nothing was deleted." };
  if (domainCode === "UNAUTHORIZED") return { kind: "dialog", message: "Your session has ended. Sign in again." };
  return { kind: "dialog", message: "Couldn't delete. Try again." };
}

export function loadErrorMessage(error: unknown, subject: string): string {
  const { domainCode } = readDomainError(error);
  if (domainCode === "STONE_MASTER_NOT_FOUND") return "This record no longer exists.";
  if (domainCode === "PERMISSION_DENIED") return "You don't have permission to view Stone Master.";
  if (isCallerLicenseCode(domainCode)) return `Your license doesn't allow loading ${subject} right now.`;
  if (domainCode === "UNAUTHORIZED") return "Your session has ended. Sign in again.";
  return `Couldn't load ${subject}.`;
}

export const isPermissionDenied = (error: unknown) => readDomainError(error).domainCode === "PERMISSION_DENIED";
export const isNotFound = (error: unknown) => readDomainError(error).domainCode === "STONE_MASTER_NOT_FOUND";
