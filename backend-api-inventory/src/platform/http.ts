import { randomUUID } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import type { z } from "zod";
import { AppError, errorBody, isDbUnavailable, MAX_FIELD_ERRORS, validationError, type FieldError } from "./errors";
import { authenticate, csrfAllowed, type AuthDeps, type Principal } from "./auth/principal";
import type { Logger } from "./logger";

export type AppEnv = { Variables: { requestId: string; principal: Principal } };
export type AppContext = Context<AppEnv>;

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

/** Request id (propagated from nginx when well-formed), `Cache-Control: no-store`, one access log line per request. */
export function requestContext(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header("x-request-id");
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    c.set("requestId", requestId);
    const started = performance.now();
    await next();
    c.header("x-request-id", requestId);
    if (!c.res.headers.has("cache-control")) c.header("Cache-Control", "no-store");
    const principal = c.get("principal") as Principal | undefined;
    logger.info({ event: "http.request", requestId, method: c.req.method, route: c.req.routePath, status: c.res.status, durationMs: Math.round(performance.now() - started), userId: principal?.userId });
  };
}

export function errorResponse(c: Context, error: unknown, logger: Logger): Response {
  const requestId = (c.get("requestId") as string | undefined) ?? randomUUID();
  let appError: AppError;
  if (error instanceof AppError) appError = error;
  else if (isDbUnavailable(error)) appError = new AppError(503, "DB_UNAVAILABLE", undefined, { "Retry-After": "5" });
  else {
    logger.error({ event: "http.unhandled_error", requestId, errorName: error instanceof Error ? error.name : typeof error });
    appError = new AppError(500, "INTERNAL_ERROR");
  }
  if (appError.status >= 500) logger.error({ event: "http.error", requestId, code: appError.code, status: appError.status });
  else logger.warn({ event: "http.refused", requestId, code: appError.code, status: appError.status });
  const response = c.json(errorBody(appError.code, requestId, appError.details), appError.status as 400);
  for (const [key, value] of Object.entries(appError.headers ?? {})) response.headers.set(key, value);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export type SecurityDeps = { auth: AuthDeps; trustedOrigins: ReadonlySet<string> };

/** Steps 1–4 of the authorization chain: identity, live authorization, license, then CSRF on mutations. */
export function requireSession(deps: SecurityDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const principal = await authenticate(c.req.header("cookie"), deps.auth);
    c.set("principal", principal);
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !csrfAllowed({ origin: c.req.header("origin"), secFetchSite: c.req.header("sec-fetch-site") }, deps.trustedOrigins)) {
      throw new AppError(403, "CSRF_INVALID");
    }
    await next();
  };
}

export function zodFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.slice(0, MAX_FIELD_ERRORS).map((issue) => {
    const params = (issue as { params?: { code?: unknown; params?: unknown } }).params;
    const code = typeof params?.code === "string" ? params.code : issue.code === "invalid_type" && (issue as { input?: unknown }).input === undefined ? "required" : issue.code;
    const extra = params?.params && typeof params.params === "object" ? { params: params.params as Record<string, string | number> } : {};
    return { path: issue.path.map(String).join(".").slice(0, 128) || "(root)", code: code.slice(0, 64), ...extra };
  });
}

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(zodFieldErrors(parsed.error));
  return parsed.data;
}

/** JSON bodies only (else 415); malformed → 400 BAD_REQUEST; then strict Zod → 422 VALIDATION_ERROR. */
export async function jsonBody<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.output<S>> {
  const type = c.req.header("content-type") ?? "";
  if (!/^application\/json(\s*;|$)/i.test(type)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE");
  let body: unknown;
  try { body = await c.req.json(); } catch { throw new AppError(400, "BAD_REQUEST"); }
  return parse(schema, body);
}

export function queryObject(c: AppContext): Record<string, string> {
  const all = c.req.queries();
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(all)) {
    if (values.length !== 1) throw validationError([{ path: key, code: "invalid" }]);
    result[key] = values[0];
  }
  return result;
}
