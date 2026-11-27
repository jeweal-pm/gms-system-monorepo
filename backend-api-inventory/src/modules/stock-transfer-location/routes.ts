import type { Hono } from "hono";
import { z } from "zod";
import { AppError, validationError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, requireGrant } from "../../platform/auth/principal";
import { jsonBody, parse, queryObject, type AppContext, type AppEnv } from "../../platform/http";
import { transferStockPage } from "../stock/lots";
import { getDetail, listDocuments, nextNumber } from "./read";
import type { StockTransferService } from "./service";
import { EXCLUDE_MAX, listQuerySchema, nextNumberSchema, rejectSchema, reviseSchema, stockQuerySchema, transferInputSchema, transferUpdateSchema, versionSchema } from "./schemas";

/**
 * `/api/inventory/v1/stock-transfer-location*` (api-contract "Public endpoints", ADR-0060 D1): every route checks its live grant on
 * leaf `stock-transfer-location`; CSRF and the 256 KiB body cap come from the platform middleware (app.ts). Static paths are
 * registered before `/:id`.
 */
const LEAF = "stock-transfer-location" as const;
const transferId = (value: string) => {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, "STOCK_TRANSFER_NOT_FOUND");
  return value;
};

/** Bangkok business date (YYYY-MM-DD) for the "is numbering configured" probe of the options. */
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

/**
 * Contract code alignment (api-contract "Errors"): this module reports request validation as 400 VALIDATION_FAILED (same
 * `fieldErrors` details, paths `lines.N.<field>`), instead of the platform's 422 VALIDATION_ERROR used by older modules.
 */
type Handler = (c: AppContext) => Promise<Response>;
const route = (handler: Handler): Handler => async (c) => {
  try {
    return await handler(c);
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION_ERROR") throw new AppError(400, "VALIDATION_FAILED", error.details, error.headers);
    throw error;
  }
};

export function registerStockTransferRoutes(api: Hono<AppEnv>, deps: { db: Db; master: MasterApi; service: StockTransferService }) {
  const { db, master, service } = deps;

  // ---------- reference ----------
  api.get("/stock-transfer-location/options", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const options = { requestId: c.get("requestId") };
    const [reference, numbering] = await Promise.all([master.reference(options), master.numbering(bangkokToday(), false, options, LEAF)]);
    return c.json({ locations: reference.locations, numbering: { configured: numbering.numbering !== null } });
  }));
  api.get("/stock-transfer-location/next-number", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    const { docDate } = parse(nextNumberSchema, queryObject(c));
    return c.json(await nextNumber(db, master, docDate, c.get("requestId")));
  }));
  api.get("/stock-transfer-location/stock", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await transferStockPage(db, stockQuery(c)));
  }));

  // ---------- documents ----------
  api.get("/stock-transfer-location", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await listDocuments(db, parse(listQuerySchema, queryObject(c))));
  }));
  api.post("/stock-transfer-location", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "ADD");
    const input = await jsonBody(c, transferInputSchema);
    const result = await service.create(c.get("principal"), input, c.get("requestId"));
    return c.json({ id: result.id, docNo: result.docNo, version: result.version, status: result.status }, 201);
  }));
  api.get("/stock-transfer-location/:id", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "VIEW");
    return c.json(await getDetail(db, transferId(c.req.param("id") ?? "")));
  }));
  api.put("/stock-transfer-location/:id", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "EDIT");
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion, ...input } = await jsonBody(c, transferUpdateSchema);
    const result = await service.update(c.get("principal"), id, input, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/stock-transfer-location/:id/submit", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "ADD", "EDIT");
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.submit(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status, submittedAt: result.submittedAt });
  }));
  const approver = (c: AppContext) => {
    if (!canApprove(c.get("principal"), LEAF)) throw new AppError(403, "PERMISSION_DENIED");
  };
  api.post("/stock-transfer-location/:id/approve", route(async (c) => {
    approver(c);
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.approve(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/stock-transfer-location/:id/request-revision", route(async (c) => {
    approver(c);
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion, note } = await jsonBody(c, reviseSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REVISE", note, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/stock-transfer-location/:id/reject", route(async (c) => {
    approver(c);
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion, reason } = await jsonBody(c, rejectSchema);
    const result = await service.review(c.get("principal"), id, expectedVersion, "REJECT", reason, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
  api.post("/stock-transfer-location/:id/delete", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "DELETE");
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.remove(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version });
  }));
  api.post("/stock-transfer-location/:id/restore", route(async (c) => {
    requireGrant(c.get("principal"), LEAF, "DELETE");
    const id = transferId(c.req.param("id") ?? "");
    const { expectedVersion } = await jsonBody(c, versionSchema);
    const result = await service.restore(c.get("principal"), id, expectedVersion, c.get("requestId"));
    return c.json({ id: result.id, version: result.version, status: result.status });
  }));
}
