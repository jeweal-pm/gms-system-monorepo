import { Controller, Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit, Req, Sse, UnauthorizedException } from "@nestjs/common";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { TRPCError } from "@trpc/server";
import type { Request, RequestHandler } from "express";
import { Observable } from "rxjs";
import { errorBody } from "../common/errors";
import { PublicRoute } from "../internal-auth/public.decorator";
import { requireMasterSession, type MasterContext } from "../master/authorization";
import type { MasterTrpcHandler } from "../master/trpc-handler";
import { notificationHub } from "./notification-hub";
import { purgeExpired } from "./notification-store";

/** ADR-0049 D6: `GET /api/master/notifications/stream` (server-sent events, ids only). */
export const NOTIFICATION_STREAM_ROUTE = "/api/master/notifications/stream";
export const HEARTBEAT_MS = 25_000;
/** `reauth` this long before the access token expires; the server then ends the stream. */
export const REAUTH_LEAD_MS = 60_000;
/** Without a known expiry (should not happen) a stream lives at most this long, under the 15-minute access token. */
export const STREAM_MAX_MS = 14 * 60_000;
export const RETRY_MS = 5_000;

type StreamPrincipal = { userId: string; accessExpiresAt: number | null };
type GatedRequest = Request & { notificationPrincipal?: StreamPrincipal };

/** When to send `reauth`: 60 s before the access token expires, at the latest after STREAM_MAX_MS, never negative. */
export function reauthDelay(accessExpiresAt: number | null | undefined, now: number): number {
  const byToken = typeof accessExpiresAt === "number" ? accessExpiresAt - REAUTH_LEAD_MS - now : STREAM_MAX_MS;
  return Math.max(0, Math.min(byToken, STREAM_MAX_MS));
}

/**
 * Runs before Nest (main.ts), so a refused stream gets a real status instead of an empty event stream:
 * cross-site → 403; no live session / authorization → 401 / 503 (as the photo routes); process at its cap → 503.
 */
export function createNotificationStreamGate(masterTrpc: Pick<MasterTrpcHandler, "createContext">): RequestHandler {
  return (request, response, next) => {
    if (request.method !== "GET") {
      response.status(405).json(errorBody("METHOD_NOT_ALLOWED"));
      return;
    }
    const site = request.headers["sec-fetch-site"];
    if (site !== undefined && site !== "same-origin") {
      response.status(403).json(errorBody("PERMISSION_DENIED"));
      return;
    }
    void masterTrpc.createContext(request).then((context: MasterContext) => {
      const principal = requireMasterSession(context);
      if (response.closed || response.destroyed) return;
      if (notificationHub.isFull()) {
        response.setHeader("retry-after", "30");
        response.status(503).json(errorBody("PARTNER_UNAVAILABLE"));
        return;
      }
      (request as GatedRequest).notificationPrincipal = { userId: principal.userId, accessExpiresAt: context.accessExpiresAt ?? null };
      // Personal, long-lived: never cached, never buffered by nginx.
      response.setHeader("cache-control", "no-store");
      response.setHeader("x-accel-buffering", "no");
      next();
    }).catch((error: unknown) => {
      const trpcError = error instanceof TRPCError ? error : new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
      const code = /^[A-Z][A-Z_]{1,63}$/.test(trpcError.message) ? trpcError.message : "AUTHORIZATION_UNAVAILABLE";
      response.status(getHTTPStatusCodeFromError(trpcError)).json({ error: { code, message: code } });
    });
  };
}

@Controller("api/master/notifications")
@PublicRoute()
export class NotificationStreamController {
  private readonly logger = new Logger("NotificationStream");

  @Sse("stream")
  stream(@Req() request: GatedRequest): Observable<MessageEvent> {
    const principal = request.notificationPrincipal;
    // The gate in main.ts always runs first; without it the route stays closed.
    if (!principal) throw new UnauthorizedException();
    return new Observable<MessageEvent>((subscriber) => {
      const unregister = notificationHub.open({
        userId: principal.userId,
        push: (event) => subscriber.next({ type: "notification", data: event }),
        close: () => subscriber.complete(),
      });
      if (!unregister) {
        subscriber.complete();
        return undefined;
      }
      subscriber.next({ type: "ready", data: {}, retry: RETRY_MS });
      const heartbeat = setInterval(() => subscriber.next({ type: "ping", data: {} }), HEARTBEAT_MS);
      const reauth = setTimeout(() => {
        subscriber.next({ type: "reauth", data: {} });
        subscriber.complete();
      }, reauthDelay(principal.accessExpiresAt, Date.now()));
      return () => {
        clearInterval(heartbeat);
        clearTimeout(reauth);
        unregister();
      };
    });
  }
}

/** D11: daily bounded clean-up of notifications older than 90 days (first run a minute after start). */
@Injectable()
export class NotificationRetention implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("NotificationRetention");
  private timers: NodeJS.Timeout[] = [];

  onModuleInit() {
    const run = () =>
      void purgeExpired().then(
        ({ deleted }) => deleted > 0 && this.logger.log({ event: "notification.purged", deleted }),
        (error: unknown) => this.logger.warn({ event: "notification.purge_failed", errorName: error instanceof Error ? error.name : "unknown" }),
      );
    const first = setTimeout(run, 60_000);
    const daily = setInterval(run, 86_400_000);
    first.unref();
    daily.unref();
    this.timers = [first, daily];
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearTimeout(timer);
  }
}
