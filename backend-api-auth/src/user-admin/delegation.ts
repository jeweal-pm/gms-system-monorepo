/**
 * Delegated user administration (user-permission SA revision 3, delegated-admin.md DA-01…05).
 * Pure rules, no I/O: the service loads the actor's and target's grants and asks these.
 */

/** Catalog leaf that gates the User and Permission page and every `user-admin` endpoint (DA-01). */
export const USER_ADMIN_MENU_KEY = "user-and-permission";

export type UserAdminAction = "VIEW" | "ADD" | "EDIT" | "DELETE";

/** Caller of a user-admin endpoint. `permissions` are catalog keys (`menu:ACTION`); empty for a Super Admin. */
export type UserAdminActor = { id: string; isSuperAdmin: boolean; permissions: readonly string[] };

/** DA-01: Super Admin passes; others need `user-and-permission:<action>`. */
export function canUseUserAdmin(actor: UserAdminActor, action: UserAdminAction): boolean {
  return actor.isSuperAdmin || actor.permissions.includes(`${USER_ADMIN_MENU_KEY}:${action}`);
}

/** DA-02: requested keys the actor does not hold themselves (always empty for a Super Admin). */
export function ungrantableKeys(actor: UserAdminActor, requested: readonly string[]): string[] {
  if (actor.isSuperAdmin) return [];
  const held = new Set(actor.permissions);
  return requested.filter((key) => !held.has(key));
}

/**
 * DA-03…05: may the actor change or delete this user at all? A Super Admin may (ADR-0020 locks for
 * Super Admin targets still apply separately). Others may not touch a Super Admin (DA-04), their own
 * account (DA-05) or anyone holding a grant they do not hold (DA-03).
 */
export function isManageableTarget(
  actor: UserAdminActor,
  target: { id: string; isSuperAdmin: boolean; permissions: readonly string[] },
): boolean {
  if (actor.isSuperAdmin) return true;
  if (target.isSuperAdmin || target.id === actor.id) return false;
  return ungrantableKeys(actor, target.permissions).length === 0;
}
