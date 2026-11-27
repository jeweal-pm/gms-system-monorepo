import { Readable } from "node:stream";
import type { Hono } from "hono";
import { z } from "zod";
import { AppError, validationError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, requireGrant } from "../../platform/auth/principal";
import { jsonBody, parse, queryObject, type AppContext, type AppEnv } from "../../platform/http";
import type { MergeSplitPhotoService } from "./photos";
import { getDetail, listDocuments, nextNumber, stockPage, stockPhotos } from "./read";
import { LEAF } from "./repository";
import type { MergeSplitService } from "./service";
import { EXCLUDE_MAX, listQuerySchema, mergeSplitInputSchema, mergeSplitUpdateSchema, nextNumberSchema, rejectSchema, reviseSchema, stockQuerySchema, versionSchema } from "./schemas";

/**
 * `/api/inventory/v1/merge-split*` (merge-split api-contract "Public endpoints", authorization.md): every route checks its live grant
 * on leaf `merge-split`; CSRF and the body caps come from the platform middleware (app.ts). Static paths are registered before
 * `/:id`. Request validation answers 400 VALIDATION_FAILED (`fieldErrors` paths `sources.N.*` / `results.N.*`).
 */
const docId = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, "MERGE_SPLIT_NOT_FOUND");
  return value;
};
const bangkokToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** `exclude` as a comma list and / or repeated (≤ 200 ids); every other key once. */
function stockQuery(c: AppContext) {
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
  return parse(stockQuerySchema, result);
}

type Handler = (c: AppContext) => Promise<Response>;
const route = (handler: Handler): Handler => async (c) => {
  try {
    return await handler(c);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") throw new AppError(400, "VALIDATION_FAILED", error.details, error.headers);
    throw error;
  }
};

export function registerMergeSplitRoutes(api: Hono<AppEnv>, deps: { db: Db; master: MasterApi; service: MergeSplitService; photos: MergeSplitPhotoService }) {
  const { db, master, service, photos } = deps;

  // ---------- reference ----------
  api.get("/merge-split/options", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const options = { requestId: c.get("requestId") };
    const [reference, numbering] = await Promise.all([master.reference(options), master.numbering(bangkokToday(), false, options, LEAF)]);
    return c.json({ companyCurrency: reference.companyCurrency, locations: reference.locations, numbering: { configured: numbering.numbering !== null } });
  }));
  api.get("/merge-split/next-number", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const { docDate } = parse(nextNumberSchema, queryObject(c));
    return c.json(await nextNumber(db, master, docDate, c.get("requestId")));
  }));
  api.get("/merge-split/stock", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await stockPage(db, stockQuery(c)));
  }));
  api.get("/merge-split/stock/:stockUuid/photos", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const stockUuid = c.req.param("stockUuid") ?? "";
    if (!z.uuid().safeParse(stockUuid).success) return c.json({ fileIds: [] });
    return c.json(await stockPhotos(db, stockUuid));
  }));

  // ---------- photos ----------
  api.post("/merge-split/photos", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "ADD", "EDIT");
    if (!/^multipart\/form-data/i.test(c.req.header("content-type") ?? "")) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE");
    const saved = await photos.writes.run(async () => {
      let form: FormData;
      try { form = await c.req.formData(); } catch { throw new AppError(400, "BAD_REQUEST"); }
      const file = form.get("file");
      return photos.uploadHeld(c.get("principal").userId, file instanceof File ? file : null);
    });
    return c.json(saved, 201);
  }));
  api.get("/merge-split/photos/:fileId", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const id = c.req.param("fileId") ?? "";
    if (!z.uuid().safeParse(id).success) throw new AppError(404, "PHOTO_NOT_FOUND");
    const file = await photos.reads.run(() => photos.open(c.get("principal").userId, id));
    return new Response(Readable.toWeb(file.stream) as unknown as ReadableStream, {
      status: 200,
      headers: { "Content-Type": file.contentType, "Content-Length": String(file.size), "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  }));

  // ---------- documents ----------
  api.get("/merge-split", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await listDocuments(db, parse(listQuerySchema, queryObject(c))));
  }));
  api.post("/merge-split", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "ADD");
    const input = await jsonBody(c, mergeSplitInputSchema);
    const result = await service.create(c.get("principal"), input, c.get("requestId"));
    return c.json({ id: result.id, docNo: result.docNo, version: result.version, status: result.status, stockIds: result.stockIds }, 201);
  }));
  api.get("/merge-split/:id", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await getDetail(db, docId(c.req.param("id") ?? "")));
  }));
  api.put("/merge-split/:id", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "EDIT");
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion, ...input } = await jsonBody(c, mergeSplitUpdateSchema);
    const result = await service.update(c.get("principal"), id, input, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, stockIds: result.stockIds });
  }));
  api.post("/merge-split/:id/submit", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "ADD", "EDIT");
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.submit(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, submittedAt: result.submittedAt });
  }));
  const approver = (c: AppContext) => {
    if (!canApprove(c.get("principal"), LEAF)) throw new AppError(403, "PERMISSION_DENIED");
  };
  api.post("/merge-split/:id/approve", route(async (c) => {
    approver(c);
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.approve(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, stockIds: result.stockIds });
  }));
  api.post("/merge-split/:id/request-revision", route(async (c) => {
    approver(c);
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion, note } = await jsonBody(c, reviseSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REVISE", note, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/merge-split/:id/reject", route(async (c) => {
    approver(c);
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion, reason } = await jsonBody(c, rejectSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REJECT", reason, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/merge-split/:id/delete", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "DELETE");
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.remove(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version });
  }));
  api.post("/merge-split/:id/restore", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "DELETE");
    const id = docId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.restore(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
}
