import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUTH_TIMEOUT_MS, callAuth } from "./auth-client";
import { describeError, domainError } from "./domain-error";
import {
  catalogOutputSchema,
  createUserInputSchema,
  deleteOutputSchema,
  locationOptionsOutputSchema,
  userDetailOutputSchema,
  userIdInputSchema,
  userListOutputSchema,
  userMutationOutputSchema,
  type PermissionAction,
} from "./user-admin-schemas";

export type HomeItem = { label: string; slug: string };
export type HomeGroup = { title: string; items: HomeItem[] };
export type SessionUser = { id: string; email: string; name: string; role?: string };
export type GatewayLicenseState = "VALID" | "EXPIRING" | "EXPIRED" | "REVOKED" | "REQUIRED" | "GRACE" | "UNVERIFIABLE";
export type GatewayLicenseStatus = {
  state: GatewayLicenseState;
  type?: "trial" | "paid";
  expiresAt?: string;
  daysRemaining?: number;
  checkedAt?: string;
  retryAfter?: number;
};
/** Trusted authorization block from auth session-context (ADR-0016). Missing/malformed = no grants. */
export type SessionAuthz = { isSuperAdmin: boolean; permissions: string[] };
export const NO_AUTHZ: SessionAuthz = { isSuperAdmin: false, permissions: [] };
export type TrpcContext = {
  session: { user: SessionUser } | null;
  license: GatewayLicenseStatus | null;
  authz: SessionAuthz;
  /** Caller cookie; forwarded only to auth internal endpoints. */
  cookie: string | null;
  activateLicense: ((licenseKey: string) => Promise<GatewayLicenseStatus>) | null;
};

const t = initTRPC.context<TrpcContext>().create({
  // Additive for existing procedures: copies the domain code and bounded field errors into `data`.
  errorFormatter({ shape, error }) {
    const { domainCode, fieldErrors } = describeError(error);
    return { ...shape, data: { ...shape.data, domainCode, fieldErrors } };
  },
});
const publicProcedure = t.procedure;
const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
const protectedProcedure = authenticatedProcedure.use(({ ctx, next }) => {
  const state = ctx.license?.state ?? "UNVERIFIABLE";
  if (state === "VALID" || state === "EXPIRING" || state === "GRACE") return next();
  if (state === "UNVERIFIABLE") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LICENSE_UNVERIFIABLE" });
  throw new TRPCError({ code: "FORBIDDEN", message: state === "EXPIRED" ? "LICENSE_EXPIRED" : state === "REVOKED" ? "LICENSE_REVOKED" : "LICENSE_REQUIRED" });
});
const licensedProcedure = protectedProcedure;

/** Super Admin only (role "admin"); never bypasses the license check above. */
const superAdminProcedure = licensedProcedure.use(({ ctx, next }) => {
  if (!ctx.authz.isSuperAdmin) throw domainError("FORBIDDEN", "SUPER_ADMIN_REQUIRED");
  return next();
});

/**
 * ADR-0016 rule for every menu-scoped procedure: declare `menuKey:action`. Super Admin passes;
 * others need the exact grant. Price/cost fields additionally require `menuKey:PRICE`.
 */
export function permittedProcedure(menuKey: string, action: PermissionAction) {
  const required = `${menuKey}:${action}`;
  return licensedProcedure.use(({ ctx, next }) => {
    if (!ctx.authz.isSuperAdmin && !ctx.authz.permissions.includes(required)) throw domainError("FORBIDDEN", "PERMISSION_DENIED");
    return next();
  });
}

export const shortcutGroups: HomeGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }, { label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  { title: "Company", items: [{ label: "Company Profile", slug: "company-profile" }, { label: "Bank", slug: "bank" }] },
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor" }, { label: "Customer", slug: "customer" }] },
  { title: "Stone Master", items: ["Stone Group", "Stone", "Shape", "Size", "Color", "Cutting", "Quality", "Clarity"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Purchase Order", items: [{ label: "Purchase Order", slug: "purchase-order" }, { label: "Purchase (PU)", slug: "purchase" }] },
  { title: "Memo", items: ["Memo In", "Memo Return", "Memo Out", "Memo Out Return"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Inventory", items: ["Load", "Primary", "Consignment", "Movement", "Memo Outstanding"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
  { title: "Finance", items: [{ label: "Receivable", slug: "receivable" }, { label: "Payable", slug: "payable" }] },
  { title: "Setup", items: ["Main Location", "Sub Location", "Currency", "Certificate Type", "Labour Type"].map((label) => ({ label, slug: label.toLowerCase().replaceAll(" ", "-") })) },
];

export const appRouter = t.router({
  system: t.router({ health: publicProcedure.query(() => ({ status: "ok" as const })) }),
  dashboard: t.router({ shortcutGroups: licensedProcedure.query(() => shortcutGroups) }),
  session: t.router({ current: authenticatedProcedure.query(({ ctx }) => ctx.session) }),
  license: t.router({
    status: authenticatedProcedure.query(({ ctx }) => {
      const status = ctx.license ?? { state: "UNVERIFIABLE" as const };
      if (status.state === "UNVERIFIABLE") throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LICENSE_UNVERIFIABLE" });
      return status;
    }),
    activate: authenticatedProcedure
      .input(z.object({ licenseKey: z.string().trim().min(1).max(128) }).strict())
      .mutation(async ({ ctx, input }) => {
        if (!ctx.activateLicense) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
        return ctx.activateLicense(input.licenseKey);
      }),
  }),
  permission: t.router({
    catalog: licensedProcedure.query(({ ctx }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: "/internal/v1/permission/catalog", timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: catalogOutputSchema,
    })),
    mine: licensedProcedure.query(({ ctx }) => ({
      isSuperAdmin: ctx.authz.isSuperAdmin,
      permissions: ctx.authz.isSuperAdmin ? "ALL" as const : ctx.authz.permissions,
    })),
  }),
  userAdmin: t.router({
    list: superAdminProcedure.query(({ ctx }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: "/internal/v1/user-admin/users", timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: userListOutputSchema,
    })),
    get: superAdminProcedure.input(userIdInputSchema).query(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: `/internal/v1/user-admin/users/${encodeURIComponent(input.id)}`, timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: userDetailOutputSchema,
    })),
    create: superAdminProcedure.input(createUserInputSchema).mutation(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "POST", path: "/internal/v1/user-admin/users", timeoutMs: AUTH_TIMEOUT_MS.create, responseSchema: userMutationOutputSchema, body: input,
    })),
    delete: superAdminProcedure.input(userIdInputSchema).mutation(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "DELETE", path: `/internal/v1/user-admin/users/${encodeURIComponent(input.id)}`, timeoutMs: AUTH_TIMEOUT_MS.write, responseSchema: deleteOutputSchema,
    })),
    locationOptions: superAdminProcedure.query(({ ctx }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: "/internal/v1/user-admin/location-options", timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: locationOptionsOutputSchema,
    })),
  }),
});

export type AppRouter = typeof appRouter;
