import type { Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ACCESS_TOKEN_COOKIE_PATH,
  AccessTokenIssuer,
  isAccessTokenEligible,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_LIFETIME_SECONDS,
} from "./access-token";
import { RefreshCredentialStore } from "./refresh-credential";
import { verifyAuthRequestCsrf } from "../trpc/auth-trpc.csrf";

type RefreshHttpDependencies = {
  issuer: AccessTokenIssuer | null;
  store: Pick<RefreshCredentialStore, "rotate" | "revokeForSession">;
  eligible: typeof isAccessTokenEligible;
  secure: boolean;
};

const noStore = { "Cache-Control": "private, no-store", Pragma: "no-cache" };

/** Approved GP-AUTH-02 refresh boundary. CSRF is rejected before credential or DB access. */
export function createRefreshHandler(dependencies: RefreshHttpDependencies): RequestHandler {
  return async (request, response) => {
    response.set(noStore);
    if (!verifyAuthRequestCsrf(request)) {
      response.status(403).json(errorBody("CSRF_INVALID", "Request origin could not be verified"));
      return;
    }
    if (request.headers["content-length"] && request.headers["content-length"] !== "0" || request.headers["transfer-encoding"]) {
      response.status(400).json(errorBody("INVALID_REQUEST", "Refresh does not accept a request body"));
      return;
    }
    if (!dependencies.issuer) {
      clearTokenCookies(response, dependencies.secure);
      response.status(503).json(errorBody("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable"));
      return;
    }

    const credential = readSingleCookie(request, REFRESH_TOKEN_COOKIE_NAME);
    if (!credential) {
      clearTokenCookies(response, dependencies.secure);
      response.status(401).json(errorBody("UNAUTHENTICATED", "Authentication is required"));
      return;
    }

    let outcome;
    try {
      outcome = await dependencies.store.rotate(credential);
    } catch {
      clearTokenCookies(response, dependencies.secure);
      response.status(503).json(errorBody("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable"));
      return;
    }
    if (outcome.state !== "rotated") {
      clearTokenCookies(response, dependencies.secure);
      response.status(401).json(errorBody("UNAUTHENTICATED", "Authentication is required"));
      return;
    }

    let eligible = false;
    try {
      eligible = await dependencies.eligible(outcome.userId, outcome.username);
    } catch {
      // The old credential has been consumed. Revoke the family so a retry cannot create
      // a credential chain after an ambiguous online eligibility result.
      try { await dependencies.store.revokeForSession(outcome.sessionId); } catch { /* fail closed by withholding cookies */ }
      clearTokenCookies(response, dependencies.secure);
      response.status(503).json(errorBody("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable"));
      return;
    }
    if (!eligible) {
      try { await dependencies.store.revokeForSession(outcome.sessionId); } catch { /* access remains withheld */ }
      clearTokenCookies(response, dependencies.secure);
      response.status(403).json(errorBody("LICENSE_REQUIRED", "An eligible license is required"));
      return;
    }

    try {
      const access = await dependencies.issuer.issue(outcome.userId, outcome.sessionId);
      response.cookie(ACCESS_TOKEN_COOKIE_NAME, access, cookieOptions(dependencies.secure, 15 * 60, ACCESS_TOKEN_COOKIE_PATH));
      response.cookie(REFRESH_TOKEN_COOKIE_NAME, outcome.secret, cookieOptions(dependencies.secure, REFRESH_TOKEN_LIFETIME_SECONDS, REFRESH_TOKEN_COOKIE_PATH));
      response.status(204).end();
    } catch {
      try { await dependencies.store.revokeForSession(outcome.sessionId); } catch { /* fail closed */ }
      clearTokenCookies(response, dependencies.secure);
      response.status(503).json(errorBody("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable"));
    }
  };
}

/** Revoke refresh credentials before Better Auth deletes the corresponding session. */
export function createLogoutRefreshRevocation(
  store: Pick<RefreshCredentialStore, "revokeForSession">,
  secure: boolean,
  resolveSession: (request: Request) => Promise<{ id: string } | null> = async (request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    return session ? { id: session.session.id } : null;
  },
): RequestHandler {
  return (request, response, next) => {
    response.set(noStore);
    if (!verifyAuthRequestCsrf(request)) {
      response.status(403).json(errorBody("CSRF_INVALID", "Request origin could not be verified"));
      return;
    }
    clearTokenCookies(response, secure);
    void resolveSession(request).then(async (session) => {
      if (session) await store.revokeForSession(session.id);
      next();
    }).catch(() => {
      response.status(503).json(errorBody("AUTH_UNAVAILABLE", "Authentication is temporarily unavailable"));
    });
  };
}

export function cookieOptions(secure: boolean, maxAgeSeconds: number, path: string) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path, maxAge: maxAgeSeconds * 1_000 };
}

export function clearTokenCookies(response: Response, secure: boolean) {
  response.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { httpOnly: true, secure, sameSite: "lax", path: ACCESS_TOKEN_COOKIE_PATH });
  response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { httpOnly: true, secure, sameSite: "lax", path: REFRESH_TOKEN_COOKIE_PATH });
}

function readSingleCookie(request: Request, name: string): string | null {
  const headers = request.headers.cookie;
  if (typeof headers !== "string") return null;
  const matches = headers.split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

