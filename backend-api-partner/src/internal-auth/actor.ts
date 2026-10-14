import type { Request } from "express";
import { validationException } from "../common/errors";

const ACTOR_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** `X-Actor-User-Id` is required on mutations and trusted only after the token guard (authorization.md). */
export function requireActor(request: Request): string {
  const value = request.headers["x-actor-user-id"];
  if (typeof value !== "string" || !ACTOR_PATTERN.test(value)) {
    throw validationException([{ path: "(header).x-actor-user-id", code: "invalid" }]);
  }
  return value;
}
