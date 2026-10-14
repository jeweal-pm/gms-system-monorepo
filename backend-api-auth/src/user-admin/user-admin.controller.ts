import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserAdminService } from "./user-admin.service";

/**
 * Internal endpoints for the gateway only (cookie forwarded). Every handler re-validates the
 * session itself; user-admin handlers also require a usable license and Super Admin.
 */
@Controller("internal/v1")
export class UserAdminController {
  constructor(private readonly userAdmin: UserAdminService) {}

  @Get("permission/catalog")
  async catalog(@Req() request: Request) {
    await this.userAdmin.requireSession(request);
    return this.userAdmin.catalog();
  }

  @Get("user-admin/location-options")
  async locationOptions(@Req() request: Request) {
    await this.userAdmin.requireSuperAdmin(request);
    return this.userAdmin.locationOptions();
  }

  @Get("user-admin/users")
  async list(@Req() request: Request) {
    await this.userAdmin.requireSuperAdmin(request);
    return this.userAdmin.list();
  }

  @Post("user-admin/users")
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() request: Request, @Body() body: unknown) {
    const actor = await this.userAdmin.requireSuperAdmin(request);
    return this.userAdmin.create(actor, body);
  }

  @Get("user-admin/users/:id")
  async get(@Req() request: Request, @Param("id") id: string) {
    await this.userAdmin.requireSuperAdmin(request);
    return this.userAdmin.get(id);
  }

  @Delete("user-admin/users/:id")
  @HttpCode(HttpStatus.OK)
  async delete(@Req() request: Request, @Param("id") id: string) {
    const actor = await this.userAdmin.requireSuperAdmin(request);
    return this.userAdmin.delete(actor, id);
  }
}
