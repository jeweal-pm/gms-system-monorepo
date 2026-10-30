import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PublicRoute } from "../internal-auth/public.decorator";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { streamPhoto, uploadPhoto, type PhotoEndpoint } from "../quotation/quotation-photo.public.controller";
import { createPhotoStore } from "../quotation/quotation-photo.storage";
import { MEMO_RECEIVE_PHOTO_SOURCE, memoReceiveErrors, memoReceivePhotoInvalid } from "./memo-receive.service";

/** memo-receive SA revision 2 (SA-MR-15/16): routes, storage module and `stored_files` source of line photos. */
export const MEMO_RECEIVE_PHOTO_ROUTE = "/api/v1/memo-receive/photos";
export const MEMO_RECEIVE_PHOTO_MODULE = "memo-receive-photo";
const store = createPhotoStore(MEMO_RECEIVE_PHOTO_MODULE);

export const memoReceivePhotos: PhotoEndpoint = {
  menu: "memo-receive",
  kind: MEMO_RECEIVE_PHOTO_MODULE,
  source: MEMO_RECEIVE_PHOTO_SOURCE,
  event: "memo_receive",
  store: (data, contentType) => store.store(data, contentType),
  open: (key) => store.open(key),
  invalid: memoReceivePhotoInvalid,
  notFound: memoReceiveErrors.notFound,
  mapError: memoReceiveErrors.map,
};

/**
 * Memo Receive line photo binary boundary, the Quotation photo code with its own module and grants (SA-MR-15/16).
 * The route middleware in main.ts has already applied live authorization and a slot of the shared limiter.
 */
@Controller("api/v1/memo-receive/photos")
@PublicRoute()
export class MemoReceivePhotoPublicController {
  private readonly logger = new Logger("MemoReceivePhoto");

  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(memoReceivePhotos, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(memoReceivePhotos, await this.auth.createContext(request), rawId, response, this.logger);
  }
}
