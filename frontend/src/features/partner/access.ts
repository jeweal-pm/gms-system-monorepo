/**
 * Partner Master permission helpers over the existing approved `permission.mine` contract:
 * `{ isSuperAdmin, permissions: "ALL" | string[] }` with keys `${menuKey}:${ACTION}`.
 * UX only: the gateway enforces every partner call with `permittedProcedure(menuKey, …)`.
 * Extracted from customer (vendor FE-VEN-001); the menu key is an argument.
 */

export type PartnerAction = "VIEW" | "ADD" | "EDIT" | "DELETE";
export type PermissionMine = { isSuperAdmin: boolean; permissions: "ALL" | readonly string[] };
export type PartnerAccess = { view: boolean; add: boolean; edit: boolean; delete: boolean };

export function can(mine: PermissionMine, menuKey: string, action: PartnerAction): boolean {
  if (mine.isSuperAdmin || mine.permissions === "ALL") return true;
  return mine.permissions.includes(`${menuKey}:${action}`);
}

export function partnerAccess(mine: PermissionMine, menuKey: string): PartnerAccess {
  return {
    view: can(mine, menuKey, "VIEW"),
    add: can(mine, menuKey, "ADD"),
    edit: can(mine, menuKey, "EDIT"),
    delete: can(mine, menuKey, "DELETE"),
  };
}
