import express from "express";
import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userAdminException } from "../../src/user-admin/user-admin.errors";
import { createPhotoAccessCheck, createPublicPhotoAccessCheck, photoCsrfCheck, photoMethodCheck, photoReadBodyCheck } from "../../src/user-admin/user-photo.http";
import type { UserAdminAction } from "../../src/user-admin/delegation";

const servers: Array<ReturnType<express.Express["listen"]>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
});

async function serve(method: string, requireAccess: (action: UserAdminAction) => Promise<void>, headers: Record<string, string> = {}) {
  const app = express();
  const rawParserReached = vi.fn();
  const downstreamControllerReached = vi.fn();
  app.use("/photo", photoMethodCheck, photoReadBodyCheck, photoCsrfCheck,
    createPublicPhotoAccessCheck({ requireAccess: vi.fn((_request, action) => requireAccess(action)) } as never),
    (request, response, next) => { rawParserReached(); next(); },
    express.raw({ type: ["image/jpeg", "image/png"], limit: "5mb" }),
    (_request, response) => { downstreamControllerReached(); response.status(204).end(); });
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  const url = `http://127.0.0.1:${address.port}/photo`;
  const response = method === "GET" && headers["content-length"] !== undefined
    ? await new Promise<{ status: number; headers: Headers }>((resolve, reject) => {
      const request = httpRequest(url, { method, headers: { "content-type": "image/jpeg", ...headers } }, (incoming) => {
        incoming.resume();
        incoming.on("end", () => resolve({ status: incoming.statusCode ?? 0, headers: new Headers(incoming.headers as HeadersInit) }));
      });
      request.on("error", reject);
      request.end("x");
    })
    : await fetch(url, { method, headers: { "content-type": "image/jpeg", ...headers }, body: method === "GET" || method === "HEAD" ? undefined : Buffer.alloc(128 * 1024) });
  return { response, rawParserReached, downstreamControllerReached };
}

describe("user photo HTTP middleware", () => {
  it("IT-AUTH-PHOTO-HTTP-01 rejects unsupported methods before parsing their image body", async () => {
    const requireAccess = vi.fn(async () => {});
    const { response, rawParserReached, downstreamControllerReached } = await serve("POST", requireAccess);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, PUT");
    expect(requireAccess).not.toHaveBeenCalled();
    expect(rawParserReached).not.toHaveBeenCalled();
    expect(downstreamControllerReached).not.toHaveBeenCalled();
  });

  it("IT-AUTH-PHOTO-HTTP-02 denies VIEW or license before parser and controller", async () => {
    const deniedView = await serve("GET", async () => { throw userAdminException("PERMISSION_DENIED", 403); });
    expect(deniedView.response.status).toBe(403);
    expect(deniedView.rawParserReached).not.toHaveBeenCalled();
    expect(deniedView.downstreamControllerReached).not.toHaveBeenCalled();

    const deniedLicense = await serve("PUT", async () => { throw userAdminException("LICENSE_REQUIRED", 403); }, { origin: "http://localhost:3000", "x-gms-csrf": "1", "sec-fetch-site": "same-origin" });
    expect(deniedLicense.response.status).toBe(403);
    expect(deniedLicense.rawParserReached).not.toHaveBeenCalled();
    expect(deniedLicense.downstreamControllerReached).not.toHaveBeenCalled();

    const deniedEdit = await serve("PUT", async (action) => {
      expect(action).toBe("EDIT");
      throw userAdminException("PERMISSION_DENIED", 403);
    }, { origin: "http://localhost:3000", "x-gms-csrf": "1", "sec-fetch-site": "same-origin" });
    expect(deniedEdit.response.status).toBe(403);
    expect(deniedEdit.rawParserReached).not.toHaveBeenCalled();
    expect(deniedEdit.downstreamControllerReached).not.toHaveBeenCalled();
  });

  it("IT-AUTH-PHOTO-HTTP-03 rejects GET bodies and permits authorized GET/PUT", async () => {
    const getBody = await serve("GET", async () => {}, { "content-length": "1" });
    expect(getBody.response.status).toBe(400);
    expect(getBody.rawParserReached).not.toHaveBeenCalled();

    const authorizedGet = await serve("GET", async (action) => expect(action).toBe("VIEW"));
    expect(authorizedGet.response.status).toBe(204);
    expect(authorizedGet.rawParserReached).toHaveBeenCalledOnce();
    expect(authorizedGet.downstreamControllerReached).toHaveBeenCalledOnce();

    const authorizedPut = await serve("PUT", async (action) => expect(action).toBe("EDIT"), { origin: "http://localhost:3000", "x-gms-csrf": "1", "sec-fetch-site": "same-origin" });
    expect(authorizedPut.response.status).toBe(204);
    expect(authorizedPut.rawParserReached).toHaveBeenCalledOnce();
    expect(authorizedPut.downstreamControllerReached).toHaveBeenCalledOnce();
  });

  it("IT-AUTH-PHOTO-HTTP-04 rejects unauthorized legacy internal photo requests before parsing", async () => {
    const app = express();
    const rawParserReached = vi.fn();
    app.use("/photo", photoMethodCheck, photoReadBodyCheck,
      createPhotoAccessCheck({ requireAccess: vi.fn(async () => { throw userAdminException("PERMISSION_DENIED", 403); }) } as never),
      (request, response, next) => { rawParserReached(); next(); },
      express.raw({ type: ["image/jpeg"], limit: "5mb" }), (_request, response) => response.status(204).end());
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server address");
    const get = await fetch(`http://127.0.0.1:${address.port}/photo`, { method: "GET", headers: { "content-type": "image/jpeg" }, body: undefined });
    expect(get.status).toBe(403);
    expect(rawParserReached).not.toHaveBeenCalled();
  });
});
