import { z } from "zod";
import { passwordSchema } from "../auth/password-policy";
import { MAX_GRANTS_PER_USER } from "../permission/catalog";

export const userIdSchema = z.string().min(1).max(64);

export const phoneSchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
}).strict();

/** userAdmin.create input (api-contract.md). `photo` is not accepted in the first slice. */
export const createUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: passwordSchema,
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema.nullable(),
  locationKeys: z.array(z.string().max(64)).min(1).max(20),
  active: z.boolean(),
  permissions: z.array(z.string().max(80)).max(MAX_GRANTS_PER_USER),
}).strict();

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
