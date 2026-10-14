import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { prisma } from "../database/prisma-client";
import { PublicRoute } from "../internal-auth/public.decorator";

const READY_TIMEOUT_MS = 1_000;

/** Unauthenticated probes (infra backend-api-partner/1); they return only a status. */
@Controller("health")
@PublicRoute()
export class HealthController {
  /** Process liveness only; no database access. */
  @Get("live")
  live() {
    return { status: "ok" as const };
  }

  /** Real query on schema `partner` with the service's own role; 503 on failure or after 1 s. */
  @Get("ready")
  async ready(@Res() response: Response) {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1 FROM "partner"."_prisma_migrations" LIMIT 1`,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("ready timeout")), READY_TIMEOUT_MS); }),
      ]);
      response.status(HttpStatus.OK).json({ status: "ok" });
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: "unavailable" });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
