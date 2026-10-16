import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { parseOrThrow } from "../common/errors";
import { parseId, requireJson } from "../common/request";
import { requireActor } from "../internal-auth/actor";
import { createCustomerBodySchema, listQuerySchema, updateCustomerBodySchema } from "./customer.schemas";
import { CustomerService } from "./customer.service";

/**
 * Internal REST for the gateway only (api-contract.md "Internal REST contract"). The global
 * ServiceTokenGuard has already authenticated the caller. `options` and `next-code` are declared before `:id`.
 */
@Controller("internal/v1/customers")
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.customers.list(parseOrThrow(listQuerySchema, query));
  }

  @Get("options")
  options() {
    return this.customers.options();
  }

  /** ADR-0021: declared before `:id` so `next-code` is never parsed as an ID. */
  @Get("next-code")
  nextCode() {
    return this.customers.nextCode();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.customers.get(parseId(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: Request, @Body() body: unknown) {
    const actorId = requireActor(request);
    requireJson(request);
    return this.customers.create(actorId, parseOrThrow(createCustomerBodySchema, body));
  }

  @Put(":id")
  @HttpCode(HttpStatus.OK)
  update(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const actorId = requireActor(request);
    const customerId = parseId(id);
    requireJson(request);
    return this.customers.update(actorId, customerId, parseOrThrow(updateCustomerBodySchema, body));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  delete(@Req() request: Request, @Param("id") id: string) {
    const actorId = requireActor(request);
    return this.customers.delete(actorId, parseId(id));
  }
}
