import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseOrThrow, partnerException } from "../common/errors";
import { parseId, requireJson } from "../common/request";
import { InventoryInternalRoute, InventoryServiceTokenGuard } from "./inventory-token.guard";
import {
  allocationPutSchema,
  lineBatchSchema,
  loadableSearchSchema,
  masterDataResolveSchema,
  numberingResolveSchema,
  saleConsumptionPutSchema,
  salePrepareSchema,
  saleReferenceQuerySchema,
  saleReserveLineSearchSchema,
  stockIdIssuePutSchema,
  stockIdIssueTypeSchema,
  vendorsQuerySchema,
} from "./inventory-internal.schemas";
import { InventoryInternalService } from "./inventory-internal.service";

const ACTOR = /^[A-Za-z0-9_-]{1,64}$/;

/** `X-Actor-User-Id` is informational (audit column only, never authorization; authorization.md). */
function actorOf(request: Request): string | null {
  const value = request.headers["x-actor-user-id"];
  return typeof value === "string" && ACTOR.test(value) ? value : null;
}

/**
 * load-to-stock SA rev 1 api-contract "Master internal API" (BE-LS-004/013): `/internal/v1/inventory/*`, only for
 * backend-api-inventory with its own service token. nginx never routes `/internal`.
 */
@Controller("internal/v1/inventory")
@InventoryInternalRoute()
@UseGuards(InventoryServiceTokenGuard)
export class InventoryInternalController {
  constructor(private readonly service: InventoryInternalService) {}

  @Get("reference")
  @Header("Cache-Control", "no-store")
  reference() {
    return this.service.reference();
  }

  @Get("vendors/loadable")
  @Header("Cache-Control", "no-store")
  vendors(@Query() query: unknown) {
    return this.service.vendors(parseOrThrow(vendorsQuerySchema, query));
  }

  @Post("purchase-lines/loadable/search")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  search(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.search(parseOrThrow(loadableSearchSchema, body));
  }

  @Post("purchase-lines/batch")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  batch(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.batch(parseOrThrow(lineBatchSchema, body));
  }

  @Post("master-data/resolve")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  resolve(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.resolveMasterData(parseOrThrow(masterDataResolveSchema, body));
  }

  @Post("document-numbering/resolve")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  numbering(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.resolveNumbering(parseOrThrow(numberingResolveSchema, body));
  }

  @Put("load-allocations/:loadId")
  @Header("Cache-Control", "no-store")
  putAllocation(@Req() request: Request, @Param("loadId") loadId: string, @Body() body: unknown) {
    requireJson(request);
    const id = parseId(loadId);
    return this.service.putAllocation(id, parseOrThrow(allocationPutSchema, body), actorOf(request));
  }

  @Get("load-allocations/:loadId")
  @Header("Cache-Control", "no-store")
  getAllocation(@Param("loadId") loadId: string) {
    return this.service.getAllocation(parseId(loadId));
  }

  // ---------- stock-transfer-location ADR-0060 D6 (BE-STL-002) ----------

  /** Idempotent per (documentType, documentId, revision); an unknown document type is 404 (no such resource). */
  @Put("stock-id-issues/:documentType/:documentId")
  @Header("Cache-Control", "no-store")
  putStockIdIssue(@Req() request: Request, @Param("documentType") documentType: string, @Param("documentId") documentId: string, @Body() body: unknown) {
    requireJson(request);
    const type = stockIdIssueTypeSchema.safeParse(documentType);
    if (!type.success) throw partnerException("NOT_FOUND", HttpStatus.NOT_FOUND);
    const id = parseId(documentId);
    return this.service.issueStockIds(type.data, id, parseOrThrow(stockIdIssuePutSchema, body), actorOf(request));
  }

  // ---------- sale SA rev 1 api-contract "Master internal API" (BE-SL-002) ----------

  @Get("sale/reference")
  @Header("Cache-Control", "no-store")
  saleReference(@Query() query: unknown) {
    return this.service.saleReference(parseOrThrow(saleReferenceQuerySchema, query));
  }

  @Post("sale/reserve-lines/search")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  saleReserveLines(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.saleReserveLines(parseOrThrow(saleReserveLineSearchSchema, body));
  }

  @Post("sale/prepare")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  salePrepare(@Req() request: Request, @Body() body: unknown) {
    requireJson(request);
    return this.service.salePrepare(parseOrThrow(salePrepareSchema, body));
  }

  @Put("sale-consumptions/:saleId")
  @Header("Cache-Control", "no-store")
  putSaleConsumption(@Req() request: Request, @Param("saleId") saleId: string, @Body() body: unknown) {
    requireJson(request);
    const id = parseId(saleId);
    return this.service.putSaleConsumption(id, parseOrThrow(saleConsumptionPutSchema, body), actorOf(request));
  }

  @Get("sale-consumptions/:saleId")
  @Header("Cache-Control", "no-store")
  getSaleConsumption(@Param("saleId") saleId: string) {
    return this.service.getSaleConsumption(parseId(saleId));
  }

  @Get("purchase-lines/:id/photos")
  @Header("Cache-Control", "no-store")
  linePhotos(@Param("id") id: string) {
    return this.service.linePhotos(parseId(id));
  }

  @Get("files/:fileId/content")
  async fileContent(@Param("fileId") fileId: string, @Res() response: Response) {
    const file = await this.service.fileContent(parseId(fileId));
    response.status(200);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Length", String(file.size));
    response.setHeader("X-Content-SHA256", file.sha256);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    file.stream.on("error", () => response.destroy());
    file.stream.pipe(response);
  }
}
