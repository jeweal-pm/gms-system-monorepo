import { partnerAccess, type PartnerAccess, type PermissionMine } from "@/features/partner/access";

/** Catalog leaf that gates this page and every `userAdmin.*` call (delegated-admin.md DA-01). */
export const USER_ADMIN_MENU_KEY = "user-and-permission";

/**
 * What the signed-in user may do on User and Permission, from `permission.mine`. UX only: the gateway
 * and auth enforce the same rules. `grantable` = keys the user may hand out (DA-02); null = all (Super Admin).
 */
export type UserAdminAccess = PartnerAccess & { grantable: ReadonlySet<string> | null };

export function userAdminAccess(mine: PermissionMine): UserAdminAccess {
  const all = mine.isSuperAdmin || mine.permissions === "ALL";
  return {
    ...partnerAccess(mine, USER_ADMIN_MENU_KEY),
    grantable: all ? null : new Set(mine.permissions as readonly string[]),
  };
}

/** DA-02 for Duplicate: drop copied grants the user may not hand out, so the draft can be saved. */
export function grantableOnly<T extends Record<string, boolean>>(values: T, grantable: ReadonlySet<string> | null): T {
  if (grantable === null) return values;
  return Object.fromEntries(Object.entries(values).filter(([key, on]) => on && grantable.has(key))) as T;
}
