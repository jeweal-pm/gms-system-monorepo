import { Controller, Get, HttpStatus, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { requireMasterGrant } from "../master/authorization";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { CompanyProfileService } from "./company-profile.service";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "./company-profile.schemas";
import { expectedVersionQuerySchema } from "./company-profile.schemas";
import { parseOrThrow } from "../common/errors";
import { unsupportedImage } from "./company-profile.errors";
import { PublicRoute } from "../internal-auth/public.decorator";

/** Public binary boundary replacing the gateway logo proxy. */
@Controller("api/v1/company-profile/logo")
@PublicRoute()
export class CompanyLogoPublicController {
  constructor(private readonly profile: CompanyProfileService, private readonly auth: MasterTrpcHandler) {}

  @Get()
  async get(@Req() request: Request, @Res() response: Response) {
    const context = await this.auth.createContext(request);
    requireMasterGrant(context, "company-profile", "VIEW", false);
    const logo = await this.profile.getLogo();
    const requested = typeof request.query.v === "string" ? request.query.v : "";
    response.setHeader("cache-control", requested !== "" && requested === logo.version ? "private, max-age=31536000, immutable" : "private, no-cache");
    response.setHeader("content-type", logo.contentType);
    response.setHeader("content-disposition", "inline");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("content-security-policy", "default-src 'none'; sandbox");
    response.status(HttpStatus.OK).end(logo.data);
  }

  @Put()
  async put(@Req() request: Request, @Query() query: unknown) {
    const context = await this.auth.createContext(request);
    const actorId = requireMasterGrant(context, "company-profile", "EDIT", true);
    const { expectedVersion } = parseOrThrow(expectedVersionQuerySchema, query);
    const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!(LOGO_TYPES as readonly string[]).includes(contentType) || !Buffer.isBuffer(request.body) || request.body.length === 0) throw unsupportedImage();
    if (request.body.length > LOGO_MAX_BYTES) throw unsupportedImage();
    return this.profile.putLogo(actorId, expectedVersion, contentType, request.body);
  }
}
