import { z } from "zod";

/** user-permission SA revision 2 contract shapes (api-contract.md, ADR-0020). */
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "APPROVE", "PRICE", "PRINT", "EXCEL"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
/** 64 leaves x 9 actions (catalog bound, ADR-0016 / ADR-0020 capacity). */
export const MAX_GRANTS = 576;
export const PERMISSION_KEY_PATTERN = /^[a-z0-9-]{1,64}:(VIEW|ADD|EDIT|DELETE|CANCEL|APPROVE|PRICE|PRINT|EXCEL)$/;

const permissionActionSchema = z.enum(PERMISSION_ACTIONS);

/** ADR-0020 §1 username rule: trimmed, lowercased, 3..64 of [a-z0-9._@+-]. */
export const usernameSchema = z.string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().min(3).max(64).regex(/^[a-z0-9._@+-]+$/));

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

// ---- inputs ----

export const userIdInputSchema = z.object({ id: z.string().min(1).max(64) }).strict();

const passwordInputSchema = z.string().min(4).max(64);
const locationKeysInputSchema = z.array(z.string().min(1).max(64)).min(1).max(20);
const permissionsInputSchema = z.array(z.string().max(80)).max(MAX_GRANTS);

/** `photo` is still deferred; sending it fails strict validation (VALIDATION_ERROR). */
export const createUserInputSchema = z.object({
  username: usernameSchema,
  password: passwordInputSchema,
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema.nullable(),
  locationKeys: locationKeysInputSchema,
  active: z.boolean(),
  permissions: permissionsInputSchema,
}).strict();

/**
 * Omitted = unchanged. `username` may be echoed but never changed (auth → USERNAME_IMMUTABLE).
 * `password: ""` = unchanged. Super Admin targets accept only name/phone/locationKeys
 * (auth → SUPER_ADMIN_LOCKED). `expectedUpdatedAt` optional; mismatch → USER_CHANGED.
 */
export const updateUserInputSchema = z.object({
  id: z.string().min(1).max(64),
  expectedUpdatedAt: z.iso.datetime().optional(),
  username: usernameSchema.optional(),
  password: z.preprocess((value) => (value === "" ? undefined : value), passwordInputSchema.optional()),
  name: z.string().trim().min(1).max(120).optional(),
  phone: phoneSchema.nullable().optional(),
  locationKeys: locationKeysInputSchema.optional(),
  active: z.boolean().optional(),
  permissions: permissionsInputSchema.optional(),
}).strict();

// ---- outputs (validated; unknown upstream fields are stripped) ----

export type CatalogNode = {
  key: string;
  label: string;
  kind: "section" | "group" | "leaf";
  actions?: PermissionAction[];
  children?: CatalogNode[];
};

const catalogNodeSchema: z.ZodType<CatalogNode> = z.lazy(() => z.object({
  key: z.string().max(64),
  label: z.string().max(120),
  kind: z.enum(["section", "group", "leaf"]),
  actions: z.array(permissionActionSchema).max(PERMISSION_ACTIONS.length).optional(),
  children: z.array(catalogNodeSchema).max(64).optional(),
}));

export const catalogOutputSchema = z.object({
  version: z.number().int(),
  actions: z.array(permissionActionSchema).max(PERMISSION_ACTIONS.length),
  nodes: z.array(catalogNodeSchema).max(64),
  applicableCount: z.number().int().nonnegative(),
});

export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  isSuperAdmin: z.boolean(),
  active: z.boolean(),
  hasPhoto: z.boolean(),
  updatedAt: z.string(),
});

export const userListOutputSchema = z.object({
  items: z.array(userListItemSchema).max(600),
  usage: z.object({ used: z.number().int().nonnegative(), limit: z.number().int().nonnegative() }),
});

export const userDetailOutputSchema = userListItemSchema.extend({
  phone: phoneSchema.nullable(),
  locationKeys: z.array(z.string()).max(20),
  permissions: z.union([z.literal("ALL"), z.array(z.string()).max(MAX_GRANTS)]),
  photoVersion: z.string().nullable(),
  readOnly: z.boolean(),
});

export const userMutationOutputSchema = z.object({ id: z.string(), updatedAt: z.string() });

export const deleteOutputSchema = z.object({ ok: z.literal(true) });

export const locationOptionsOutputSchema = z.object({
  items: z.array(z.object({ key: z.string(), label: z.string() })).max(50),
});
