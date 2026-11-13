import { createRequire } from "node:module";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AUTH_JSON_LIMIT, authJsonBody } from "../../src/http/json-body";

/**
 * IT-BP-01…03 (INV-20261110-001, GHSA-27r3-jxmh-p828): the auth JSON parser on an in-process Express app bound to an
 * ephemeral 127.0.0.1 port (no running stack, no external network). A compressed body followed by trailing bytes is
 * refused with a 4xx and the process keeps serving; the resolved body-parser is the patched ≥ 2.4.0.
 */

const require = createRequire(import.meta.url);
const uncaught: unknown[] = [];
const onUncaught = (error: unknown) => { uncaught.push(error); };
let server: Server;
let port = 0;

function post(body: Buffer, headers: Record<string, string>, tail?: Buffer): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, method: "POST", path: "/api/auth/trpc", headers: { "content-type": "application/json", ...headers } }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.write(body);
    // Trailing bytes sent in a later chunk, after the complete compressed payload.
    if (tail) setTimeout(() => request.end(tail), 50);
    else request.end();
  });
}

describe("auth JSON body parser (INV-20261110-001)", () => {
  beforeAll(async () => {
    process.on("uncaughtException", onUncaught);
    const app = express();
    app.use("/api/auth/trpc", authJsonBody(), (request, response) => { response.json({ ok: true, body: request.body as unknown }); });
    app.use(((error, _request, response, _next) => {
      response.status(Number((error as { status?: number }).status) || 500).json({ error: (error as { type?: string }).type ?? "error" });
    }) as express.ErrorRequestHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.off("uncaughtException", onUncaught);
  });

  it("IT-BP-01 the runtime resolves the patched body-parser (≥ 2.4.0) through express", () => {
    const expressDir = path.dirname(require.resolve("express/package.json"));
    const { version } = require(require.resolve("body-parser/package.json", { paths: [expressDir] })) as { version: string };
    const [major, minor] = version.split(".").map(Number);
    expect(major > 2 || (major === 2 && minor >= 4)).toBe(true);
    expect(AUTH_JSON_LIMIT).toBe("32kb");
  });

  it("IT-BP-02 a gzip body with trailing bytes (same chunk or a later one) → 400, and the process keeps serving", async () => {
    const payload = zlib.gzipSync(Buffer.from(JSON.stringify({ hello: "world" })));
    const junk = Buffer.from("trailing-bytes-after-the-gzip-member");
    const sameChunk = await post(Buffer.concat([payload, junk]), { "content-encoding": "gzip" });
    expect(sameChunk.status).toBe(400);
    const laterChunk = await post(payload, { "content-encoding": "gzip", "transfer-encoding": "chunked" }, junk);
    expect(laterChunk.status).toBe(400);
    const halfMember = await post(payload, { "content-encoding": "gzip", "transfer-encoding": "chunked" }, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4]));
    expect(halfMember.status).toBeGreaterThanOrEqual(400);
    expect(halfMember.status).toBeLessThan(500);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(uncaught).toEqual([]);
    // Still up: a plain and a well-formed compressed request are parsed.
    expect(await post(Buffer.from(JSON.stringify({ a: 1 })), {})).toEqual({ status: 200, text: JSON.stringify({ ok: true, body: { a: 1 } }) });
    expect((await post(payload, { "content-encoding": "gzip" })).status).toBe(200);
  });

  it("IT-BP-03 deflate / brotli (and zstd where Node has it) with trailing bytes never crash or answer 5xx", async () => {
    const json = Buffer.from(JSON.stringify({ hello: "world" }));
    const junk = Buffer.from("trailing");
    const cases: [string, Buffer][] = [["deflate", zlib.deflateSync(json)], ["br", zlib.brotliCompressSync(json)]];
    const zstd = (zlib as unknown as { zstdCompressSync?: (input: Buffer) => Buffer }).zstdCompressSync;
    if (zstd) cases.push(["zstd", zstd(json)]);
    for (const [encoding, payload] of cases) {
      const result = await post(payload, { "content-encoding": encoding, "transfer-encoding": "chunked" }, junk);
      expect(result.status, encoding).toBeLessThan(500);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(uncaught).toEqual([]);
    expect((await post(Buffer.from("{}"), {})).status).toBe(200);
  });
});
