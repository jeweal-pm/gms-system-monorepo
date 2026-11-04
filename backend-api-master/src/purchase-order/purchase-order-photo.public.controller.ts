import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { PublicRoute } from "../internal-auth/public.decorator";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { streamPhoto, uploadPhoto, type PhotoEndpoint } from "../quotation/quotation-photo.public.controller";
import { createPhotoStore } from "../quotation/quotation-photo.storage";
import { PURCHASE_ORDER_PHOTO_SOURCE, purchaseOrderErrors, purchaseOrderPhotoInvalid } from "./purchase-order.service";

/** purchase-order SA revision 1 (SA-PO-11): routes, storage module and `stored_files` source of line photos. */
export const PURCHASE_ORDER_PHOTO_ROUTE = "/api/v1/purchase-order/photos";
export const PURCHASE_ORDER_PHOTO_MODULE = "purchase-order-photo";
const store = createPhotoStore(PURCHASE_ORDER_PHOTO_MODULE);

export const purchaseOrderPhotos: PhotoEndpoint = {
  menu: "purchase-order",
  kind: PURCHASE_ORDER_PHOTO_MODULE,
  source: PURCHASE_ORDER_PHOTO_SOURCE,
  event: "purchase_order",
  store: (data, contentType) => store.store(data, contentType),
  open: (key) => store.open(key),
  invalid: purchaseOrderPhotoInvalid,
  notFound: purchaseOrderErrors.notFound,
  mapError: purchaseOrderErrors.map,
};

/**
 * Purchase Order line photo binary boundary, the Quotation photo code with its own module and grants (SA-PO-11).
 * The route middleware in main.ts has already applied live authorization and a slot of the shared limiter.
 */
@Controller("api/v1/purchase-order/photos")
@PublicRoute()
export class PurchaseOrderPhotoPublicController {
  private readonly logger = new Logger("PurchaseOrderPhoto");

  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(purchaseOrderPhotos, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(purchaseOrderPhotos, await this.auth.createContext(request), rawId, response, this.logger);
  }
}
