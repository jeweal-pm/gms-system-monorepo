import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { parseOrThrow, partnerException, validationException } from "../common/errors";
import { requireActor } from "../internal-auth/actor";
import { createCustomerBodySchema, customerIdSchema, listQuerySchema, updateCustomerBodySchema } from "./customer.schemas";
import { CustomerService } from "./customer.service";

function parseId(id: string): string {
  const parsed = customerIdSchema.safeParse(id);
  if (!parsed.success) throw validationException([{ path: "id", code: "invalid_format" }]);
  return parsed.data;
}

function requireJson(request: Request) {
  if (!request.is("application/json")) throw partnerException("UNSUPPORTED_MEDIA_TYPE", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
}

/**
 * Internal REST for the gateway only (api-contract.md "Internal REST contract"). The global
 * ServiceTokenGuard has already authenticated the caller. `options` is declared before `:id`.
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
