import { Readable } from "node:stream";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { AppError } from "./platform/errors";
import type { Db } from "./platform/db";
import type { Logger } from "./platform/logger";
import type { MasterApi } from "./platform/master-api";
import { canApprove, hasGrant, requireGrant, type AuthDeps } from "./platform/auth/principal";
import { errorResponse, jsonBody, parse, queryObject, requestContext, requireSession, type AppEnv } from "./platform/http";
import { approvalTypeSchema, listSettings, settingUpdateSchema, updateSetting } from "./platform/approval/settings";
import { NotificationHub } from "./platform/notification/hub";
import { listForTypes, listForUser, markAllRead, markRead, NOTIFICATION_PAGE_MAX, unreadCount } from "./platform/notification/store";
import { approvalPending, approvalSummary, getDetail, listDocuments, nextNumber } from "./modules/load-to-stock/read";
import { approvalPending as salePending, approvalSummary as saleSummary } from "./modules/sale/read";
import { SaleService } from "./modules/sale/service";
import { SalePhotoService } from "./modules/sale/photos";
import { registerSaleRoutes } from "./modules/sale/routes";
import { pendingQuerySchema as salePendingQuerySchema } from "./modules/sale/schemas";
import { LoadToStockService } from "./modules/load-to-stock/service";
import { PhotoService, PHOTO_MAX_BYTES } from "./modules/load-to-stock/photos";
import {
  listQuerySchema, loadInputSchema, loadUpdateSchema, nextNumberSchema, pendingQuerySchema, rejectSchema, reviseSchema, searchSchema, vendorsQuerySchema, versionSchema,
} from "./modules/load-to-stock/schemas";

/**
 * backend-api-inventory HTTP surface (load-to-stock SA rev 1 api-contract; ADR-0052 D1/D2). Public base
 * `/api/inventory/v1` (nginx keeps the full path); `/health/*` is not routed by nginx. Body caps: JSON 256 KiB, photo
 * upload 5 MiB + multipart overhead (hono ≥ 4.13.18 `bodyLimit`, INV-20261117-001). Every response is `no-store`.
 */
export const JSON_BODY_MAX = 256 * 1024;
export const PHOTO_BODY_MAX = PHOTO_MAX_BYTES + 64 * 1024;
export const SSE_HEARTBEAT_MS = 25_000;
export const SSE_RETRY_MS = 5_000;
export const REAUTH_LEAD_MS = 60_000;
export const STREAM_MAX_MS = 14 * 60_000;

export type AppDeps = {
  db: Db;
  master: MasterApi;
  logger: Logger;
  auth: AuthDeps;
  trustedOrigins: ReadonlySet<string>;
  approvers(leaf: string): Promise<string[]>;
  storageRoot: string;
  hub?: NotificationHub;
  /** Readiness probe (own DB `SELECT 1` ≤ 1 s); master is not part of readiness. */
  ready?: () => Promise<boolean>;
};

const uuidParam = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, "LOAD_TO_STOCK_NOT_FOUND");
  return value;
};
const limitTooLarge = () => { throw new AppError(413, "PAYLOAD_TOO_LARGE"); };

export function reauthDelay(accessExpiresAt: number | null, now: number): number {
  const byToken = typeof accessExpiresAt === "number" ? accessExpiresAt - REAUTH_LEAD_MS - now : STREAM_MAX_MS;
  return Math.max(0, Math.min(byToken, STREAM_MAX_MS));
}

export function createApp(deps: AppDeps) {
  const hub = deps.hub ?? new NotificationHub();
  const service = new LoadToStockService({ db: deps.db, master: deps.master, logger: deps.logger, hub, approvers: deps.approvers });
  const photos = new PhotoService(deps.db, deps.master, deps.storageRoot);
  // sale ADR-0054 (BE-SL-005/007): own module and saga store; photo transfers share the process limiters.
  const saleService = new SaleService({ db: deps.db, master: deps.master, logger: deps.logger, hub, approvers: deps.approvers });
  const salePhotos = new SalePhotoService(deps.db, deps.storageRoot, photos.writes, photos.reads);
  const app = new Hono<AppEnv>();
  app.use("*", requestContext(deps.logger));
  app.onError((error, c) => errorResponse(c, error, deps.logger));
  app.notFound((c) => errorResponse(c, new AppError(404, "NOT_FOUND"), deps.logger));

  // ---------- health (not routed by nginx) ----------
  app.get("/health/live", (c) => c.json({ status: "ok" }));
  app.get("/health/ready", async (c) => {
    const check = deps.ready ?? (async () => { await deps.db.$queryRaw`SELECT 1`; return true; });
    let ok = false;
    let timer: NodeJS.Timeout | undefined;
    try {
      ok = await Promise.race([check(), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), 1_000); })]);
    } catch { ok = false; } finally { if (timer) clearTimeout(timer); }
    return c.json({ status: ok ? "ok" : "unavailable" }, ok ? 200 : 503);
  });

  const api = new Hono<AppEnv>();
  const session = requireSession({ auth: deps.auth, trustedOrigins: deps.trustedOrigins });
  const jsonCap = bodyLimit({ maxSize: JSON_BODY_MAX, onError: limitTooLarge });
  const photoCap = bodyLimit({ maxSize: PHOTO_BODY_MAX, onError: limitTooLarge });
  api.use("/load-to-stock/photos", photoCap);
  api.use("/sale/photos", photoCap);
  api.use("*", async (c, next) => (c.req.path.endsWith("/load-to-stock/photos") || c.req.path.endsWith("/sale/photos") ? next() : jsonCap(c, next)));
  api.use("*", session);

  // ---------- reference ----------
  api.get("/load-to-stock/options", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    const reference = await deps.master.reference({ requestId: c.get("requestId") });
    return c.json({ companyCurrency: reference.companyCurrency, stone: reference.stone, locations: reference.locations });
  });
  api.get("/load-to-stock/vendors", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    return c.json(await deps.master.vendors(parse(vendorsQuerySchema, queryObject(c)), { requestId: c.get("requestId") }));
  });
  api.get("/load-to-stock/next-number", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "ADD");
    const { docDate } = parse(nextNumberSchema, queryObject(c));
    return c.json(await nextNumber(deps.db, deps.master, docDate, c.get("requestId")));
  });
  api.post("/load-to-stock/purchase-lines/search", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    const input = await jsonBody(c, searchSchema);
    return c.json(await deps.master.search({ ...input, limit: input.limit ?? 50 }, { requestId: c.get("requestId") }));
  });

  // ---------- photos ----------
  api.post("/load-to-stock/photos", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "ADD", "EDIT");
    const type = c.req.header("content-type") ?? "";
    if (!/^multipart\/form-data/i.test(type)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE");
    // INV-20261117-003 F1: take the upload slot BEFORE the multipart body is read (429 RATE_LIMITED when 3 are in flight);
    // the slot is released on success, refusal or error.
    const saved = await photos.writes.run(async () => {
      let form: FormData;
      try { form = await c.req.formData(); } catch { throw new AppError(400, "BAD_REQUEST"); }
      const file = form.get("file");
      return photos.uploadHeld(c.get("principal").userId, file instanceof File ? file : null);
    });
    return c.json(saved, 201);
  });
  api.post("/load-to-stock/photos/from-purchase-line", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "ADD", "EDIT");
    const { purchaseLineId } = await jsonBody(c, z.object({ purchaseLineId: z.uuid() }).strict());
    return c.json(await photos.fromPurchaseLine(c.get("principal").userId, purchaseLineId, c.get("requestId")));
  });
  api.get("/load-to-stock/photos/:id", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) throw new AppError(404, "PHOTO_NOT_FOUND");
    const file = await photos.reads.run(() => photos.open(id));
    // A Node Readable handed to Response as an async iterable crashed the process (undici "ReadableStream is already
    // closed") when the browser cancelled the image read; Readable.toWeb gives a proper byte stream that cancels cleanly.
    return new Response(Readable.toWeb(file.stream) as unknown as ReadableStream, {
      status: 200,
      headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  });

  // ---------- documents ----------
  api.get("/load-to-stock", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    return c.json(await listDocuments(deps.db, parse(listQuerySchema, queryObject(c))));
  });
  api.post("/load-to-stock", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "ADD");
    const input = await jsonBody(c, loadInputSchema);
    const result = await service.create(c.get("principal"), input, c.get("requestId"));
    return c.json({ id: result.id, docNo: result.docNo, version: result.version, status: result.status, stockIds: result.stockIds }, 201);
  });
  api.get("/load-to-stock/:id", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "VIEW");
    const id = uuidParam(c.req.param("id"));
    await service.redriveIfStale(id, c.get("requestId"));
    const detail = await getDetail(deps.db, deps.master, id, c.get("requestId"));
    return c.json(detail);
  });
  api.put("/load-to-stock/:id", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "EDIT");
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion, ...input } = await jsonBody(c, loadUpdateSchema);
    const result = await service.update(c.get("principal"), id, input, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, stockIds: result.stockIds });
  });
  api.post("/load-to-stock/:id/submit", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "ADD", "EDIT");
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.submit(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, submittedAt: result.submittedAt });
  });
  const approver = (c: { get(key: "principal"): AppEnv["Variables"]["principal"] }) => {
    if (!canApprove(c.get("principal"), "load-to-stock")) throw new AppError(403, "PERMISSION_DENIED");
  };
  api.post("/load-to-stock/:id/approve", async (c) => {
    approver(c);
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.approve(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, stockIds: result.stockIds });
  });
  api.post("/load-to-stock/:id/request-revision", async (c) => {
    approver(c);
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion, note } = await jsonBody(c, reviseSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REVISE", note, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/load-to-stock/:id/reject", async (c) => {
    approver(c);
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion, reason } = await jsonBody(c, rejectSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REJECT", reason, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/load-to-stock/:id/delete", async (c) => {
    requireGrant(c.get("principal"), "load-to-stock", "DELETE");
    const id = uuidParam(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.remove(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version });
  });

  // ---------- approval settings + Approve Center ----------
  api.get("/approval-settings", async (c) => c.json(await listSettings(deps.db, c.get("principal"))));
  api.put("/approval-settings/:type", async (c) => {
    requireGrant(c.get("principal"), "approval-setup", "EDIT");
    const parsedType = approvalTypeSchema.safeParse(c.req.param("type"));
    if (!parsedType.success) throw new AppError(404, "NOT_FOUND");
    const input = await jsonBody(c, settingUpdateSchema);
    return c.json(await updateSetting(deps.db, c.get("principal"), parsedType.data, input));
  });
  api.get("/approval/summary", async (c) => {
    const [load, sale] = await Promise.all([approvalSummary(deps.db, c.get("principal")), saleSummary(deps.db, c.get("principal"))]);
    return c.json({ ...load, items: [...load.items, ...sale] });
  });
  api.get("/approval/pending", async (c) => {
    if (c.req.query("type") === "sale") {
      const query = parse(salePendingQuerySchema, queryObject(c));
      if (!canApprove(c.get("principal"), "sale")) throw new AppError(403, "PERMISSION_DENIED");
      return c.json(await salePending(deps.db, query));
    }
    const query = parse(pendingQuerySchema, queryObject(c));
    approver(c);
    return c.json(await approvalPending(deps.db, query));
  });

  // ---------- notifications (ADR-0049 shapes, ADR-0052 D12) ----------
  const notificationList = z.object({ scope: z.enum(["for-me", "all"]).default("for-me"), cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(NOTIFICATION_PAGE_MAX).optional() }).strict();
  api.get("/notifications/unread-count", async (c) => c.json(await unreadCount(deps.db, c.get("principal").userId)));
  api.get("/notifications", async (c) => {
    const query = parse(notificationList, queryObject(c));
    const principal = c.get("principal");
    if (query.scope === "all") {
      const types = (["load-to-stock", "sale"] as const).filter((type) => hasGrant(principal, type, "VIEW"));
      return c.json(await listForTypes(deps.db, types, query.cursor, query.limit));
    }
    return c.json(await listForUser(deps.db, principal.userId, query.cursor, query.limit));
  });
  api.post("/notifications/mark-read", async (c) => {
    const { ids } = await jsonBody(c, z.object({ ids: z.array(z.uuid()).min(1).max(50) }).strict());
    return c.json(await markRead(deps.db, c.get("principal").userId, ids));
  });
  api.post("/notifications/mark-all-read", async (c) => c.json(await markAllRead(deps.db, c.get("principal").userId)));
  api.get("/notifications/stream", (c) => {
    const site = c.req.header("sec-fetch-site");
    if (site !== undefined && site !== "same-origin") throw new AppError(403, "PERMISSION_DENIED");
    if (hub.isFull()) throw new AppError(503, "SERVICE_UNAVAILABLE", undefined, { "Retry-After": "30" });
    const principal = c.get("principal");
    c.header("Cache-Control", "no-store");
    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      let closed = false;
      let wake: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => { wake = resolve; });
      const close = () => { if (!closed) { closed = true; wake(); } };
      const unregister = hub.open({
        userId: principal.userId,
        push: (event) => { void stream.writeSSE({ event: "notification", data: JSON.stringify(event) }); },
        close,
      });
      if (!unregister) return;
      stream.onAbort(close);
      await stream.writeSSE({ event: "ready", data: "{}", retry: SSE_RETRY_MS });
      const heartbeat = setInterval(() => { void stream.writeSSE({ event: "ping", data: "{}" }); }, SSE_HEARTBEAT_MS);
      const reauth = setTimeout(() => { void stream.writeSSE({ event: "reauth", data: "{}" }).then(close, close); }, reauthDelay(principal.accessExpiresAt, Date.now()));
      try {
        await finished;
      } finally {
        clearInterval(heartbeat);
        clearTimeout(reauth);
        unregister();
      }
    });
  });

  registerSaleRoutes(api, { db: deps.db, master: deps.master, service: saleService, photos: salePhotos });

  app.route("/api/inventory/v1", api);
  return { app, service, hub, photos, saleService, salePhotos };
}
