import { prisma } from "../database/prisma-client";
import { isGrantInCatalog, MAX_GRANTS_PER_USER, toPermissionKey } from "./catalog";

export const SUPER_ADMIN_ROLE = "admin";

export type SessionAuthz = { isSuperAdmin: boolean; permissions: string[] };

/**
 * Builds the trusted authorization block for session-context. Uncached by design (ADR-0016):
 * a grant change or revocation applies on the caller's next request. Super Admin has implicit
 * ALL, so no query is made and `permissions` stays empty. Grants outside the current catalog
 * are ignored.
 */
export async function loadSessionAuthz(userId: string, role: string): Promise<SessionAuthz> {
  if (role === SUPER_ADMIN_ROLE) return { isSuperAdmin: true, permissions: [] };
  const rows = await prisma.userPermission.findMany({
    where: { userId },
    select: { menuKey: true, action: true },
    take: MAX_GRANTS_PER_USER,
  });
  return {
    isSuperAdmin: false,
    permissions: rows.filter((row) => isGrantInCatalog(row.menuKey, row.action)).map((row) => toPermissionKey(row.menuKey, row.action)),
  };
}
