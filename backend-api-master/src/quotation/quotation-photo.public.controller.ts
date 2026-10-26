import { pipeline } from "node:stream/promises";
import { uuidV7 } from "@gms/storage";
import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseId } from "../common/request";
import { prisma } from "../database/prisma-client";
import { PublicRoute } from "../internal-auth/public.decorator";
import { requireMasterGrant } from "../master/authorization";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { mapQuotationError, quotationPhotoInvalid } from "./quotation.errors";
import {
  isQuotationPhotoType,
  QUOTATION_PHOTO_MAX_BYTES,
  QUOTATION_PHOTO_SOURCE,
  openQuotationPhoto,
  signatureMatches,
  sizeGuard,
  storeQuotationPhoto,
} from "./quotation-photo.storage";
import { quotationNotFound } from "./quotation.errors";

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
    const context = await this.auth.createContext(request);
    const actorId = uploaderId(context);
    const contentType = (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    const body: unknown = request.body;
    if (!isQuotationPhotoType(contentType) || !Buffer.isBuffer(body) || body.length === 0 || body.length > QUOTATION_PHOTO_MAX_BYTES || !signatureMatches(contentType, body)) {
      throw quotationPhotoInvalid("(body)");
    }
    const stored = await storeQuotationPhoto(body, contentType);
    try {
      const id = uuidV7();
      const now = new Date();
      await prisma.storedFile.create({
        data: {
          id,
          kind: "quotation-photo",
          bucket: "files",
          objectKey: stored.key,
          filename: stored.key.split("/").at(-1)!,
          contentType,
          sizeBytes: BigInt(stored.sizeBytes),
          sha256: stored.sha256,
          status: "ready",
          sourceType: QUOTATION_PHOTO_SOURCE,
          // One ready row per (source_type, source_id) is enforced by stored_files_one_ready_source_key, so each
          // photo is its own source; the uploader is created_by.
          sourceId: id,
          createdBy: actorId,
          createdAt: now,
          readyAt: now,
        },
      });
      this.logger.log({ event: "quotation.photo_uploaded", actorId, id, sizeBytes: stored.sizeBytes });
      return { photoId: id };
    } catch (error) {
      throw mapQuotationError(error, "photo_upload");
    }
  }

  @Get(":id")
  async read(@Req() request: Request, @Param("id") rawId: string, @Res() response: Response) {
    const context = await this.auth.createContext(request);
    requireMasterGrant(context, "quotation", "VIEW", false);
    const id = parseId(rawId);
    const file = await prisma.storedFile.findFirst({ where: { id, sourceType: QUOTATION_PHOTO_SOURCE, status: "ready" }, select: { objectKey: true, contentType: true } });
    if (!file) throw quotationNotFound();
    const photo = await openQuotationPhoto(file.objectKey);
    if (!photo) throw quotationNotFound();
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
      if ((error as NodeJS.ErrnoException).code !== "ERR_STREAM_PREMATURE_CLOSE") this.logger.warn({ event: "quotation.photo_stream_failed", id });
    }
  }
}

/** ADD or EDIT may upload (a new or an edited quotation); both need CSRF. */
export function uploaderId(context: Parameters<typeof requireMasterGrant>[0]): string {
  try {
    return requireMasterGrant(context, "quotation", "ADD", true);
  } catch {
    return requireMasterGrant(context, "quotation", "EDIT", true);
  }
}
