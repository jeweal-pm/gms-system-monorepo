import { pipeline } from "node:stream/promises";
import { uuidV7 } from "@gms/storage";
import { Controller, Get, HttpCode, HttpStatus, Logger, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { parseId } from "../common/request";
import { prisma } from "../database/prisma-client";
import { PublicRoute } from "../internal-auth/public.decorator";
import { TRPCError } from "@trpc/server";
import { Prisma } from "../generated/prisma/client";
import type { ApprovalDocType } from "../approval-setting/approval-types";
import { APPROVAL_REGISTRY } from "../approval/approval.registry";
import type { MasterContext, MasterMenu } from "../master/authorization";
import { MasterTrpcHandler } from "../master/trpc-handler";
import { okPhotoRefs } from "../inventory-internal/sale-reads";
import { MEMO_RECEIVE_PHOTO_FILE_SOURCE } from "../trade-document/memo-photo-ref";
import { photoReader, photoUploaderId } from "./quotation-photo.http";
import { mapQuotationError, quotationNotFound, quotationPhotoInvalid } from "./quotation.errors";
import {
  isPhotoType,
  createPhotoStore,
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
  /** Link table of a document that may reference Memo Receive photos: such a file is served here only while a line of this document links it. */
  memoRefTable?: string;
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

/** The memo-receive photo store (read only here; the bytes belong to Memo Receive). */
let memoStore: PhotoStore | null = null;
const memoReceivePhotoStore = () => (memoStore ??= createPhotoStore("memo-receive-photo"));

/** A referenced memo photo is readable through a document route only while a line of THAT document links it (one indexed EXISTS). */
async function isLinkedMemoPhoto(linkTable: string, fileId: string): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ ok: boolean }[]>(Prisma.sql`SELECT EXISTS (SELECT 1 FROM ${Prisma.raw(`"partner"."${linkTable}"`)} p WHERE p."file_id" = ${fileId}::uuid) AS "ok"`);
  return row?.ok === true;
}

/**
 * G14: whether photo `fileId` is on a line of a live PENDING_APPROVAL document of the endpoint's type (registry
 * identifiers only; one indexed EXISTS over `<line>_photo(file_id)`).
 */
export async function isPendingDocumentPhoto(menu: MasterMenu, fileId: string): Promise<boolean> {
  const entry = APPROVAL_REGISTRY[menu as ApprovalDocType];
  if (!entry) return false;
  const table = (name: string) => Prisma.raw(`"partner"."${name}"`);
  const [row] = await prisma.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM ${table(`${entry.lineTable}_photo`)} p
      JOIN ${table(entry.lineTable)} l ON l."id" = p."line_id"
      JOIN ${table(entry.table)} h ON h."id" = l.${Prisma.raw(`"${entry.parentColumn}"`)}
      WHERE p."file_id" = ${fileId}::uuid AND h."status" = 'PENDING_APPROVAL' AND h."deleted_at" IS NULL
    ) AS "ok"`);
  return row?.ok === true;
}

/**
 * Streams one ready photo of this endpoint's source with immutable caching and safe headers. Readers: `<menu>:VIEW`, or
 * (G14) an approver of the type for a photo of a live PENDING_APPROVAL document; any other photo → PERMISSION_DENIED.
 */
/**
 * Picker preview (owner 2026-11-24): a row picked from a Memo Stock lot but not saved yet has no line linking its photos. The photo
 * route then also accepts `?lotKey=ML…|MS…` or `?memoStockId=`: the file is served only if it is a photo of a Memo Receive line
 * behind THAT lot / stock (the same rule as at save), under the document's own VIEW grant. Anything else is ignored.
 */
export function lotRefFromQuery(query: unknown): { memoStockId: string | null; lotKey: string | null } | undefined {
  const q = (query ?? {}) as Record<string, unknown>;
  const memoStockId = typeof q.memoStockId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.memoStockId) ? q.memoStockId.toLowerCase() : null;
  const lotKey = typeof q.lotKey === "string" && /^M[LS][0-9a-f-]{32,36}$/.test(q.lotKey) ? q.lotKey : null;
  return memoStockId || lotKey ? { memoStockId, lotKey } : undefined;
}

export async function streamPhoto(endpoint: PhotoEndpoint, context: MasterContext, rawId: string, response: Response, logger: Logger, lotRef?: { memoStockId: string | null; lotKey: string | null }) {
  const { approverOnly } = photoReader(context, endpoint.menu);
  const id = parseId(rawId);
  if (approverOnly) {
    let allowed: boolean;
    try {
      allowed = await isPendingDocumentPhoto(endpoint.menu, id);
    } catch (error) {
      throw endpoint.mapError(error, "photo_read");
    }
    if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
  }
  const file = await prisma.storedFile.findFirst({ where: { id, sourceType: endpoint.memoRefTable ? { in: [endpoint.source, MEMO_RECEIVE_PHOTO_FILE_SOURCE] } : endpoint.source, status: "ready" }, select: { objectKey: true, contentType: true, sourceType: true } });
  if (!file) throw endpoint.notFound();
  const referenced = Boolean(endpoint.memoRefTable) && file.sourceType === MEMO_RECEIVE_PHOTO_FILE_SOURCE && endpoint.source !== MEMO_RECEIVE_PHOTO_FILE_SOURCE;
  if (referenced && !(await isLinkedMemoPhoto(endpoint.memoRefTable!, id)) && !(lotRef && (await okPhotoRefs([{ fileId: id, ...lotRef }])).length > 0)) throw endpoint.notFound();
  const photo = await (referenced ? memoReceivePhotoStore().open(file.objectKey) : endpoint.open(file.objectKey));
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
  memoRefTable: "quotation_line_photo",
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
    return streamPhoto(quotationPhotos, await this.auth.createContext(request), rawId, response, this.logger, lotRefFromQuery(request.query));
  }
}

/** ADD or EDIT may upload (a new or an edited quotation); both need CSRF. */
export function uploaderId(context: MasterContext): string {
  return photoUploaderId(context, "quotation");
}
