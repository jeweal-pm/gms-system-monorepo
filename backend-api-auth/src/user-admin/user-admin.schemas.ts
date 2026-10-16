import { z } from "zod";
import { passwordSchema } from "../auth/password-policy";
import { usernameSchema } from "../auth/username-policy";
import { MAX_GRANTS_PER_USER } from "../permission/catalog";

export const userIdSchema = z.string().min(1).max(64);

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

const locationKeysSchema = z.array(z.string().max(64)).min(1).max(20);
const permissionsSchema = z.array(z.string().max(80)).max(MAX_GRANTS_PER_USER);
const nameSchema = z.string().trim().min(1).max(120);

/** userAdmin.create input (api-contract.md, SA rev 2). `photo` is still deferred. */
export const createUserInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  name: nameSchema,
  phone: phoneSchema.nullable(),
  locationKeys: locationKeysSchema,
  active: z.boolean(),
  permissions: permissionsSchema,
}).strict();

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

/**
 * userAdmin.update input (SA rev 2). Omitted = unchanged; sets replace whole sets. `username`
 * may be echoed but never changed (USERNAME_IMMUTABLE). `password: ""` means "unchanged".
 * `expectedUpdatedAt` is optional; when sent, a mismatch answers USER_CHANGED.
 */
export const updateUserInputSchema = z.object({
  expectedUpdatedAt: z.iso.datetime().optional(),
  username: usernameSchema.optional(),
  password: z.preprocess((value) => (value === "" ? undefined : value), passwordSchema.optional()),
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  locationKeys: locationKeysSchema.optional(),
  active: z.boolean().optional(),
  permissions: permissionsSchema.optional(),
}).strict();

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
