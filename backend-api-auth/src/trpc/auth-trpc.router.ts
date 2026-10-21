import { HttpException, HttpStatus } from "@nestjs/common";
import { initTRPC, TRPCError } from "@trpc/server";
import type { Request } from "express";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth/auth";
import { LicenseDomainError, LicenseService } from "../license/license.service";
import type { LicensePublicStatus } from "../license/license.types";
import { loadSessionAuthz } from "../permission/grants";
import { createUserInputSchema, updateUserInputSchema, userIdSchema } from "../user-admin/user-admin.schemas";
import { UserAdminService, type Actor } from "../user-admin/user-admin.service";
import { assertAuthTrpcCsrf } from "./auth-trpc.csrf";

export type AuthTrpcUser = { id: string; username: string; email: string; name: string; role?: string };
export type AuthTrpcSession = { user: AuthTrpcUser };
export type AuthTrpcLicense = LicensePublicStatus | { state: "UNVERIFIABLE"; checkedAt: string };
export type AuthTrpcContext = { req: Request; session: AuthTrpcSession | null; license: AuthTrpcLicense | null; authz: { isSuperAdmin: boolean; permissions: string[] } };

export type AuthTrpcDependencies = { userAdmin: UserAdminService; licenseService: LicenseService };

const t = initTRPC.context<AuthTrpcContext>().create({
  errorFormatter({ shape, error }) {
    const domain = describeDomainError(error);
    return { ...shape, data: { ...shape.data, domainCode: domain.code, fieldErrors: domain.fieldErrors } };
  },
});

const authenticated = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
const licensed = authenticated.use(({ ctx, next }) => {
  const state = ctx.license?.state ?? "UNVERIFIABLE";
  if (["VALID", "EXPIRING", "GRACE"].includes(state)) return next();
  if (state === "UNVERIFIABLE") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LICENSE_UNVERIFIABLE" });
  throw new TRPCError({ code: "FORBIDDEN", message: state === "EXPIRED" ? "LICENSE_EXPIRED" : state === "REVOKED" ? "LICENSE_REVOKED" : "LICENSE_REQUIRED" });
});

const userIdInput = z.object({ id: userIdSchema }).strict();
const updateInput = updateUserInputSchema.extend({ id: userIdSchema });
const activationInput = z.object({ licenseKey: z.string().trim().min(1).max(128) }).strict();
const empty = z.void();

const shortcutGroups = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }] },
  { title: "Setup", items: [{ label: "Company Profile", slug: "company-profile" }, { label: "Notifications", slug: "notifications" }] },
  { title: "Master Code", items: [{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }, { label: "Stone Master", slug: "stone-master" }, { label: "Location Master", slug: "location-master" }, { label: "Certificate Type", slug: "certificate-type" }, { label: "Service Fee", slug: "labor-name" }, { label: "Sale Person", slug: "sale-person" }] },
  { title: "Pre-Sale", items: [{ label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Memo", items: [{ label: "Memo Receive", slug: "memo-receive" }, { label: "Memo Return", slug: "memo-return" }, { label: "Memo Out", slug: "memo-out" }, { label: "Memo Out-Return", slug: "memo-out-return" }, { label: "Memo Outstanding (From Vendor)", slug: "memo-outstanding-vendor" }, { label: "Memo Outstanding (From Customer)", slug: "memo-outstanding-customer" }] },
  { title: "Purchase", items: [{ label: "Purchase Order (PO)", slug: "purchase-order" }, { label: "Purchase", slug: "purchase" }, { label: "Purchase Outstanding", slug: "purchase-outstanding" }] },
  { title: "Inventory", items: [{ label: "Load to Stock", slug: "load-to-stock" }, { label: "Merge/Split", slug: "merge-split" }, { label: "Stock Transfer Location", slug: "stock-transfer-location" }, { label: "Stock Adjustment", slug: "stock-adjustment" }, { label: "Barcode", slug: "barcode" }] },
  { title: "Sale", items: [{ label: "Sale", slug: "sale" }] },
  { title: "Account", items: [{ label: "Payable", slug: "payable" }, { label: "Receivable", slug: "receivable" }, { label: "Outstanding Payable", slug: "outstanding-payable" }, { label: "Outstanding Receivable", slug: "outstanding-receivable" }] },
  { title: "Report", items: [{ label: "Stock Movement (Primary Stock)", slug: "stock-movement-primary" }, { label: "Stock Movement (Consignment Stock)", slug: "stock-movement-consignment" }, { label: "Closing Stock (Primary Stock)", slug: "closing-stock-primary" }, { label: "Closing Stock (Consignment Stock)", slug: "closing-stock-consignment" }, { label: "Compare with costing", slug: "sale-report-costing" }, { label: "Shareholder Report", slug: "sale-report-shareholder" }, { label: "Commission Report", slug: "sale-report-commission" }] },
];

export function shortcutGroupsFor(authz: AuthTrpcContext["authz"]) {
  if (authz.isSuperAdmin) return shortcutGroups;
  const granted = new Set(authz.permissions);
  if (!granted.has("dashboard:VIEW")) return [];
  return shortcutGroups.map((group) => ({ ...group, items: group.items.filter((item) => granted.has(`${item.slug}:VIEW`)) })).filter((group) => group.items.length > 0);
}

/** Compatibility router for auth-owned procedures formerly served by the gateway. */
export function createAuthTrpcRouter(dependencies: AuthTrpcDependencies) {
  const { userAdmin, licenseService } = dependencies;
  return t.router({
    dashboard: t.router({ shortcutGroups: licensed.query(({ ctx }) => shortcutGroupsFor(ctx.authz)) }),
    session: t.router({ current: authenticated.query(({ ctx }) => ctx.session) }),
    license: t.router({
      status: authenticated.query(async ({ ctx }) => {
        try { return await licenseService.resolveStatus(ctx.session.user.id, ctx.session.user.username); }
        catch (error) {
          if (error instanceof LicenseDomainError && error.code === "LICENSE_REQUIRED") return { state: "REQUIRED" as const, checkedAt: new Date().toISOString() };
          throw toTrpcError(error);
        }
      }),
      activate: authenticated.input(activationInput).mutation(async ({ ctx, input }) => {
        try { return await licenseService.activate(ctx.session.user.id, ctx.session.user.username, input.licenseKey); }
        catch (error) { throw toTrpcError(error); }
      }),
    }),
    permission: t.router({
      catalog: licensed.query(async ({ ctx }) => {
        await requireUserAdmin(userAdmin, ctx.req, "VIEW");
        return userAdmin.catalog();
      }),
      mine: licensed.query(({ ctx }) => ({ isSuperAdmin: ctx.authz.isSuperAdmin, permissions: ctx.authz.isSuperAdmin ? "ALL" as const : ctx.authz.permissions })),
    }),
    userAdmin: t.router({
      list: licensed.input(empty).query(async ({ ctx }) => { await requireUserAdmin(userAdmin, ctx.req, "VIEW"); return userAdmin.list(); }),
      get: licensed.input(userIdInput).query(async ({ ctx, input }) => { const actor = await requireUserAdmin(userAdmin, ctx.req, "VIEW"); return userAdmin.get(actor, input.id); }),
      create: licensed.input(createUserInputSchema).mutation(async ({ ctx, input }) => { const actor = await requireUserAdmin(userAdmin, ctx.req, "ADD"); return userAdmin.create(actor, input); }),
      update: licensed.input(updateInput).mutation(async ({ ctx, input }) => { const { id, ...body } = input; const actor = await requireUserAdmin(userAdmin, ctx.req, "EDIT"); return userAdmin.update(actor, id, body); }),
      delete: licensed.input(userIdInput).mutation(async ({ ctx, input }) => { const actor = await requireUserAdmin(userAdmin, ctx.req, "DELETE"); return userAdmin.delete(actor, input.id); }),
      removePhoto: licensed.input(userIdInput).mutation(async ({ ctx, input }) => { const actor = await requireUserAdmin(userAdmin, ctx.req, "EDIT"); return userAdmin.removePhoto(actor, input.id); }),
      locationOptions: licensed.input(empty).query(async ({ ctx }) => { await requireUserAdmin(userAdmin, ctx.req, "VIEW"); return userAdmin.locationOptions(); }),
    }),
  });
}

export type AuthAppRouter = ReturnType<typeof createAuthTrpcRouter>;
/** Stable consumer name retained for typed frontend imports. */
export type AuthRouter = AuthAppRouter;

/** Resolve Better Auth session and fresh license/grants at request time, matching gateway context. */
export async function createAuthTrpcContext(request: Request, licenseService: LicenseService): Promise<AuthTrpcContext> {
  // Fail before Better Auth / Prisma / license calls; parent mounts this context on the direct route.
  assertAuthTrpcCsrf(request);
  const rawSession = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!rawSession || rawSession.user.active === false) return { req: request, session: null, license: null, authz: { isSuperAdmin: false, permissions: [] } };
  const user: AuthTrpcUser = {
    id: rawSession.user.id,
    username: rawSession.user.username ?? "",
    email: rawSession.user.email,
    name: rawSession.user.name,
    role: typeof rawSession.user.role === "string" ? rawSession.user.role : "user",
  };
  const authz = await loadSessionAuthz(user.id, user.role ?? "");
  let license: AuthTrpcLicense;
  try { license = await licenseService.resolveStatus(user.id, user.username); }
  catch (error) {
    license = { state: error instanceof LicenseDomainError && error.code === "LICENSE_REQUIRED" ? "REQUIRED" : "UNVERIFIABLE", checkedAt: new Date().toISOString() };
  }
  return { req: request, session: { user }, license, authz };
}

async function requireUserAdmin(service: UserAdminService, request: Request, action: "VIEW" | "ADD" | "EDIT" | "DELETE"): Promise<Actor> {
  try { return await service.requireAccess(request, action); }
  catch (error) { throw toTrpcError(error); }
}

function toTrpcError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  if (error instanceof LicenseDomainError) return new TRPCError({ code: statusToTrpc(error.httpStatus), message: error.code, cause: error });
  if (error instanceof HttpException) {
    const body = error.getResponse();
    const detail = typeof body === "object" && body !== null && "error" in body ? (body as { error?: { code?: unknown; fieldErrors?: unknown } }).error : undefined;
    const code = typeof detail?.code === "string" ? detail.code : error.message;
    return new TRPCError({ code: statusToTrpc(error.getStatus()), message: code, cause: error });
  }
  return error instanceof Error ? new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Request failed", cause: error }) : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Request failed" });
}

function describeDomainError(error: TRPCError): { code: string | null; fieldErrors: unknown[] | null } {
  const cause = error.cause;
  if (cause instanceof HttpException) {
    const body = cause.getResponse();
    if (typeof body === "object" && body !== null && "error" in body) {
      const detail = (body as { error?: { code?: unknown; fieldErrors?: unknown } }).error;
      return { code: typeof detail?.code === "string" ? detail.code : null, fieldErrors: Array.isArray(detail?.fieldErrors) ? detail.fieldErrors.slice(0, 50) : null };
    }
  }
  if (error.code === "BAD_REQUEST" && typeof error.cause === "object" && error.cause !== null && "issues" in error.cause && Array.isArray((error.cause as { issues?: unknown }).issues)) {
    const issues = (error.cause as { issues: Array<{ path?: PropertyKey[]; code?: unknown }> }).issues;
    const fieldErrors = issues.slice(0, 50).map((issue) => ({ path: (issue.path ?? []).map(String).join(".").slice(0, 128) || "(root)", code: typeof issue.code === "string" ? issue.code.slice(0, 64) : "invalid" }));
    const passwordOnly = issues.length > 0 && issues.every((issue) => issue.path?.[0] === "password" && issue.code !== "invalid_type");
    return { code: passwordOnly ? "PASSWORD_POLICY_VIOLATION" : "VALIDATION_ERROR", fieldErrors };
  }
  return { code: /^[A-Z][A-Z_]{1,63}$/.test(error.message) ? error.message : null, fieldErrors: null };
}

function statusToTrpc(status: number): TRPCError["code"] {
  if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.UNPROCESSABLE_ENTITY) return "BAD_REQUEST";
  if (status === HttpStatus.UNAUTHORIZED) return "UNAUTHORIZED";
  if (status === HttpStatus.FORBIDDEN) return "FORBIDDEN";
  if (status === HttpStatus.NOT_FOUND) return "NOT_FOUND";
  if (status === HttpStatus.CONFLICT) return "CONFLICT";
  if (status === HttpStatus.TOO_MANY_REQUESTS) return "TOO_MANY_REQUESTS";
  if (status === HttpStatus.SERVICE_UNAVAILABLE) return "SERVICE_UNAVAILABLE";
  return "INTERNAL_SERVER_ERROR";
}
