import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseOrThrow } from "../common/errors";
import { requireJson } from "../common/request";
import { requireActor } from "../internal-auth/actor";
import { unsupportedImage } from "./company-profile.errors";
import { expectedVersionQuerySchema, saveCompanyProfileBodySchema } from "./company-profile.schemas";
import { CompanyProfileService } from "./company-profile.service";

/**
 * Internal REST for the gateway only (company-profile api-contract.md "Internal REST"). The global
 * ServiceTokenGuard has authenticated the caller. The logo PUT body is raw bytes parsed by the
 * route-specific `express.raw` in main.ts (≤ 10 MB, JPEG/PNG types only).
 */
@Controller("internal/v1/company-profile")
export class CompanyProfileController {
  constructor(private readonly companyProfile: CompanyProfileService) {}

  @Get()
  get() {
    return this.companyProfile.get();
  }

  @Get("options")
  options() {
    return this.companyProfile.options();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  save(@Req() request: Request, @Body() body: unknown) {
    const actorId = requireActor(request);
    requireJson(request);
    return this.companyProfile.save(actorId, parseOrThrow(saveCompanyProfileBodySchema, body));
  }

  @Get("logo")
  async logo(@Res() response: Response) {
    const logo = await this.companyProfile.getLogo();
    response.setHeader("content-type", logo.contentType);
    response.setHeader("x-logo-version", logo.version);
    response.setHeader("x-content-type-options", "nosniff");
    response.status(HttpStatus.OK).end(logo.data);
  }

  @Put("logo")
  @HttpCode(HttpStatus.OK)
  putLogo(@Req() request: Request, @Query() query: unknown) {
    const actorId = requireActor(request);
    const { expectedVersion } = parseOrThrow(expectedVersionQuerySchema, query);
    const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) throw unsupportedImage();
    return this.companyProfile.putLogo(actorId, expectedVersion, contentType, body);
  }

  @Delete("logo")
  @HttpCode(HttpStatus.OK)
  removeLogo(@Req() request: Request, @Query() query: unknown) {
    const actorId = requireActor(request);
    const { expectedVersion } = parseOrThrow(expectedVersionQuerySchema, query);
    return this.companyProfile.removeLogo(actorId, expectedVersion);
  }
}
