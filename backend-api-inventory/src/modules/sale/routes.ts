import { Readable } from "node:stream";
import type { Hono } from "hono";
import { z } from "zod";
import { AppError, validationError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, requireGrant } from "../../platform/auth/principal";
import { jsonBody, parse, queryObject, type AppContext, type AppEnv } from "../../platform/http";
import { getDetail, listDocuments, nextNumber } from "./read";
import type { SaleService } from "./service";
import { openReferencedMemoPhoto, previewRefFromQuery, type SalePhotoService } from "./photos";
import { listQuerySchema, nextNumberSchema, optionsQuerySchema, rejectSchema, reserveLinesQuerySchema, reviseSchema, saleInputSchema, saleUpdateSchema, versionSchema, EXCLUDE_MAX } from "./schemas";

/**
 * `/api/inventory/v1/sale*` (sale SA rev 1 api-contract "Public endpoints", authorization.md): every route checks its
 * live grant on the server; CSRF and the body caps are applied by the platform middleware (app.ts). Static paths are
 * registered before `/sale/:id`.
 */
const saleId = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, "SALE_NOT_FOUND");
  return value;
};

/** `exclude` as a comma list and / or repeated (≤ 200 ids); every other key once. */
function reserveLinesQuery(c: AppContext) {
  const all = c.req.queries();
  const result: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(all)) {
    if (key === "exclude") continue;
    if (values.length !== 1) throw validationError([{ path: key, code: "invalid" }]);
    result[key] = values[0];
  }
  const exclude = (all.exclude ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  if (exclude.length > EXCLUDE_MAX) throw validationError([{ path: "exclude", code: "too_big" }]);
  result.exclude = [...new Set(exclude)];
  return parse(reserveLinesQuerySchema, result);
}

export function registerSaleRoutes(api: Hono<AppEnv>, deps: { db: Db; master: MasterApi; service: SaleService; photos: SalePhotoService }) {
  const { db, master, service, photos } = deps;

  // ---------- reference ----------
  api.get("/sale/options", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    const { customerId } = parse(optionsQuerySchema, queryObject(c));
    return c.json(await master.saleReference(customerId, { requestId: c.get("requestId") }));
  });
  api.get("/sale/next-number", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    const { docDate } = parse(nextNumberSchema, queryObject(c));
    return c.json(await nextNumber(db, master, docDate, c.get("requestId")));
  });
  api.get("/sale/reserve-lines", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    const query = reserveLinesQuery(c);
    return c.json(await master.saleReserveLines(query, { requestId: c.get("requestId") }));
  });

  // ---------- photos (ADR-0054 D9; Memo Receive references, owner 2026-11-24) ----------
  api.post("/sale/photos", async (c) => {
    requireGrant(c.get("principal"), "sale", "ADD", "EDIT");
    const type = c.req.header("content-type") ?? "";
    if (!/^multipart\/form-data/i.test(type)) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE");
    // The upload slot is taken BEFORE the multipart body is read (429 RATE_LIMITED when 3 are in flight).
    const saved = await photos.writes.run(async () => {
      let form: FormData;
      try { form = await c.req.formData(); } catch { throw new AppError(400, "BAD_REQUEST"); }
      const file = form.get("file");
      return photos.uploadHeld(c.get("principal").userId, file instanceof File ? file : null);
    });
    return c.json(saved, 201);
  });
  api.get("/sale/photos/:id", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) throw new AppError(404, "PHOTO_NOT_FOUND");
    const file = await photos.reads.run(async () => {
      try {
        return await photos.open(c.get("principal").userId, id);
      } catch (error) {
        if (!(error instanceof AppError) || error.status !== 404) throw error;
        return openReferencedMemoPhoto(db, master, id, c.get("requestId"), previewRefFromQuery(c.req.query()));
      }
    });
    return new Response(Readable.toWeb(file.stream) as unknown as ReadableStream, {
      status: 200,
      headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  });

  // ---------- documents ----------
  api.get("/sale", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    return c.json(await listDocuments(db, parse(listQuerySchema, queryObject(c))));
  });
  api.post("/sale", async (c) => {
    requireGrant(c.get("principal"), "sale", "ADD");
    const input = await jsonBody(c, saleInputSchema);
    const result = await service.create(c.get("principal"), input, c.get("requestId"));
    return c.json({ id: result.id, docNo: result.docNo, version: result.version, status: result.status }, 201);
  });
  api.get("/sale/:id", async (c) => {
    requireGrant(c.get("principal"), "sale", "VIEW");
    const id = saleId(c.req.param("id"));
    const detail = await getDetail(db, master, id, c.get("principal"), c.get("requestId"));
    if (!detail.syncing) return c.json(detail);
    // Re-drive on access only while an op is in flight (keeps the idle read at 3 statements, IT-SL-B12).
    await service.redriveIfStale(id, c.get("requestId"));
    return c.json(await getDetail(db, master, id, c.get("principal"), c.get("requestId")));
  });
  api.put("/sale/:id", async (c) => {
    requireGrant(c.get("principal"), "sale", "EDIT");
    const id = saleId(c.req.param("id"));
    const { expectedVersion, ...input } = await jsonBody(c, saleUpdateSchema);
    const result = await service.update(c.get("principal"), id, input, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/sale/:id/submit", async (c) => {
    requireGrant(c.get("principal"), "sale", "ADD", "EDIT");
    const id = saleId(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.submit(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, submittedAt: result.submittedAt });
  });
  const approver = (c: AppContext) => {
    if (!canApprove(c.get("principal"), "sale")) throw new AppError(403, "PERMISSION_DENIED");
  };
  api.post("/sale/:id/approve", async (c) => {
    approver(c);
    const id = saleId(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.approve(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/sale/:id/request-revision", async (c) => {
    approver(c);
    const id = saleId(c.req.param("id"));
    const { expectedVersion, note } = await jsonBody(c, reviseSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REVISE", note, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/sale/:id/reject", async (c) => {
    approver(c);
    const id = saleId(c.req.param("id"));
    const { expectedVersion, reason } = await jsonBody(c, rejectSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REJECT", reason, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
  api.post("/sale/:id/delete", async (c) => {
    requireGrant(c.get("principal"), "sale", "DELETE");
    const id = saleId(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.remove(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version });
  });
  api.post("/sale/:id/restore", async (c) => {
    requireGrant(c.get("principal"), "sale", "DELETE");
    const id = saleId(c.req.param("id"));
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.restore(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  });
}
