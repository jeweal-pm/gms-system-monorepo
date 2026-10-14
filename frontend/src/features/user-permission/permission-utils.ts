import type { CheckState } from "@/components/ui/checkbox";
import type { PermissionAction, PermissionMenu } from "./api";

export type { CheckState };
export type PermissionValues = Record<string, boolean>;

export const permissionKey = (menuId: string, action: PermissionAction) => `${menuId}:${action}`;

/** Leaf menus that carry real permission cells. */
export function leafMenus(menus: readonly PermissionMenu[]): PermissionMenu[] {
  return menus.flatMap((menu) => (menu.children?.length ? leafMenus(menu.children) : [menu]));
}

/** Keys of every applicable (leaf menu, action) cell under `menus`, optionally for one action. */
export function applicableKeys(menus: readonly PermissionMenu[], action?: PermissionAction): string[] {
  return leafMenus(menus).flatMap((menu) =>
    menu.actions.filter((entry) => action === undefined || entry === action).map((entry) => permissionKey(menu.id, entry)),
  );
}

export function aggregateState(keys: readonly string[], values: PermissionValues): CheckState | null {
  if (keys.length === 0) return null;
  const on = keys.filter((key) => values[key]).length;
  if (on === 0) return "unchecked";
  return on === keys.length ? "checked" : "indeterminate";
}

/** Clicking an aggregate sets every key on unless all are already on. */
export function toggleKeys(keys: readonly string[], values: PermissionValues): PermissionValues {
  const turnOn = aggregateState(keys, values) !== "checked";
  const next = { ...values };
  for (const key of keys) {
    if (turnOn) next[key] = true;
    else delete next[key];
  }
  return next;
}

/** Number of checked cells that are applicable in the current catalog (stale keys are not counted). */
export function countEnabled(menus: readonly PermissionMenu[], values: PermissionValues) {
  return applicableKeys(menus).filter((key) => values[key]).length;
}

export function valuesFromKeys(keys: readonly string[]): PermissionValues {
  return Object.fromEntries(keys.map((key) => [key, true]));
}

/** Saved grants -> matrix values. "ALL" (Super Admin) checks every applicable cell of the catalog. */
export function valuesFromGrants(grants: readonly string[] | "ALL", menus: readonly PermissionMenu[] | undefined): PermissionValues {
  if (grants === "ALL") return valuesFromKeys(menus ? applicableKeys(menus) : []);
  return valuesFromKeys(grants);
}

/** Form values -> grant keys, keeping only cells that exist in the current catalog (bounded to 384 by the catalog). */
export function grantsFromValues(values: PermissionValues, menus: readonly PermissionMenu[]): string[] {
  return applicableKeys(menus).filter((key) => values[key]);
}
