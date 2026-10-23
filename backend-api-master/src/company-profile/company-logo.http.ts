import type { RequestHandler } from "express";
import { errorBody } from "../common/errors";
import type { MasterTrpcHandler } from "../master/trpc-handler";
import { requireMasterGrant } from "../master/authorization";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";

export const publicLogoMethodCheck: RequestHandler = (request, response, next) => {
  if (request.method === "GET" || request.method === "PUT") return next();
  response.setHeader("allow", "GET, PUT");
  response.status(405).json(errorBody("METHOD_NOT_ALLOWED"));
};

/** Apply live user authorization before parsing; GET needs VIEW, PUT needs EDIT plus CSRF. */
export function createPublicLogoAccessCheck(masterTrpc: MasterTrpcHandler): RequestHandler {
  return (request, response, next) => {
    void masterTrpc.createContext(request).then((context) => {
      if (request.method === "GET") requireMasterGrant(context, "company-profile", "VIEW", false);
      else requireMasterGrant(context, "company-profile", "EDIT", true);
      next();
    }).catch((error: unknown) => {
      const trpcError = error instanceof TRPCError ? error : new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AUTHORIZATION_UNAVAILABLE" });
      const code = /^[A-Z][A-Z_]{1,63}$/.test(trpcError.message) ? trpcError.message : "AUTHORIZATION_UNAVAILABLE";
      response.status(getHTTPStatusCodeFromError(trpcError)).json({ error: { code, message: code } });
    });
  };
}
