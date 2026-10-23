import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { parseOrThrow } from "../common/errors";
import { parseId, requireJson } from "../common/request";
import { requireActor } from "../internal-auth/actor";
import { createVendorBodySchema, listQuerySchema, updateVendorBodySchema } from "./vendor.schemas";
import { VendorService } from "./vendor.service";

/**
 * Internal REST for the gateway only (vendor api-contract.md "Internal REST contract"). The global
 * ServiceTokenGuard has already authenticated the caller. `options` and `next-code` are declared before `:id`.
 */
@Controller("internal/v1/vendors")
export class VendorController {
  constructor(private readonly vendors: VendorService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.vendors.list(parseOrThrow(listQuerySchema, query));
  }

  @Get("options")
  options() {
    return this.vendors.options();
  }

  /** ADR-0021: declared before `:id` so `next-code` is never parsed as an ID. */
  @Get("next-code")
  nextCode() {
    return this.vendors.nextCode();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.vendors.get(parseId(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: Request, @Body() body: unknown) {
    const actorId = requireActor(request);
    requireJson(request);
    return this.vendors.create(actorId, parseOrThrow(createVendorBodySchema, body));
  }

  @Put(":id")
  @HttpCode(HttpStatus.OK)
  update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const actorId = requireActor(request);
    const vendorId = parseId(id);
    requireJson(request);
    return this.vendors.update(actorId, vendorId, parseOrThrow(updateVendorBodySchema, body));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  delete(@Req() request: Request, @Param("id") id: string) {
    const actorId = requireActor(request);
    return this.vendors.delete(actorId, parseId(id));
  }
}
