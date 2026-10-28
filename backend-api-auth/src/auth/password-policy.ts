import { z } from "zod";

export const passwordSchema = z.string()
  .min(4, "Password must be at least 4 characters")
  .max(64, "Password must be at most 64 characters")
