import { HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import { partnerException, validationException } from "./errors";
import { entityIdSchema } from "./partner-schemas";

/** Path `:id` must be a UUID → otherwise `400 {path:"id", code:"invalid_format"}`. */
export function parseId(id: string): string {
  const parsed = entityIdSchema.safeParse(id);
  if (!parsed.success) throw validationException([{ path: "id", code: "invalid_format" }]);
  return parsed.data;
}

/** POST/PUT bodies must be JSON → otherwise `415 UNSUPPORTED_MEDIA_TYPE`. */
export function requireJson(request: Request) {
  if (!request.is("application/json")) throw partnerException("UNSUPPORTED_MEDIA_TYPE", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
}
