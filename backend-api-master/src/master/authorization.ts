import { TRPCError } from "@trpc/server";

export type MasterMenu = "customer" | "vendor" | "company-profile" | "stone-master" | "document-setup" | "currency" | "quotation" | "memo-out" | "memo-out-return";
export type MasterAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "CANCEL" | "APPROVE" | "PRICE";

/** Supplied only by the future JWT + current-authorization adapter, never from browser headers. */
export type MasterContext = {
  principal: { userId: string; sessionId: string; isSuperAdmin: boolean; grants: readonly string[] } | null;
  authorization: "CURRENT" | "UNAVAILABLE";
  license: "ELIGIBLE" | "DENIED" | "UNAVAILABLE";
  csrfVerified: boolean;
};

/** Deny before touching the domain service when any live authorization proof is absent. */
export function requireMasterGrant(ctx: MasterContext, menu: MasterMenu, action: MasterAction, mutation: boolean): string {
  if (!ctx.principal?.userId || !ctx.principal.sessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
  if (ctx.authorization !== "CURRENT") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
  if (ctx.license === "UNAVAILABLE") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
  if (ctx.license !== "ELIGIBLE") throw new TRPCError({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
  if (mutation && !ctx.csrfVerified) throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
  if (!ctx.principal.isSuperAdmin && !ctx.principal.grants.includes(`${menu}:${action}`)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
  }
  return ctx.principal.userId;
}

/** Read-only variant: `action` on any one of `menus` is enough (currency SA-CUR-07). Same live checks first. */
export function requireAnyMasterGrant(ctx: MasterContext, menus: readonly MasterMenu[], action: MasterAction): string {
  const [first, ...rest] = menus;
  if (!first) throw new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
  for (const menu of rest) {
    if (ctx.principal?.grants.includes(`${menu}:${action}`)) return requireMasterGrant(ctx, menu, action, false);
  }
  return requireMasterGrant(ctx, first, action, false);
}
