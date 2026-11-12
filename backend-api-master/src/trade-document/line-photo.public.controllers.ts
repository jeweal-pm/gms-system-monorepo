import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PublicRoute } from "../internal-auth/public.decorator";
import type { MasterMenu } from "../master/authorization";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { purchaseErrors } from "../purchase/purchase.errors";
import { streamPhoto, uploadPhoto, type PhotoEndpoint } from "../quotation/quotation-photo.public.controller";
import { createPhotoStore } from "../quotation/quotation-photo.storage";
import type { DocumentErrors } from "./document-errors";
import { LINE_PHOTO_DOCUMENTS, linePhotoInvalid, type LinePhotoDocument } from "./line-photos";
import { memoOutReturnErrors } from "./memo-out-return.service";
import { memoOutErrors } from "./memo-out.service";
import { memoReturnErrors } from "./memo-return.service";
import { reserveErrors } from "./reserve.service";

/**
 * ADR-0048 (owner 2026-11-11): line photo upload / read for Reserve, Memo Return, Memo Out, Memo Out Return and
 * Purchase — the Purchase Order photo boundary (SA-PO-11) with each document's own module, source and grants. The
 * route middleware in main.ts has already applied live authorization and a slot of the shared limiter.
 */
function photoEndpoint(document: LinePhotoDocument, errors: Pick<DocumentErrors, "notFound" | "map">): PhotoEndpoint {
  const store = createPhotoStore(document.module);
  return {
    menu: document.menu as MasterMenu,
    kind: document.module,
    source: document.source,
    event: document.event,
    store: (data, contentType) => store.store(data, contentType),
    open: (key) => store.open(key),
    invalid: linePhotoInvalid(document),
    notFound: errors.notFound,
    mapError: errors.map,
  };
}

export const linePhotoEndpoints = {
  reserve: photoEndpoint(LINE_PHOTO_DOCUMENTS.reserve, reserveErrors),
  memoReturn: photoEndpoint(LINE_PHOTO_DOCUMENTS.memoReturn, memoReturnErrors),
  memoOut: photoEndpoint(LINE_PHOTO_DOCUMENTS.memoOut, memoOutErrors),
  memoOutReturn: photoEndpoint(LINE_PHOTO_DOCUMENTS.memoOutReturn, memoOutReturnErrors),
  purchase: photoEndpoint(LINE_PHOTO_DOCUMENTS.purchase, purchaseErrors),
} as const;

@Controller("api/v1/reserve/photos")
@PublicRoute()
export class ReservePhotoPublicController {
  private readonly logger = new Logger("ReservePhoto");
  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(linePhotoEndpoints.reserve, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(linePhotoEndpoints.reserve, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

@Controller("api/v1/memo-return/photos")
@PublicRoute()
export class MemoReturnPhotoPublicController {
  private readonly logger = new Logger("MemoReturnPhoto");
  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(linePhotoEndpoints.memoReturn, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(linePhotoEndpoints.memoReturn, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

@Controller("api/v1/memo-out/photos")
@PublicRoute()
export class MemoOutPhotoPublicController {
  private readonly logger = new Logger("MemoOutPhoto");
  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(linePhotoEndpoints.memoOut, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(linePhotoEndpoints.memoOut, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

@Controller("api/v1/memo-out-return/photos")
@PublicRoute()
export class MemoOutReturnPhotoPublicController {
  private readonly logger = new Logger("MemoOutReturnPhoto");
  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(linePhotoEndpoints.memoOutReturn, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(linePhotoEndpoints.memoOutReturn, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

@Controller("api/v1/purchase/photos")
@PublicRoute()
export class PurchasePhotoPublicController {
  private readonly logger = new Logger("PurchasePhoto");
  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(linePhotoEndpoints.purchase, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(linePhotoEndpoints.purchase, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

export const LINE_PHOTO_CONTROLLERS = [
  ReservePhotoPublicController,
  MemoReturnPhotoPublicController,
  MemoOutPhotoPublicController,
  MemoOutReturnPhotoPublicController,
  PurchasePhotoPublicController,
];
