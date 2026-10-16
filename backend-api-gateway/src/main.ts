import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { AppModule } from "./app.module";
import { createContext } from "./request-context";
import { appRouter } from "./trpc/router";

/** Shared with partner (ADR-0018 §1); partner rejects shorter tokens at start. */
const MIN_PARTNER_TOKEN_LENGTH = 32;
/** tRPC body limit for every procedure (customer D-10); the tRPC default is unbounded. */
const TRPC_MAX_BODY_BYTES = 1_048_576;

async function bootstrap() {
  if (process.env.NODE_ENV === "production" && (process.env.PARTNER_SERVICE_TOKEN ?? "").length < MIN_PARTNER_TOKEN_LENGTH) {
    throw new Error(`PARTNER_SERVICE_TOKEN must contain at least ${MIN_PARTNER_TOKEN_LENGTH} characters in production`);
  }
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const express = app.getHttpAdapter().getInstance();
  express.use("/trpc", createExpressMiddleware({ router: appRouter, createContext, maxBodySize: TRPC_MAX_BODY_BYTES }));
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
