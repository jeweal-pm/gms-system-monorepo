/**
 * Customer permission helpers (FE-CUS-004) over the existing approved `permission.mine`
 * contract: `{ isSuperAdmin, permissions: "ALL" | string[] }` with keys `${menuKey}:${ACTION}`.
 * UX only: the gateway enforces every `customer.*` call with `permittedProcedure("customer", …)`.
 */

export type CustomerAction = "VIEW" | "ADD" | "EDIT" | "DELETE";
export type PermissionMine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] };
export type CustomerAccess = { view: boolean; add: boolean; edit: boolean; delete: boolean };

export const CUSTOMER_MENU_KEY = "customer";

export function can(mine: PermissionMine, menuKey: string, action: string): boolean {
  if (mine.isSuperAdmin || mine.permissions === "ALL") return true;
  return mine.permissions.includes(`${menuKey}:${action}`);
}

export function customerAccess(mine: PermissionMine): CustomerAccess {
  return {
    view: can(mine, CUSTOMER_MENU_KEY, "VIEW"),
    add: can(mine, CUSTOMER_MENU_KEY, "ADD"),
    edit: can(mine, CUSTOMER_MENU_KEY, "EDIT"),
    delete: can(mine, CUSTOMER_MENU_KEY, "DELETE"),
  };
}
