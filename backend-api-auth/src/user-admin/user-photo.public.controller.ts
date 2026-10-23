import { Controller, Get, HttpStatus, Param, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "./photo-storage";
import { userAdminException } from "./user-admin.errors";
import { UserAdminService } from "./user-admin.service";
import { verifyAuthTrpcCsrf } from "../trpc/auth-trpc.csrf";

/** Public binary boundary replacing the gateway photo proxy; authorization stays in auth. */
@Controller("api/v1/user-admin/users/:id/photo")
export class UserPhotoPublicController {
  constructor(private readonly userAdmin: UserAdminService) {}

  @Get()
  async get(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    await this.userAdmin.requireAccess(request, "VIEW");
    const photo = await this.userAdmin.getPhoto(id);
    const requested = typeof request.query.v === "string" ? request.query.v : "";
    response.setHeader("cache-control", requested !== "" && requested === photo.version ? "private, max-age=31536000, immutable" : "private, no-cache");
    response.setHeader("content-type", photo.contentType);
    response.setHeader("content-disposition", "inline");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("content-security-policy", "default-src 'none'; sandbox");
    response.status(HttpStatus.OK).end(photo.data);
  }

  @Put()
  async put(@Req() request: Request, @Param("id") id: string) {
    if (!verifyAuthTrpcCsrf(request)) throw userAdminException("CSRF_INVALID", HttpStatus.FORBIDDEN);
    const actor = await this.userAdmin.requireAccess(request, "EDIT");
    const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (!(PHOTO_TYPES as readonly string[]).includes(contentType)) throw userAdminException("PHOTO_TYPE_NOT_ALLOWED", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    if (!Buffer.isBuffer(request.body) || request.body.length === 0 || request.body.length > PHOTO_MAX_BYTES) {
      throw userAdminException(request.body?.length > PHOTO_MAX_BYTES ? "PHOTO_TOO_LARGE" : "PHOTO_TYPE_NOT_ALLOWED", request.body?.length > PHOTO_MAX_BYTES ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
    return this.userAdmin.putPhoto(actor, id, contentType, request.body);
  }
}
