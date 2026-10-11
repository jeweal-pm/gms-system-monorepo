import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

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
export type TrpcContext = {
  session: { user: SessionUser } | null;
  license: GatewayLicenseStatus | null;
  activateLicense: ((licenseKey: string) => Promise<GatewayLicenseStatus>) | null;
};

const t = initTRPC.context<TrpcContext>().create();
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
});

export type AppRouter = typeof appRouter;
