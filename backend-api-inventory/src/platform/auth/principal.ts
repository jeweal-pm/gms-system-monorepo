import { importJWK, jwtVerify, type JWTPayload } from "jose";
import { AppError, authUnavailable, permissionDenied, unauthenticated } from "../errors";
import type { JwksCache } from "./jwks";

/**
 * Authentication chain (load-to-stock authorization.md, every public request, in order): access cookie (≤ 8 KiB) → JWT
 * (EdDSA, auth JWKS, issuer, audience, exp) → live row of `auth.current_authorization` (session not expired, account
 * active, ≤ 576 grants; DB down → 503 fail closed) → license through auth (DENIED → 403, UNAVAILABLE → 503).
 * CSRF (mutations) and the grant check follow in `http.ts`. Ported from api-master `MasterAuthContextAdapter`.
 */
export const ACCESS_TOKEN_AUDIENCE = "gms-domain-api";
export const ACCESS_TOKEN_COOKIE_NAME = "gms_access";
const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_GRANTS = 576;

export type LicenseState = "ELIGIBLE" | "DENIED" | "UNAVAILABLE" | "UNAUTHENTICATED";
export type AuthorizationRow = {
  session_id: string; user_id: string; session_expires_at: Date | string; account_active: boolean; account_role: string;
  permissions: string[]; user_name?: unknown;
};
export type Principal = {
  userId: string;
  sessionId: string;
  isSuperAdmin: boolean;
  grants: ReadonlySet<string>;
  /** Own display name for snapshots only (ADR-0046 D5), never authorization. */
  displayName: string | null;
  accessExpiresAt: number | null;
};

export type AuthDeps = {
  issuer: string;
  jwks: Pick<JwksCache, "key">;
  readAuthorization(userId: string, sessionId: string): Promise<AuthorizationRow | null>;
  checkLicense(userId: string, sessionId: string): Promise<LicenseState>;
  now?: () => Date;
};

export function accessCookie(header: string | undefined): string | null {
  if (typeof header !== "string" || Buffer.byteLength(header) > MAX_COOKIE_HEADER_BYTES) return null;
  const matches = header.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${ACCESS_TOKEN_COOKIE_NAME}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(ACCESS_TOKEN_COOKIE_NAME.length + 1);
  return token.length > 0 && token.length <= 8_192 && /^[A-Za-z0-9._-]+$/.test(token) ? token : null;
}

const PERMISSION = /^[a-z0-9-]{1,64}:(VIEW|ADD|EDIT|DELETE|CANCEL|APPROVE|PRICE|PRINT|EXCEL)$/;

export function displayNameOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200).trimEnd() : null;
}

export async function authenticate(cookieHeader: string | undefined, deps: AuthDeps): Promise<Principal> {
  const token = accessCookie(cookieHeader);
  if (!token) throw unauthenticated();
  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(token, async (header) => {
      if (header.alg !== "EdDSA" || typeof header.kid !== "string") throw unauthenticated();
      return importJWK(await deps.jwks.key(header.kid), "EdDSA");
    }, { algorithms: ["EdDSA"], issuer: deps.issuer, audience: ACCESS_TOKEN_AUDIENCE, clockTolerance: 5, currentDate: deps.now?.() });
    payload = verified.payload;
  } catch (error) {
    if (error instanceof AppError && error.status === 503) throw error;
    throw unauthenticated();
  }
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.sid !== "string" || !payload.sid) throw unauthenticated();

  let row: AuthorizationRow | null;
  try {
    row = await deps.readAuthorization(payload.sub, payload.sid);
  } catch {
    throw authUnavailable();
  }
  if (!row) throw unauthenticated();
  const expiresAt = row.session_expires_at instanceof Date ? row.session_expires_at : new Date(row.session_expires_at);
  if (row.user_id !== payload.sub || row.session_id !== payload.sid || !row.account_active || !Number.isFinite(expiresAt.getTime()) || expiresAt <= (deps.now?.() ?? new Date())) {
    throw unauthenticated();
  }
  if (!Array.isArray(row.permissions) || row.permissions.length > MAX_GRANTS || !row.permissions.every((key) => typeof key === "string" && PERMISSION.test(key))) {
    throw authUnavailable();
  }
  let license: LicenseState;
  try { license = await deps.checkLicense(payload.sub, payload.sid); } catch { license = "UNAVAILABLE"; }
  if (license === "UNAUTHENTICATED") throw unauthenticated();
  if (license === "UNAVAILABLE") throw authUnavailable();
  if (license === "DENIED") throw new AppError(403, "LICENSE_DENIED");
  return {
    userId: payload.sub,
    sessionId: payload.sid,
    isSuperAdmin: row.account_role === "admin",
    grants: new Set(row.permissions),
    displayName: displayNameOf(row.user_name),
    accessExpiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : null,
  };
}

/**
 * Mutation CSRF (ADR-0031 as master, api-contract "Conventions"): a trusted `Origin`, or no Origin with
 * `Sec-Fetch-Site: same-origin`; a cross-site Fetch-Metadata value is always refused.
 */
export function csrfAllowed(headers: { origin?: string; secFetchSite?: string }, trusted: ReadonlySet<string>): boolean {
  const site = headers.secFetchSite;
  if (site !== undefined && site !== "same-origin" && site !== "same-site") return false;
  if (headers.origin !== undefined) return trusted.has(headers.origin);
  return site === "same-origin";
}

export type Menu = "load-to-stock" | "approval-setup" | "merge-split" | "stock-transfer-location" | "sale" | "stock-card";
export type Action = "VIEW" | "ADD" | "EDIT" | "DELETE" | "APPROVE";

export function hasGrant(principal: Pick<Principal, "isSuperAdmin" | "grants">, menu: Menu, action: Action): boolean {
  return principal.isSuperAdmin || principal.grants.has(`${menu}:${action}`);
}

/** Any one of the actions is enough (submit: ADD or EDIT, Q-AS-25). Super Admin passes. */
export function requireGrant(principal: Principal, menu: Menu, ...actions: Action[]): void {
  if (!actions.some((action) => hasGrant(principal, menu, action))) throw permissionDenied();
}

/** ADR-0050 D3 helper: APPROVE and VIEW on the leaf. */
export function canApprove(principal: Pick<Principal, "isSuperAdmin" | "grants">, menu: Menu): boolean {
  return hasGrant(principal, menu, "APPROVE") && hasGrant(principal, menu, "VIEW");
}
