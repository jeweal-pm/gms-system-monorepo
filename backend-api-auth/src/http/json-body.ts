import express, { type RequestHandler } from "express";

/** Request body limit of every auth JSON route (tRPC and the rest). */
export const AUTH_JSON_LIMIT = "32kb";

/**
 * The auth JSON body parser (Express `json`, i.e. body-parser). Compressed bodies stay accepted as before; the process
 * must resolve body-parser ≥ 2.4.0 (INV-20261110-001, GHSA-27r3-jxmh-p828: a compressed body with trailing bytes could
 * raise an uncaught decompression error), pinned by the root `pnpm-workspace.yaml` override.
 */
export function authJsonBody(): RequestHandler {
  return express.json({ limit: AUTH_JSON_LIMIT });
}
