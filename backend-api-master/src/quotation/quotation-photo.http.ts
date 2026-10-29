import type { RequestHandler, Response } from "express";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { errorBody } from "../common/errors";
import { requireMasterGrant, type MasterContext, type MasterMenu } from "../master/authorization";
import type { MasterTrpcHandler } from "../master/trpc-handler";

export const QUOTATION_PHOTO_ROUTE = "/api/v1/quotation/photos";

/**
 * INV-20261026-001: at most this many photo requests run at once in api-master (384 MiB), so buffered
 * 5 MB uploads and streamed downloads stay bounded. Over the cap → 503 PARTNER_UNAVAILABLE + Retry-After.
 */
export const PHOTO_UPLOADS_MAX = 3;
export const PHOTO_DOWNLOADS_MAX = 6;

export type PhotoLimiter = { tryAcquire(): (() => void) | null; readonly active: number };

/** A counting semaphore without a queue; the returned release is idempotent. */
export function createPhotoLimiter(max: number): PhotoLimiter {
  let active = 0;
  return {
    get active() {
      return active;
    },
    tryAcquire() {
      if (active >= max) return null;
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
      };
    },
  };
}

export type PhotoLimiters = { uploads: PhotoLimiter; downloads: PhotoLimiter };

/**
 * The process-wide photo limiters (SA-MR-15): Quotation and Memo Receive photo routes share these two instances, so
 * adding a document type with photos does not raise the host bound (3 buffered uploads, 6 streamed downloads).
 */
export const sharedPhotoLimiters: PhotoLimiters = { uploads: createPhotoLimiter(PHOTO_UPLOADS_MAX), downloads: createPhotoLimiter(PHOTO_DOWNLOADS_MAX) };

/** Holds a slot until the response finishes or the connection closes (abort/error included). */
function holdUntilDone(response: Response, release: () => void) {
  response.once("finish", release);
  response.once("close", release);
}

export const photoMethodCheck: RequestHandler = (request, response, next) => {
  // A GET never carries a body, so it can't make express.raw buffer one.
  if (request.method === "GET" && (Number(request.headers["content-length"] ?? 0) > 0 || request.headers["transfer-encoding"] !== undefined)) {
    response.status(400).json(errorBody("VALIDATION_ERROR", [{ path: "(body)", code: "unexpected" }]));
    return;
  }
  if (request.method === "GET" || request.method === "POST") return next();
  response.setHeader("allow", "GET, POST");
  response.status(405).json(errorBody("METHOD_NOT_ALLOWED"));
};

export const quotationPhotoMethodCheck: RequestHandler = photoMethodCheck;

/** ADD or EDIT of `menu` may upload (a new or an edited document); both need CSRF. Returns the uploader id. */
export function photoUploaderId(context: MasterContext, menu: MasterMenu): string {
  try {
    return requireMasterGrant(context, menu, "ADD", true);
  } catch {
    return requireMasterGrant(context, menu, "EDIT", true);
  }
}

/**
 * Live user authorization of `menu` (POST: ADD or EDIT + CSRF; GET: VIEW), then a concurrency slot, both before any
 * body is buffered (same pattern as the company logo route).
 */
export function createPhotoAccessCheck(masterTrpc: MasterTrpcHandler, menu: MasterMenu, limiters: PhotoLimiters): RequestHandler {
  return (request, response, next) => {
    void masterTrpc.createContext(request).then((context) => {
      if (request.method === "GET") requireMasterGrant(context, menu, "VIEW", false);
      else photoUploaderId(context, menu);
      // The client left while authorization ran: "close" already fired, so a slot would never be released.
      if (response.closed || response.destroyed) return;
      const release = (request.method === "GET" ? limiters.downloads : limiters.uploads).tryAcquire();
      if (!release) {
        response.setHeader("retry-after", "1");
        response.status(503).json(errorBody("PARTNER_UNAVAILABLE"));
        return;
      }
      holdUntilDone(response, release);
      next();
    }).catch((error: unknown) => {
      const trpcError = error instanceof TRPCError ? error : new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
      const code = /^[A-Z][A-Z_]{1,63}$/.test(trpcError.message) ? trpcError.message : "AUTHORIZATION_UNAVAILABLE";
      response.status(getHTTPStatusCodeFromError(trpcError)).json({ error: { code, message: code } });
    });
  };
}

/** Quotation photo access check (SA-QT-10); main.ts passes `sharedPhotoLimiters`. */
export function createQuotationPhotoAccessCheck(
  masterTrpc: MasterTrpcHandler,
  limiters: PhotoLimiters = { uploads: createPhotoLimiter(PHOTO_UPLOADS_MAX), downloads: createPhotoLimiter(PHOTO_DOWNLOADS_MAX) },
): RequestHandler {
  return createPhotoAccessCheck(masterTrpc, "quotation", limiters);
}
