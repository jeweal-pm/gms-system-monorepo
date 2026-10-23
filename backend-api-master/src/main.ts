import "reflect-metadata";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "./company-profile/company-profile.schemas";
import { errorBody } from "./common/errors";
import { loadDatabaseUrl, loadServiceTokenDigest } from "./config";
import { serviceTokenMatches } from "./internal-auth/service-token.guard";
import { MasterTrpcHandler } from "./master/trpc-handler";
import { createPublicLogoAccessCheck, publicLogoMethodCheck } from "./company-profile/company-logo.http";

/** Maps body-parser failures to the partner envelope (413 over 256 KB, 400 malformed JSON). */
const bodyErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  const status = typeof error === "object" && error !== null ? Number((error as { status?: unknown }).status) : NaN;
  if (status === 413) {
    response.status(413).json(errorBody("PAYLOAD_TOO_LARGE"));
    return;
  }
  if (status === 415) {
    response.status(415).json(errorBody("UNSUPPORTED_MEDIA_TYPE"));
    return;
  }
  if (status === 400) {
    response.status(400).json(errorBody("VALIDATION_ERROR", [{ path: "(body)", code: "invalid_json" }]));
    return;
  }
  next(error);
};

/** Company logo route only (company-profile SA-CP-04): checks the token before buffering up to 10 MB. */
const LOGO_ROUTE = "/internal/v1/company-profile/logo";
const PUBLIC_LOGO_ROUTE = "/api/v1/company-profile/logo";

function logoTokenCheck(expected: Buffer): RequestHandler {
  return (request, response, next) => {
    if (request.method === "PUT" && !serviceTokenMatches(request.headers.authorization, expected)) {
      response.status(401).json(errorBody("UNAUTHORIZED"));
      return;
    }
    next();
  };
}

/** The public browser route uses the user's live auth/grant context, not the internal service token. */
async function bootstrap() {
  // Fail fast before opening the port (ADR-0018 §1, infra D3).
  const tokenDigest = loadServiceTokenDigest();
  loadDatabaseUrl();
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance();
  const masterTrpc = app.get(MasterTrpcHandler);
  expressApp.disable("x-powered-by");
  expressApp.use(LOGO_ROUTE, logoTokenCheck(tokenDigest), express.raw({ type: [...LOGO_TYPES], limit: LOGO_MAX_BYTES }));
  expressApp.use(PUBLIC_LOGO_ROUTE, publicLogoMethodCheck, createPublicLogoAccessCheck(masterTrpc), express.raw({ type: [...LOGO_TYPES], limit: LOGO_MAX_BYTES }), bodyErrorHandler);
  expressApp.use(express.json({ limit: "256kb" }));
  expressApp.use(bodyErrorHandler);
  expressApp.use("/api/master/trpc", masterTrpc.handle.bind(masterTrpc));
  await app.listen(Number(process.env.PORT ?? 3201), "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
  // Configuration messages never contain secret values.
  console.error(`api-master failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
