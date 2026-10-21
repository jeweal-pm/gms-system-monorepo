import { TRPCError } from "@trpc/server";
import type { Request } from "express";

/** ADR-0026 §7: exact same-origin plus the non-simple marker required on cookie mutations. */
export function verifyAuthTrpcCsrf(request: Pick<Request, "method" | "headers">, trustedOrigin = process.env.FRONTEND_URL ?? "http://localhost:3000"): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  let origin: string;
  try { origin = new URL(trustedOrigin).origin; } catch { return false; }
  const suppliedOrigin = singleHeader(request.headers.origin);
  const marker = singleHeader(request.headers["x-gms-csrf"]);
  const fetchSite = singleHeader(request.headers["sec-fetch-site"]);
  return suppliedOrigin === origin && marker === "1" && (fetchSite === undefined || fetchSite === "same-origin" || fetchSite === "same-site");
}

/** Raw uploads need the same origin proof as JSON mutations because the service is now public. */
export const verifyAuthRequestCsrf = verifyAuthTrpcCsrf;

/** Mount this check before tRPC context creation so rejected mutations perform no session/DB work. */
export function assertAuthTrpcCsrf(request: Pick<Request, "method" | "headers">, trustedOrigin?: string): void {
  if (!verifyAuthTrpcCsrf(request, trustedOrigin)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "CSRF_INVALID" });
  }
}

function singleHeader(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
