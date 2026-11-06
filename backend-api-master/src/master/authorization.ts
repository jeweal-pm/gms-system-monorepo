import { TRPCError } from "@trpc/server";

export type MasterMenu = "customer" | "vendor" | "company-profile" | "stone-master" | "document-setup" | "decimal-setup" | "currency" | "quotation" | "memo-out" | "memo-out-return" | "memo-receive" | "memo-return" | "memo-outstanding-vendor" | "memo-outstanding-customer" | "reserve" | "purchase-order" | "purchase" | "purchase-outstanding";
export type MasterAction = "VIEW" | "ADD" | "EDIT" | "DELETE" | "CANCEL" | "APPROVE" | "PRICE";

/** Supplied only by the future JWT + current-authorization adapter, never from browser headers. */
export type MasterContext = {
  principal: { userId: string; sessionId: string; isSuperAdmin: boolean; grants: readonly string[] } | null;
  authorization: "CURRENT" | "UNAVAILABLE";
  license: "ELIGIBLE" | "DENIED" | "UNAVAILABLE";
  csrfVerified: boolean;
};

type MasterPrincipal = NonNullable<MasterContext["principal"]>;

/**
 * Live session proof without a menu grant: identity, current authorization and an eligible license, in the same
 * order as `requireMasterGrant`. Only `decimalSetup.get` uses it (decimal-setup SA rev 1 authorization.md: every
 * page formats numbers and the answer is two non-sensitive integers); any other use needs SA review.
 */
export function requireMasterSession(ctx: MasterContext): MasterPrincipal {
  if (!ctx.principal?.userId || !ctx.principal.sessionId) throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" });
  if (ctx.authorization !== "CURRENT") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
  if (ctx.license === "UNAVAILABLE") throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
  if (ctx.license !== "ELIGIBLE") throw new TRPCError({ code: "FORBIDDEN", message: "LICENSE_REQUIRED" });
  return ctx.principal;
}

/** Deny before touching the domain service when any live authorization proof is absent. */
export function requireMasterGrant(ctx: MasterContext, menu: MasterMenu, action: MasterAction, mutation: boolean): string {
  const principal = requireMasterSession(ctx);
  if (mutation && !ctx.csrfVerified) throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
  if (!principal.isSuperAdmin && !principal.grants.includes(`${menu}:${action}`)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PERMISSION_DENIED" });
  }
  return principal.userId;
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
