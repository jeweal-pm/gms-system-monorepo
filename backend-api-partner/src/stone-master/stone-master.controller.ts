import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { parseOrThrow, validationException } from "../common/errors";
import { listQuerySchema } from "../common/partner-schemas";
import { parseId, requireJson } from "../common/request";
import { requireActor } from "../internal-auth/actor";
import { isSimpleKind, isStoneKind, type StoneKind } from "./stone-master.kinds";
import { BODY_SCHEMAS, optionsQuerySchema } from "./stone-master.schemas";
import { StoneMasterService } from "./stone-master.service";

function parseKind(value: string): StoneKind {
  if (!isStoneKind(value)) throw validationException([{ path: "kind", code: "invalid" }]);
  return value;
}

function bodySchemas(kind: StoneKind) {
  return isSimpleKind(kind) ? BODY_SCHEMAS.simple : BODY_SCHEMAS[kind];
}

/**
 * Internal REST for the gateway only (SA stone-master rev 1, SA-SM-07/08/10). The global
 * ServiceTokenGuard has already authenticated the caller; `options` is declared before `:kind`.
 */
@Controller("internal/v1/stone-master")
export class StoneMasterController {
  constructor(private readonly stones: StoneMasterService) {}

  @Get("options")
  options(@Query() query: unknown) {
    return this.stones.options(parseOrThrow(optionsQuerySchema, query));
  }

  @Get(":kind")
  list(@Param("kind") kind: string, @Query() query: unknown) {
    return this.stones.list(parseKind(kind), parseOrThrow(listQuerySchema, query));
  }

  @Get(":kind/:id")
  get(@Param("kind") kind: string, @Param("id") id: string) {
    return this.stones.get(parseKind(kind), parseId(id));
  }

  @Post(":kind")
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: Request, @Param("kind") rawKind: string, @Body() body: unknown) {
    const actorId = requireActor(request);
    const kind = parseKind(rawKind);
    requireJson(request);
    return this.stones.create(kind, actorId, parseOrThrow(bodySchemas(kind).create, body));
  }

  @Put(":kind/:id")
  @HttpCode(HttpStatus.OK)
  update(@Req() request: Request, @Param("kind") rawKind: string, @Param("id") id: string, @Body() body: unknown) {
    const actorId = requireActor(request);
    const kind = parseKind(rawKind);
    const recordId = parseId(id);
    requireJson(request);
    return this.stones.update(kind, actorId, recordId, parseOrThrow(bodySchemas(kind).update, body) as { expectedUpdatedAt: string });
  }

  @Delete(":kind/:id")
  @HttpCode(HttpStatus.OK)
  delete(@Req() request: Request, @Param("kind") rawKind: string, @Param("id") id: string) {
    const actorId = requireActor(request);
    return this.stones.delete(parseKind(rawKind), actorId, parseId(id));
  }
}
