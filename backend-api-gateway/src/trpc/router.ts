import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUTH_TIMEOUT_MS, callAuth } from "./auth-client";
import {
  assertSingleDefaults,
  createCustomerInputSchema,
  customerDeleteOutputSchema,
  customerDetailOutputSchema,
  customerIdInputSchema,
  customerListInputSchema,
  customerListOutputSchema,
  customerMutationOutputSchema,
  customerOptionsOutputSchema,
  updateCustomerInputSchema,
} from "./customer-schemas";
import { describeError, domainError } from "./domain-error";
import { callPartner, PARTNER_TIMEOUT_MS } from "./partner-client";
import { listQueryString } from "./partner-schemas";
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
import {
  assertVendorDefaults,
  createVendorInputSchema,
  updateVendorInputSchema,
  vendorDeleteOutputSchema,
  vendorDetailOutputSchema,
  vendorIdInputSchema,
  vendorListInputSchema,
  vendorListOutputSchema,
  vendorMutationOutputSchema,
  vendorOptionsOutputSchema,
} from "./vendor-schemas";

/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer, vendor). */
export type HomeItem = { label: string; slug: string; href?: string };
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
  { title: "Partner Master", items: [{ label: "Vendor", slug: "vendor", href: "/setup/vendor" }, { label: "Customer", slug: "customer", href: "/setup/customer" }] },
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
  /** customer SA revision 1 (ADR-0018): gateway enforces `customer:*`; partner owns the data. */
  customer: t.router({
    list: permittedProcedure("customer", "VIEW").input(customerListInputSchema).query(({ ctx, input }) => callPartner({
      method: "GET", path: `/internal/v1/customers?${listQueryString(input)}`, route: "GET /customers", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: customerListOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND",
    })),
    get: permittedProcedure("customer", "VIEW").input(customerIdInputSchema).query(({ ctx, input }) => callPartner({
      method: "GET", path: `/internal/v1/customers/${encodeURIComponent(input.id)}`, route: "GET /customers/:id", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: customerDetailOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND",
    })),
    options: permittedProcedure("customer", "VIEW").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/customers/options", route: "GET /customers/options", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: customerOptionsOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND",
    })),
    create: permittedProcedure("customer", "ADD").input(createCustomerInputSchema).mutation(({ ctx, input }) => {
      assertSingleDefaults(input);
      return callPartner({
        method: "POST", path: "/internal/v1/customers", route: "POST /customers", timeoutMs: PARTNER_TIMEOUT_MS.write,
        actorId: ctx.session.user.id, responseSchema: customerMutationOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND", body: input,
      });
    }),
    update: permittedProcedure("customer", "EDIT").input(updateCustomerInputSchema).mutation(({ ctx, input }) => {
      assertSingleDefaults(input);
      const { id, ...body } = input;
      return callPartner({
        method: "PUT", path: `/internal/v1/customers/${encodeURIComponent(id)}`, route: "PUT /customers/:id", timeoutMs: PARTNER_TIMEOUT_MS.write,
        actorId: ctx.session.user.id, responseSchema: customerMutationOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND", body,
      });
    }),
    delete: permittedProcedure("customer", "DELETE").input(customerIdInputSchema).mutation(({ ctx, input }) => callPartner({
      method: "DELETE", path: `/internal/v1/customers/${encodeURIComponent(input.id)}`, route: "DELETE /customers/:id", timeoutMs: PARTNER_TIMEOUT_MS.write,
      actorId: ctx.session.user.id, responseSchema: customerDeleteOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND",
    })),
  }),
  /** vendor SA revision 1 (ADR-0019): gateway enforces `vendor:*`; partner owns the data. */
  vendor: t.router({
    list: permittedProcedure("vendor", "VIEW").input(vendorListInputSchema).query(({ ctx, input }) => callPartner({
      method: "GET", path: `/internal/v1/vendors?${listQueryString(input)}`, route: "GET /vendors", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: vendorListOutputSchema, notFoundCode: "VENDOR_NOT_FOUND",
    })),
    get: permittedProcedure("vendor", "VIEW").input(vendorIdInputSchema).query(({ ctx, input }) => callPartner({
      method: "GET", path: `/internal/v1/vendors/${encodeURIComponent(input.id)}`, route: "GET /vendors/:id", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: vendorDetailOutputSchema, notFoundCode: "VENDOR_NOT_FOUND",
    })),
    options: permittedProcedure("vendor", "VIEW").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/vendors/options", route: "GET /vendors/options", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: vendorOptionsOutputSchema, notFoundCode: "VENDOR_NOT_FOUND",
    })),
    create: permittedProcedure("vendor", "ADD").input(createVendorInputSchema).mutation(({ ctx, input }) => {
      assertVendorDefaults(input);
      return callPartner({
        method: "POST", path: "/internal/v1/vendors", route: "POST /vendors", timeoutMs: PARTNER_TIMEOUT_MS.write,
        actorId: ctx.session.user.id, responseSchema: vendorMutationOutputSchema, notFoundCode: "VENDOR_NOT_FOUND", body: input,
      });
    }),
    update: permittedProcedure("vendor", "EDIT").input(updateVendorInputSchema).mutation(({ ctx, input }) => {
      assertVendorDefaults(input);
      const { id, ...body } = input;
      return callPartner({
        method: "PUT", path: `/internal/v1/vendors/${encodeURIComponent(id)}`, route: "PUT /vendors/:id", timeoutMs: PARTNER_TIMEOUT_MS.write,
        actorId: ctx.session.user.id, responseSchema: vendorMutationOutputSchema, notFoundCode: "VENDOR_NOT_FOUND", body,
      });
    }),
    delete: permittedProcedure("vendor", "DELETE").input(vendorIdInputSchema).mutation(({ ctx, input }) => callPartner({
      method: "DELETE", path: `/internal/v1/vendors/${encodeURIComponent(input.id)}`, route: "DELETE /vendors/:id", timeoutMs: PARTNER_TIMEOUT_MS.write,
      actorId: ctx.session.user.id, responseSchema: vendorDeleteOutputSchema, notFoundCode: "VENDOR_NOT_FOUND",
    })),
  }),
});

export type AppRouter = typeof appRouter;
