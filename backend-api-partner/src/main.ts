import "reflect-metadata";
import express, { type ErrorRequestHandler } from "express";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { errorBody } from "./common/errors";
import { loadDatabaseUrl, loadServiceTokenDigest } from "./config";

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

async function bootstrap() {
  // Fail fast before opening the port (ADR-0018 §1, infra D3).
  loadServiceTokenDigest();
  loadDatabaseUrl();
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.disable("x-powered-by");
  expressApp.use(express.json({ limit: "256kb" }));
  expressApp.use(bodyErrorHandler);
  await app.listen(Number(process.env.PORT ?? 3201), "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
  // Configuration messages never contain secret values.
  console.error(`backend-api-partner failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
