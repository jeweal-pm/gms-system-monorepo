import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUTH_TIMEOUT_MS, callAuth } from "./auth-client";
import {
  companyProfileGetOutputSchema,
  companyProfileMutationOutputSchema,
  companyProfileOptionsOutputSchema,
  removeLogoInputSchema,
  saveCompanyProfileInputSchema,
} from "./company-profile-schemas";
import {
  assertSingleDefaults,
  createCustomerInputSchema,
  customerDeleteOutputSchema,
  customerDetailOutputSchema,
  customerIdInputSchema,
  customerListInputSchema,
  customerListOutputSchema,
  customerMutationOutputSchema,
  customerNextCodeOutputSchema,
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
  updateUserInputSchema,
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
  vendorNextCodeOutputSchema,
  vendorOptionsOutputSchema,
} from "./vendor-schemas";

/** `href` overrides the default `/modules/<slug>` link when the item has a real page (customer, vendor). */
export type HomeItem = { label: string; slug: string; href?: string };
export type HomeGroup = { title: string; items: HomeItem[] };
/** `username` is the identity (ADR-0020); `email` is the internal `<id>@users.invalid`, never shown. */
export type SessionUser = { id: string; username: string; email: string; name: string; role?: string };
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

/** Catalog leaf gating the User and Permission page and `userAdmin.*` (delegated-admin.md DA-01). */
const USER_ADMIN_MENU_KEY = "user-and-permission";

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

/**
 * Home shortcuts follow permission catalog v2 (ADR-0020): every `slug` is a v2 menu key and is
 * shown only with `<slug>:VIEW`. "User and Permission" is opened from Setup (ADR-0023), so it is
 * not a shortcut. Keep in sync with auth `src/permission/catalog.ts`.
 */
export const shortcutGroups: HomeGroup[] = [
  { title: "Main Menu", items: [{ label: "Dashboard", slug: "dashboard" }] },
  { title: "Setup", items: [{ label: "Company Profile", slug: "company-profile" }, { label: "Notifications", slug: "notifications" }] },
  {
    title: "Master Code",
    items: [
      { label: "Vendor", slug: "vendor", href: "/setup/vendor" },
      { label: "Customer", slug: "customer", href: "/setup/customer" },
      { label: "Stone Master", slug: "stone-master" },
      { label: "Location Master", slug: "location-master" },
      { label: "Certificate Type", slug: "certificate-type" },
      { label: "Labor Name", slug: "labor-name" },
      { label: "Sale Person", slug: "sale-person" },
    ],
  },
  { title: "Pre-Sale", items: [{ label: "Quotation", slug: "quotation" }, { label: "Reserve", slug: "reserve" }] },
  {
    title: "Memo",
    items: [
      { label: "Memo Receive", slug: "memo-receive" },
      { label: "Memo Return", slug: "memo-return" },
      { label: "Memo Out", slug: "memo-out" },
      { label: "Memo Out-Return", slug: "memo-out-return" },
      { label: "Memo Outstanding (From Vendor)", slug: "memo-outstanding-vendor" },
      { label: "Memo Outstanding (From Customer)", slug: "memo-outstanding-customer" },
    ],
  },
  { title: "Purchase", items: [{ label: "Purchase Order (PO)", slug: "purchase-order" }, { label: "Purchase", slug: "purchase" }, { label: "Purchase Outstanding", slug: "purchase-outstanding" }] },
  {
    title: "Inventory",
    items: [
      { label: "Load to Stock", slug: "load-to-stock" },
      { label: "Merge/Split", slug: "merge-split" },
      { label: "Stock Transfer Location", slug: "stock-transfer-location" },
      { label: "Stock Adjustment", slug: "stock-adjustment" },
      { label: "Barcode", slug: "barcode" },
    ],
  },
  { title: "Sale", items: [{ label: "Sale", slug: "sale" }] },
  {
    title: "Account",
    items: [
      { label: "Payable", slug: "payable" },
      { label: "Receivable", slug: "receivable" },
      { label: "Outstanding Payable", slug: "outstanding-payable" },
      { label: "Outstanding Receivable", slug: "outstanding-receivable" },
    ],
  },
  {
    title: "Report",
    items: [
      { label: "Stock Movement (Primary Stock)", slug: "stock-movement-primary" },
      { label: "Stock Movement (Consignment Stock)", slug: "stock-movement-consignment" },
      { label: "Closing Stock (Primary Stock)", slug: "closing-stock-primary" },
      { label: "Closing Stock (Consignment Stock)", slug: "closing-stock-consignment" },
      { label: "Compare with costing", slug: "sale-report-costing" },
      { label: "Shareholder Report", slug: "sale-report-shareholder" },
      { label: "Commission Report", slug: "sale-report-commission" },
    ],
  },
];

/**
 * Super Admin sees every shortcut. Others need `dashboard:VIEW` to get any shortcut at all, then
 * each item needs `<slug>:VIEW`; groups left empty are omitted.
 */
export function shortcutGroupsFor(authz: SessionAuthz): HomeGroup[] {
  if (authz.isSuperAdmin) return shortcutGroups;
  const granted = new Set(authz.permissions);
  if (!granted.has("dashboard:VIEW")) return [];
  return shortcutGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => granted.has(`${item.slug}:VIEW`)) }))
    .filter((group) => group.items.length > 0);
}

export const appRouter = t.router({
  system: t.router({ health: publicProcedure.query(() => ({ status: "ok" as const })) }),
  dashboard: t.router({ shortcutGroups: licensedProcedure.query(({ ctx }) => shortcutGroupsFor(ctx.authz)) }),
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
    catalog: permittedProcedure(USER_ADMIN_MENU_KEY, "VIEW").query(({ ctx }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: "/internal/v1/permission/catalog", timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: catalogOutputSchema,
    })),
    mine: licensedProcedure.query(({ ctx }) => ({
      isSuperAdmin: ctx.authz.isSuperAdmin,
      permissions: ctx.authz.isSuperAdmin ? "ALL" as const : ctx.authz.permissions,
    })),
  }),
  /**
   * delegated-admin.md DA-01: `user-and-permission:<action>` (Super Admin passes). Auth re-checks the
   * same grant and enforces DA-02…05 (grant only what you hold, manageable targets only).
   */
  userAdmin: t.router({
    list: permittedProcedure(USER_ADMIN_MENU_KEY, "VIEW").query(({ ctx }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: "/internal/v1/user-admin/users", timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: userListOutputSchema,
    })),
    get: permittedProcedure(USER_ADMIN_MENU_KEY, "VIEW").input(userIdInputSchema).query(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "GET", path: `/internal/v1/user-admin/users/${encodeURIComponent(input.id)}`, timeoutMs: AUTH_TIMEOUT_MS.read, responseSchema: userDetailOutputSchema,
    })),
    create: permittedProcedure(USER_ADMIN_MENU_KEY, "ADD").input(createUserInputSchema).mutation(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "POST", path: "/internal/v1/user-admin/users", timeoutMs: AUTH_TIMEOUT_MS.create, responseSchema: userMutationOutputSchema, body: input,
    })),
    update: permittedProcedure(USER_ADMIN_MENU_KEY, "EDIT").input(updateUserInputSchema).mutation(({ ctx, input }) => {
      const { id, ...body } = input;
      return callAuth({
        cookie: ctx.cookie, method: "PATCH", path: `/internal/v1/user-admin/users/${encodeURIComponent(id)}`, timeoutMs: AUTH_TIMEOUT_MS.write, responseSchema: userMutationOutputSchema, body,
      });
    }),
    delete: permittedProcedure(USER_ADMIN_MENU_KEY, "DELETE").input(userIdInputSchema).mutation(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "DELETE", path: `/internal/v1/user-admin/users/${encodeURIComponent(input.id)}`, timeoutMs: AUTH_TIMEOUT_MS.write, responseSchema: deleteOutputSchema,
    })),
    /** user-photo.md PH-04/06: upload is REST (user-photo.controller.ts); removal is here. */
    removePhoto: permittedProcedure(USER_ADMIN_MENU_KEY, "EDIT").input(userIdInputSchema).mutation(({ ctx, input }) => callAuth({
      cookie: ctx.cookie, method: "DELETE", path: `/internal/v1/user-admin/users/${encodeURIComponent(input.id)}/photo`, timeoutMs: AUTH_TIMEOUT_MS.write, responseSchema: deleteOutputSchema,
    })),
    locationOptions: permittedProcedure(USER_ADMIN_MENU_KEY, "VIEW").query(({ ctx }) => callAuth({
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
    /** ADR-0021 §2: suggested next running Code Name (C001 …); a suggestion, not a reservation. */
    nextCode: permittedProcedure("customer", "ADD").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/customers/next-code", route: "GET /customers/next-code", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: customerNextCodeOutputSchema, notFoundCode: "CUSTOMER_NOT_FOUND",
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
    /** ADR-0021 §2: suggested next running Code Name (V001 …); a suggestion, not a reservation. */
    nextCode: permittedProcedure("vendor", "ADD").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/vendors/next-code", route: "GET /vendors/next-code", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: vendorNextCodeOutputSchema, notFoundCode: "VENDOR_NOT_FOUND",
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
  /** company-profile SA revision 2 (ADR-0021): gateway enforces `company-profile:*`; partner owns the data. Logo bytes use REST. */
  companyProfile: t.router({
    get: permittedProcedure("company-profile", "VIEW").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/company-profile", route: "GET /company-profile", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: companyProfileGetOutputSchema, notFoundCode: "COMPANY_PROFILE_NOT_FOUND",
    })),
    options: permittedProcedure("company-profile", "VIEW").query(({ ctx }) => callPartner({
      method: "GET", path: "/internal/v1/company-profile/options", route: "GET /company-profile/options", timeoutMs: PARTNER_TIMEOUT_MS.read,
      actorId: ctx.session.user.id, responseSchema: companyProfileOptionsOutputSchema, notFoundCode: "COMPANY_PROFILE_NOT_FOUND",
    })),
    save: permittedProcedure("company-profile", "EDIT").input(saveCompanyProfileInputSchema).mutation(({ ctx, input }) => callPartner({
      method: "PUT", path: "/internal/v1/company-profile", route: "PUT /company-profile", timeoutMs: PARTNER_TIMEOUT_MS.write,
      actorId: ctx.session.user.id, responseSchema: companyProfileMutationOutputSchema, notFoundCode: "COMPANY_PROFILE_NOT_FOUND", body: input,
    })),
    removeLogo: permittedProcedure("company-profile", "EDIT").input(removeLogoInputSchema).mutation(({ ctx, input }) => callPartner({
      method: "DELETE", path: `/internal/v1/company-profile/logo?expectedVersion=${input.expectedVersion}`, route: "DELETE /company-profile/logo", timeoutMs: PARTNER_TIMEOUT_MS.write,
      actorId: ctx.session.user.id, responseSchema: companyProfileMutationOutputSchema, notFoundCode: "COMPANY_PROFILE_NOT_FOUND",
    })),
  }),
});

export type AppRouter = typeof appRouter;
