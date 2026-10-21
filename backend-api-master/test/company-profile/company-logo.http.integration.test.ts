import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicLogoAccessCheck, publicLogoMethodCheck } from "../../src/company-profile/company-logo.http";
import type { MasterTrpcHandler } from "../../src/master/trpc-handler";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))));

async function serve(method: string, context: object, options: { csrf?: boolean } = {}) {
  const createContext = vi.fn(async () => context);
  const app = express();
  app.use("/logo", publicLogoMethodCheck, createPublicLogoAccessCheck({ createContext } as unknown as MasterTrpcHandler), express.raw({ type: ["image/png"], limit: "10mb" }), (_request, response) => response.status(204).end());
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  const headers = { "content-type": "image/png", ...(method === "PUT" && options.csrf ? { origin: "http://localhost:3000", "x-gms-csrf": "1", "sec-fetch-site": "same-origin" } : {}) };
  const response = await fetch(`http://127.0.0.1:${address.port}/logo`, { method, headers, body: method === "GET" || method === "HEAD" ? undefined : Buffer.alloc(128 * 1024) });
  return { response, createContext };
}

const context = (grants: string[], csrfVerified = false) => ({
  principal: { userId: "admin", sessionId: "s1", isSuperAdmin: false, grants }, authorization: "CURRENT" as const, license: "ELIGIBLE" as const, csrfVerified,
});

describe("company logo public route HTTP middleware", () => {
  it("IT-MASTER-LOGO-HTTP-01 rejects unsupported methods before auth or raw parsing", async () => {
    const result = await serve("POST", context(["company-profile:VIEW"]));
    expect(result.response.status).toBe(405);
    expect(result.response.headers.get("allow")).toBe("GET, PUT");
    expect(result.createContext).not.toHaveBeenCalled();
  });

  it("IT-MASTER-LOGO-HTTP-02 permits VIEW-only GET without service token and rejects callers without VIEW", async () => {
    expect((await serve("GET", context(["company-profile:VIEW"]))).response.status).toBe(204);
    expect((await serve("GET", context([]))).response.status).toBe(403);
  });

  it("IT-MASTER-LOGO-HTTP-03 requires EDIT, live CSRF proof, and a valid body for PUT", async () => {
    expect((await serve("PUT", context(["company-profile:EDIT"], true), { csrf: true })).response.status).toBe(204);
    expect((await serve("PUT", context(["company-profile:EDIT"], false), { csrf: true })).response.status).toBe(403);
    expect((await serve("PUT", context(["company-profile:VIEW"], true), { csrf: true })).response.status).toBe(403);
  });
});
