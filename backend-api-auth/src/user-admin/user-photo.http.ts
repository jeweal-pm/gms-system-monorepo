import { HttpException, HttpStatus } from "@nestjs/common";
import type { RequestHandler } from "express";
import { userAdminException } from "./user-admin.errors";
import { verifyAuthTrpcCsrf } from "../trpc/auth-trpc.csrf";
import type { UserAdminAction } from "./delegation";
import type { UserAdminService } from "./user-admin.service";

/** Reject unsupported methods before express.raw can consume an unauthenticated body. */
export const photoMethodCheck: RequestHandler = (request, response, next) => {
  if (request.method === "GET" || request.method === "PUT") return next();
  response.setHeader("allow", "GET, PUT");
  response.status(405).json(userAdminException("METHOD_NOT_ALLOWED", 405).getResponse());
};

/** GET is read-only and must not carry an upload body that the raw parser would consume. */
export const photoReadBodyCheck: RequestHandler = (request, response, next) => {
  if (request.method !== "GET") return next();
  const length = request.headers["content-length"];
  if (request.headers["transfer-encoding"] !== undefined || (length !== undefined && length !== "0")) {
    response.status(400).json(userAdminException("VALIDATION_ERROR", HttpStatus.BAD_REQUEST).getResponse());
    return;
  }
  next();
};

/** Require the real session, live license, and current VIEW/EDIT grant before body buffering. */
export function createPhotoAccessCheck(userAdmin: Pick<UserAdminService, "requireAccess">): RequestHandler {
  return (request, response, next) => {
    const action: UserAdminAction = request.method === "GET" ? "VIEW" : "EDIT";
    void userAdmin.requireAccess(request, action).then(() => next()).catch((error: unknown) => {
      if (error instanceof HttpException) {
        response.status(error.getStatus()).json(error.getResponse());
        return;
      }
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json(userAdminException("LICENSE_UNVERIFIABLE", HttpStatus.SERVICE_UNAVAILABLE).getResponse());
    });
  };
}

/** Public and legacy photo routes share the same fail-closed access check before raw parsing. */
export const createPublicPhotoAccessCheck = createPhotoAccessCheck;

export const photoCsrfCheck: RequestHandler = (request, response, next) => {
  if (request.method !== "PUT" || verifyAuthTrpcCsrf(request)) return next();
  response.status(403).json(userAdminException("CSRF_INVALID", 403).getResponse());
};
