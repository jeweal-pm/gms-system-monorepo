import { Controller, Get, HttpStatus, Put, Req, Res } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import type { Request, Response } from "express";
import { createContext } from "./request-context";
import { companyProfileMutationOutputSchema, LOGO_MAX_BYTES, LOGO_TYPES } from "./trpc/company-profile-schemas";
import { describeError, domainError } from "./trpc/domain-error";
import { callPartner, getPartnerBinary, PARTNER_TIMEOUT_MS } from "./trpc/partner-client";
import type { TrpcContext } from "./trpc/router";

const MENU_KEY = "company-profile";
const NOT_FOUND = "COMPANY_PROFILE_NOT_FOUND";

/** Same session, licence and `menuKey:action` rules as `permittedProcedure` in the tRPC router. */
async function authorize(request: Request, action: "VIEW" | "EDIT"): Promise<TrpcContext & { session: NonNullable<TrpcContext["session"]> }> {
  const ctx = await createContext({ req: request });
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHORIZED" });
  const state = ctx.license?.state ?? "UNVERIFIABLE";
  if (state === "UNVERIFIABLE") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LICENSE_UNVERIFIABLE" });
  if (state !== "VALID" && state !== "EXPIRING" && state !== "GRACE") {
    throw new TRPCError({ code: "FORBIDDEN", message: state === "EXPIRED" ? "LICENSE_EXPIRED" : state === "REVOKED" ? "LICENSE_REVOKED" : "LICENSE_REQUIRED" });
  }
  if (!ctx.authz.isSuperAdmin && !ctx.authz.permissions.includes(`${MENU_KEY}:${action}`)) throw domainError("FORBIDDEN", "PERMISSION_DENIED");
  return { ...ctx, session: ctx.session };
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
  if (Number.isFinite(declared) && declared > maxBytes) throw domainError("PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > maxBytes) {
      request.destroy();
      throw domainError("PAYLOAD_TOO_LARGE", "PAYLOAD_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Company logo REST (company-profile SA-CP-04, BE-CP-006). Browser → Next `/api/v1` proxy → here →
 * partner internal. CSRF: the upload must carry `Content-Type: image/jpeg|image/png`, which a
 * cross-site page cannot send without a CORS preflight (the gateway allows no CORS); tRPC
 * mutations keep their own JSON-only rule.
 */
@Controller("api/v1/company-profile/logo")
export class CompanyProfileLogoController {
  @Get()
  async get(@Req() request: Request, @Res() response: Response) {
    try {
      const ctx = await authorize(request, "VIEW");
      const logo = await getPartnerBinary({
        path: "/internal/v1/company-profile/logo", route: "GET /company-profile/logo", actorId: ctx.session.user.id, maxBytes: LOGO_MAX_BYTES, notFoundCode: "COMPANY_LOGO_NOT_FOUND",
      });
      if (!(LOGO_TYPES as readonly string[]).includes(logo.contentType)) throw domainError("SERVICE_UNAVAILABLE", "PARTNER_UNAVAILABLE");
      const requested = typeof request.query.v === "string" ? request.query.v : "";
      // Versioned URLs never change content, so the browser may keep them; others revalidate.
      response.setHeader("cache-control", requested !== "" && requested === logo.version ? "private, max-age=31536000, immutable" : "private, no-cache");
      response.setHeader("content-type", logo.contentType);
      response.setHeader("content-disposition", "inline");
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("content-security-policy", "default-src 'none'; sandbox");
      response.status(HttpStatus.OK).end(logo.data);
    } catch (error) {
      sendError(response, error);
    }
  }

  @Put()
  async put(@Req() request: Request, @Res() response: Response) {
    try {
      const ctx = await authorize(request, "EDIT");
      const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!(LOGO_TYPES as readonly string[]).includes(contentType)) throw domainError("UNSUPPORTED_MEDIA_TYPE", "UNSUPPORTED_MEDIA_TYPE");
      const expected = typeof request.query.expectedVersion === "string" && /^\d{1,9}$/.test(request.query.expectedVersion) ? Number(request.query.expectedVersion) : NaN;
      if (!Number.isInteger(expected) || expected < 1) throw domainError("BAD_REQUEST", "VALIDATION_ERROR", [{ path: "expectedVersion", code: "invalid" }]);
      const data = await readBody(request, LOGO_MAX_BYTES);
      if (data.length === 0) throw domainError("UNSUPPORTED_MEDIA_TYPE", "UNSUPPORTED_MEDIA_TYPE");
      const result = await callPartner({
        method: "PUT", path: `/internal/v1/company-profile/logo?expectedVersion=${expected}`, route: "PUT /company-profile/logo", timeoutMs: PARTNER_TIMEOUT_MS.write,
        actorId: ctx.session.user.id, responseSchema: companyProfileMutationOutputSchema, notFoundCode: NOT_FOUND, raw: { data, contentType },
      });
      response.status(HttpStatus.OK).json(result);
    } catch (error) {
      sendError(response, error);
    }
  }
}
