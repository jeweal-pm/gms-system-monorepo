import { z } from "zod";
import type { Context, Hono } from "hono";
import { AppError, validationError } from "../../platform/errors";
import type { Db } from "../../platform/db";
import type { MasterApi } from "../../platform/master-api";
import { canApprove, requireGrant } from "../../platform/auth/principal";
import { jsonBody, parse, queryObject, type AppEnv } from "../../platform/http";
import { getDetail, listDocuments, nextNumber, stockPage } from "./read";
import type { StockAdjustmentService } from "./service";
import { inputSchema, listQuerySchema, nextNumberSchema, pendingQuerySchema, rejectSchema, reviseSchema, stockQuerySchema, updateSchema, versionSchema } from "./schemas";

function idParam(value: string) {
  if (!z.uuid().safeParse(value).success) throw new AppError(404, "STOCK_ADJUSTMENT_NOT_FOUND");
  return value;
}
function stockQuery(c: Context<AppEnv>) {
  const all = c.req.queries(); const raw: Record<string, unknown> = {};
  for (const [key, values] of Object.entries(all)) {
    if (key === "exclude") continue;
    if (values.length !== 1) throw validationError([{ path: key, code: "invalid" }]);
    raw[key] = values[0];
  }
  raw.exclude = [...new Set((all.exclude ?? []).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean))];
  return parse(stockQuerySchema, raw);
}

export function registerStockAdjustmentRoutes(api: Hono<AppEnv>, deps: { db: Db; master: MasterApi; service: StockAdjustmentService }) {
  const { db, master, service } = deps;
  api.get("/stock-adjustment/options", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "VIEW");
    const [reference, numbering] = await Promise.all([
      master.reference({ requestId: c.get("requestId") }),
      master.numbering(new Date().toISOString().slice(0, 10), false, { requestId: c.get("requestId") }, "stock-adjustment"),
    ]);
    return c.json({ locations: reference.locations, numbering: { configured: Boolean(numbering.numbering) } });
  });
  api.get("/stock-adjustment/next-number", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "VIEW");
    const { docDate } = parse(nextNumberSchema, queryObject(c));
    return c.json(await nextNumber(db, master, docDate, c.get("requestId")));
  });
  api.get("/stock-adjustment/stock", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "VIEW");
    return c.json(await stockPage(db, stockQuery(c)));
  });
  api.get("/stock-adjustment", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "VIEW");
    return c.json(await listDocuments(db, parse(listQuerySchema, queryObject(c))));
  });
  api.post("/stock-adjustment", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "ADD");
    const result = await service.create(c.get("principal"), await jsonBody(c, inputSchema), c.get("requestId"));
    return c.json(result, 201);
  });
  api.get("/stock-adjustment/:id", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "VIEW");
    return c.json(await getDetail(db, idParam(c.req.param("id")), c.get("principal")));
  });
  api.put("/stock-adjustment/:id", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "EDIT");
    const id = idParam(c.req.param("id")); const { expectedVersion, ...input } = await jsonBody(c, updateSchema);
    return c.json(await service.update(c.get("principal"), id, input, expectedVersion, c.get("requestId")));
  });
  api.post("/stock-adjustment/:id/submit", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "ADD", "EDIT");
    const id = idParam(c.req.param("id")); const { expectedVersion } = await jsonBody(c, versionSchema);
    return c.json(await service.submit(c.get("principal"), id, expectedVersion));
  });
  const approver = (c: Context<AppEnv>) => {
    if (!canApprove(c.get("principal"), "stock-adjustment")) throw new AppError(403, "PERMISSION_DENIED");
  };
  api.post("/stock-adjustment/:id/approve", async (c) => {
    approver(c); const id = idParam(c.req.param("id")); const { expectedVersion } = await jsonBody(c, versionSchema);
    return c.json(await service.approve(c.get("principal"), id, expectedVersion));
  });
  api.post("/stock-adjustment/:id/request-revision", async (c) => {
    approver(c); const id = idParam(c.req.param("id")); const { expectedVersion, note } = await jsonBody(c, reviseSchema);
    return c.json(await service.review(c.get("principal"), id, expectedVersion, "REVISE", note));
  });
  api.post("/stock-adjustment/:id/reject", async (c) => {
    approver(c); const id = idParam(c.req.param("id")); const { expectedVersion, reason } = await jsonBody(c, rejectSchema);
    return c.json(await service.review(c.get("principal"), id, expectedVersion, "REJECT", reason));
  });
  api.post("/stock-adjustment/:id/delete", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "DELETE"); const id = idParam(c.req.param("id")); const { expectedVersion } = await jsonBody(c, versionSchema);
    return c.json(await service.remove(c.get("principal"), id, expectedVersion));
  });
  api.post("/stock-adjustment/:id/restore", async (c) => {
    requireGrant(c.get("principal"), "stock-adjustment", "DELETE"); const id = idParam(c.req.param("id")); const { expectedVersion } = await jsonBody(c, versionSchema);
    return c.json(await service.restore(c.get("principal"), id, expectedVersion));
  });
}

export { pendingQuerySchema };
