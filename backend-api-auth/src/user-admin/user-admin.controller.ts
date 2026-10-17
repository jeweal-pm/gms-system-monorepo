import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { userAdminException } from "./user-admin.errors";
import { UserAdminService } from "./user-admin.service";

/**
 * Internal endpoints for the gateway only (cookie forwarded). Every handler re-validates the
 * session itself; user-admin handlers also require a usable license and `user-and-permission:<action>`
 * (Super Admin passes; delegated-admin.md DA-01).
 */
@Controller("internal/v1")
export class UserAdminController {
  constructor(private readonly userAdmin: UserAdminService) {}

  @Get("permission/catalog")
  async catalog(@Req() request: Request) {
    await this.userAdmin.requireAccess(request, "VIEW");
    return this.userAdmin.catalog();
  }

  @Get("user-admin/location-options")
  async locationOptions(@Req() request: Request) {
    await this.userAdmin.requireAccess(request, "VIEW");
    return this.userAdmin.locationOptions();
  }

  @Get("user-admin/users")
  async list(@Req() request: Request) {
    await this.userAdmin.requireAccess(request, "VIEW");
    return this.userAdmin.list();
  }

  @Post("user-admin/users")
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    const actor = await this.userAdmin.requireAccess(request, "ADD");
    return this.userAdmin.create(actor, body);
  }

  @Get("user-admin/users/:id")
  async get(@Req() request: Request, @Param("id") id: string) {
    const actor = await this.userAdmin.requireAccess(request, "VIEW");
    return this.userAdmin.get(actor, id);
  }

  @Patch("user-admin/users/:id")
  @HttpCode(HttpStatus.OK)
  async update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const actor = await this.userAdmin.requireAccess(request, "EDIT");
    return this.userAdmin.update(actor, id, body);
  }

  @Delete("user-admin/users/:id")
  @HttpCode(HttpStatus.OK)
  async delete(@Req() request: Request, @Param("id") id: string) {
    const actor = await this.userAdmin.requireAccess(request, "DELETE");
    return this.userAdmin.delete(actor, id);
  }

  /** user-photo.md PH-04: raw image bytes; `x-photo-version` lets the gateway answer `?v=` caching. */
  @Get("user-admin/users/:id/photo")
  async photo(@Req() request: Request, @Param("id") id: string, @Res() response: Response) {
    await this.userAdmin.requireAccess(request, "VIEW");
    const photo = await this.userAdmin.getPhoto(id);
    response.setHeader("content-type", photo.contentType);
    response.setHeader("x-photo-version", photo.version);
    response.setHeader("x-content-type-options", "nosniff");
    response.status(HttpStatus.OK).end(photo.data);
  }

  /** Body parsed by the photo-only `express.raw` in main.ts (≤ 5 MB, JPEG/PNG); anything else is 415. */
  @Put("user-admin/users/:id/photo")
  @HttpCode(HttpStatus.OK)
  async putPhoto(@Req() request: Request, @Param("id") id: string) {
    const actor = await this.userAdmin.requireAccess(request, "EDIT");
    const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const body: unknown = request.body;
    if (!Buffer.isBuffer(body)) throw userAdminException("PHOTO_TYPE_NOT_ALLOWED", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    return this.userAdmin.putPhoto(actor, id, contentType, body);
  }

  @Delete("user-admin/users/:id/photo")
  @HttpCode(HttpStatus.OK)
  async removePhoto(@Req() request: Request, @Param("id") id: string) {
    const actor = await this.userAdmin.requireAccess(request, "EDIT");
    return this.userAdmin.removePhoto(actor, id);
  }
}
