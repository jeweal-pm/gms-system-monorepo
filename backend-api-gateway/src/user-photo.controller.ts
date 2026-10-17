import { Controller, Get, HttpStatus, Param, Put, Req, Res } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { Request, Response } from "express";
import { createContext } from "./request-context";
import { AUTH_TIMEOUT_MS, callAuth, getAuthBinary } from "./trpc/auth-client";
import { describeError, domainError } from "./trpc/domain-error";
import type { TrpcContext } from "./trpc/router";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, photoUploadOutputSchema } from "./trpc/user-admin-schemas";

const MENU_KEY = "user-and-permission";
/** Same id bound as `userIdInputSchema`; also no `/` so the path cannot change. */
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Same session, licence and `menuKey:action` rules as `permittedProcedure` in the tRPC router. */
async function authorize(request: Request, action: "VIEW" | "EDIT"): Promise<TrpcContext> {
  const ctx = await createContext({ req: request });
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHORIZED" });
  const state = ctx.license?.state ?? "UNVERIFIABLE";
  if (state === "UNVERIFIABLE") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LICENSE_UNVERIFIABLE" });
  if (state !== "VALID" && state !== "EXPIRING" && state !== "GRACE") {
    throw new TRPCError({ code: "FORBIDDEN", message: state === "EXPIRED" ? "LICENSE_EXPIRED" : state === "REVOKED" ? "LICENSE_REVOKED" : "LICENSE_REQUIRED" });
  }
  if (!ctx.authz.isSuperAdmin && !ctx.authz.permissions.includes(`${MENU_KEY}:${action}`)) throw domainError("FORBIDDEN", "PERMISSION_DENIED");
  return ctx;
}

function userId(raw: string): string {
  if (!USER_ID.test(raw)) throw domainError("BAD_REQUEST", "VALIDATION_ERROR", [{ path: "id", code: "invalid" }]);
  return raw;
}

/** Gateway REST error body `{ error: { code, message } }` with the matching HTTP status; no upstream text. */
function sendError(response: Response, error: unknown) {
  const trpcError = error instanceof TRPCError ? error : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "INTERNAL_SERVER_ERROR" });
  const { domainCode } = describeError(trpcError);
  const code = domainCode ?? "INTERNAL_SERVER_ERROR";
  response.status(getHTTPStatusCodeFromError(trpcError)).json({ error: { code, message: code } });
}

/** Reads the raw request body, stopping at `maxBytes + 1` (413 without buffering more). */
async function readBody(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) throw domainError("PAYLOAD_TOO_LARGE", "PHOTO_TOO_LARGE");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      request.destroy();
      throw domainError("PAYLOAD_TOO_LARGE", "PHOTO_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * User photo REST (user-photo.md PH-04…07). Browser → Next `/api/v1` proxy → here → auth internal with
 * the caller's cookie; auth re-checks the grant and DA-03…05. CSRF: the upload must carry
 * `Content-Type: image/jpeg|image/png`, which a cross-site page cannot send without a CORS preflight
 * (the gateway allows no CORS). Removal is tRPC `userAdmin.removePhoto`.
 */
@Controller("api/v1/user-admin/users/:id/photo")
export class UserPhotoController {
  @Get()
  async get(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    try {
      const ctx = await authorize(request, "VIEW");
      const id = userId(rawId);
      const photo = await getAuthBinary({ cookie: ctx.cookie, path: `/internal/v1/user-admin/users/${encodeURIComponent(id)}/photo`, maxBytes: PHOTO_MAX_BYTES });
      if (!(PHOTO_TYPES as readonly string[]).includes(photo.contentType)) throw domainError("SERVICE_UNAVAILABLE", "USER_SERVICE_UNAVAILABLE");
      const requested = typeof request.query.v === "string" ? request.query.v : "";
      // Versioned URLs never change content, so the browser may keep them; others revalidate.
      response.setHeader("cache-control", requested !== "" && requested === photo.version ? "private, max-age=31536000, immutable" : "private, no-cache");
      response.setHeader("content-type", photo.contentType);
      response.setHeader("content-disposition", "inline");
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("content-security-policy", "default-src 'none'; sandbox");
      response.status(HttpStatus.OK).end(photo.data);
    } catch (error) {
      sendError(response, error);
    }
  }

  @Put()
  async put(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    try {
      const ctx = await authorize(request, "EDIT");
      const id = userId(rawId);
      const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!(PHOTO_TYPES as readonly string[]).includes(contentType)) throw domainError("UNSUPPORTED_MEDIA_TYPE", "PHOTO_TYPE_NOT_ALLOWED");
      const data = await readBody(request, PHOTO_MAX_BYTES);
      if (data.length === 0) throw domainError("UNSUPPORTED_MEDIA_TYPE", "PHOTO_TYPE_NOT_ALLOWED");
      const result = await callAuth({
        cookie: ctx.cookie, method: "PUT", path: `/internal/v1/user-admin/users/${encodeURIComponent(id)}/photo`, timeoutMs: AUTH_TIMEOUT_MS.write,
        responseSchema: photoUploadOutputSchema, raw: { data, contentType },
      });
      response.status(HttpStatus.OK).json(result);
    } catch (error) {
      sendError(response, error);
    }
  }
}
