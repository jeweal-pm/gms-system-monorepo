import { z } from "zod";

/** user-permission SA revision 1 contract shapes (api-contract.md). */
export const PERMISSION_ACTIONS = ["VIEW", "ADD", "EDIT", "DELETE", "CANCEL", "PRICE"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export const MAX_GRANTS = 384;
export const PERMISSION_KEY_PATTERN = /^[a-z0-9-]{1,64}:(VIEW|ADD|EDIT|DELETE|CANCEL|PRICE)$/;

const permissionActionSchema = z.enum(PERMISSION_ACTIONS);

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

// ---- inputs ----

export const userIdInputSchema = z.object({ id: z.string().min(1).max(64) }).strict();

/** `photo` is deferred in the first slice; sending it fails strict validation (VALIDATION_ERROR). */
export const createUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(4).max(64),
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema.nullable(),
  locationKeys: z.array(z.string().min(1).max(64)).min(1).max(20),
  active: z.boolean(),
  permissions: z.array(z.string().max(80)).max(MAX_GRANTS),
}).strict();

// ---- outputs (validated; unknown upstream fields are stripped) ----

const catalogLeafSchema = z.object({
  key: z.string(),
  label: z.string(),
  actions: z.array(permissionActionSchema).max(PERMISSION_ACTIONS.length),
});

const catalogNodeSchema = z.object({
  key: z.string(),
  label: z.string(),
  actions: z.array(permissionActionSchema).max(PERMISSION_ACTIONS.length).optional(),
  children: z.array(catalogLeafSchema).max(64).optional(),
});

export const catalogOutputSchema = z.object({
  version: z.number().int(),
  nodes: z.array(catalogNodeSchema).max(64),
  applicableCount: z.number().int().nonnegative(),
});

export const userListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
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
