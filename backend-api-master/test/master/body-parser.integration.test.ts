import { createRequire } from "node:module";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * IT-BP-M01/M02 (INV-20261110-001, GHSA-27r3-jxmh-p828): api-master parses JSON with `express.json({ limit: "256kb" })`
 * (src/main.ts), so it must resolve the patched body-parser ≥ 2.4.0 too (root `pnpm-workspace.yaml` override). The
 * same parser on an in-process app (ephemeral 127.0.0.1 port, no running stack) refuses a gzip body with trailing bytes
 * with a 4xx and keeps serving.
 */

// Resolved from this package (vitest runs with the package as cwd), like the service process.
const require = createRequire(path.join(process.cwd(), "package.json"));
const uncaught: unknown[] = [];
const onUncaught = (error: unknown) => { uncaught.push(error); };
let server: Server;
let port = 0;

function post(body: Buffer, headers: Record<string, string>, tail?: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method: "POST", path: "/", headers: { "content-type": "application/json", ...headers } }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.write(body);
    if (tail) setTimeout(() => request.end(tail), 50);
    else request.end();
  });
}

describe("api-master JSON body parser (INV-20261110-001)", () => {
  beforeAll(async () => {
    process.on("uncaughtException", onUncaught);
    const app = express();
    app.use(express.json({ limit: "256kb" }), (_request, response) => { response.json({ ok: true }); });
    app.use(((error, _request, response, _next) => { response.status(Number((error as { status?: number }).status) || 500).end(); }) as express.ErrorRequestHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.off("uncaughtException", onUncaught);
  });

  it("IT-BP-M01 express resolves body-parser ≥ 2.4.0", () => {
    const expressDir = path.dirname(require.resolve("express/package.json"));
    const { version } = require(require.resolve("body-parser/package.json", { paths: [expressDir] })) as { version: string };
    const [major, minor] = version.split(".").map(Number);
    expect(major > 2 || (major === 2 && minor >= 4)).toBe(true);
  });

  it("IT-BP-M02 gzip + trailing bytes → 400 and the process keeps serving", async () => {
    const payload = zlib.gzipSync(Buffer.from("{\"a\":1}"));
    expect(await post(payload, { "content-encoding": "gzip", "transfer-encoding": "chunked" }, Buffer.from("trailing"))).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(uncaught).toEqual([]);
    expect(await post(Buffer.from("{}"), {})).toBe(200);
  });
});
