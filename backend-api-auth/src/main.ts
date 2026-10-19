import "reflect-metadata";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "./user-admin/photo-storage";
import { userAdminException } from "./user-admin/user-admin.errors";

/** user-photo.md PH-04/05: the only route that accepts a raw body (JPEG/PNG, ≤ 5 MB). */
const PHOTO_ROUTE = "/internal/v1/user-admin/users/:id/photo";

/** Rejects an upload without a session before buffering up to 5 MB; the handler re-checks the grant. */
const photoSessionCheck: RequestHandler = (request, response, next) => {
  if (request.method !== "PUT") return next();
  auth.api.getSession({ headers: fromNodeHeaders(request.headers) }).then(
    (session) => {
      if (session && session.user.active !== false) return next();
      const error = userAdminException("UNAUTHORIZED", 401);
      response.status(401).json(error.getResponse());
    },
    next,
  );
};

/** body-parser failures on the photo route: 413 → PHOTO_TOO_LARGE in the auth envelope. */
const photoBodyErrors: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  const status = typeof error === "object" && error !== null ? Number((error as { status?: unknown }).status) : NaN;
  if (status === 413) {
    response.status(413).json(userAdminException("PHOTO_TOO_LARGE", 413).getResponse());
    return;
  }
  next(error);
};

async function bootstrap() {
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) {
    throw new Error("AUTH_SECRET must contain at least 32 characters in production");
  }
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use("/api/auth", toNodeHandler(auth));
  expressApp.use(PHOTO_ROUTE, photoSessionCheck, express.raw({ type: [...PHOTO_TYPES], limit: PHOTO_MAX_BYTES }), photoBodyErrors);
  expressApp.use(express.json({ limit: "32kb" }));
  await app.listen(Number(process.env.PORT ?? 3101), "0.0.0.0");
}

void bootstrap();
