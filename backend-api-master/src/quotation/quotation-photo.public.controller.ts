import { pipeline } from "node:stream/promises";
import { uuidV7 } from "@gms/storage";
import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseId } from "../common/request";
import { prisma } from "../database/prisma-client";
import { PublicRoute } from "../internal-auth/public.decorator";
import { requireMasterGrant, type MasterContext, type MasterMenu } from "../master/authorization";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { photoUploaderId } from "./quotation-photo.http";
import { mapQuotationError, quotationNotFound, quotationPhotoInvalid } from "./quotation.errors";
import {
  isPhotoType,
  PHOTO_MAX_BYTES,
  QUOTATION_PHOTO_SOURCE,
  openQuotationPhoto,
  signatureMatches,
  sizeGuard,
  storeQuotationPhoto,
  type PhotoStore,
} from "./quotation-photo.storage";

/** One document type's line photo binary boundary (Quotation SA-QT-10, Memo Receive SA-MR-15). */
export type PhotoEndpoint = {
  /** Grant menu: POST needs ADD or EDIT + CSRF, GET needs VIEW. */
  menu: MasterMenu;
  /** `stored_files.kind` and the storage module. */
  kind: string;
  /** `stored_files.source_type`; a GET or a save accepts only ready files of this source. */
  source: string;
  /** Log event prefix, e.g. `quotation` → `quotation.photo_uploaded`. */
  event: string;
  store: PhotoStore["store"];
  open: PhotoStore["open"];
  invalid: (path: string) => Error;
  notFound: () => Error;
  mapError: (error: unknown, operation: string) => unknown;
};

/**
 * Validates and stores one raw JPEG/PNG body (type, size, magic bytes), then writes its ready `stored_files` row.
 * The route middleware in main.ts has already applied live user authorization and a limiter slot.
 */
export async function uploadPhoto(endpoint: PhotoEndpoint, context: MasterContext, request: Request, logger: Logger) {
  const actorId = photoUploaderId(context, endpoint.menu);
  const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const body: unknown = request.body;
  if (!isPhotoType(contentType) || !Buffer.isBuffer(body) || body.length === 0 || body.length > PHOTO_MAX_BYTES || !signatureMatches(contentType, body)) {
    throw endpoint.invalid("(body)");
  }
  const stored = await endpoint.store(body, contentType);
  try {
    const id = uuidV7();
    const now = new Date();
    await prisma.storedFile.create({
      data: {
        id,
        kind: endpoint.kind,
        bucket: "files",
        objectKey: stored.key,
        filename: stored.key.split("/").at(-1)!,
        contentType,
        sizeBytes: BigInt(stored.sizeBytes),
        sha256: stored.sha256,
        status: "ready",
        sourceType: endpoint.source,
        // One ready row per (source_type, source_id) is enforced by stored_files_one_ready_source_key, so each
        // photo is its own source; the uploader is created_by.
        sourceId: id,
        createdBy: actorId,
        createdAt: now,
        readyAt: now,
      },
    });
    logger.log({ event: `${endpoint.event}.photo_uploaded`, actorId, id, sizeBytes: stored.sizeBytes });
    return { photoId: id };
  } catch (error) {
    throw endpoint.mapError(error, "photo_upload");
  }
}

/** Streams one ready photo of this endpoint's source with immutable caching and safe headers. */
export async function streamPhoto(endpoint: PhotoEndpoint, context: MasterContext, rawId: string, response: Response, logger: Logger) {
  requireMasterGrant(context, endpoint.menu, "VIEW", false);
  const id = parseId(rawId);
  const file = await prisma.storedFile.findFirst({ where: { id, sourceType: endpoint.source, status: "ready" }, select: { objectKey: true, contentType: true } });
  if (!file) throw endpoint.notFound();
  const photo = await endpoint.open(file.objectKey);
  if (!photo) throw endpoint.notFound();
  // Ids are immutable (a replaced photo gets a new id), so the bytes can be cached.
  response.setHeader("cache-control", "private, max-age=31536000, immutable");
  response.setHeader("content-type", file.contentType);
  response.setHeader("content-length", String(photo.size));
  response.setHeader("content-disposition", "inline");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("content-security-policy", "default-src 'none'; sandbox");
  response.status(HttpStatus.OK);
  // Streamed, not buffered (INV-20261026-001); an abort or a read error ends the response and the
  // access-check slot is released on "close".
  try {
    await pipeline(photo.stream, sizeGuard(photo.size), response);
  } catch (error) {
    if (!response.destroyed) response.destroy();
    if ((error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE") logger.warn({ event: `${endpoint.event}.photo_stream_failed`, id });
  }
}

const quotationPhotos: PhotoEndpoint = {
  menu: "quotation",
  kind: "quotation-photo",
  source: QUOTATION_PHOTO_SOURCE,
  event: "quotation",
  // Late-bound so the storage functions stay replaceable (tests mock the storage module).
  store: (data, contentType) => storeQuotationPhoto(data, contentType),
  open: (key) => openQuotationPhoto(key),
  invalid: quotationPhotoInvalid,
  notFound: quotationNotFound,
  mapError: mapQuotationError,
};

/**
 * Line photo binary boundary (SA-QT-10). The route middleware in main.ts has already applied live user
 * authorization (POST: ADD or EDIT + CSRF; GET: VIEW) before the body was buffered.
 */
@Controller("api/v1/quotation/photos")
@PublicRoute()
export class QuotationPhotoPublicController {
  private readonly logger = new Logger("QuotationPhoto");

  constructor(private readonly auth: MasterTrpcHandler) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() request: Request) {
    return uploadPhoto(quotationPhotos, await this.auth.createContext(request), request, this.logger);
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    return streamPhoto(quotationPhotos, await this.auth.createContext(request), rawId, response, this.logger);
  }
}

/** ADD or EDIT may upload (a new or an edited quotation); both need CSRF. */
export function uploaderId(context: MasterContext): string {
  return photoUploaderId(context, "quotation");
}
