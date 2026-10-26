import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import type { MasterTrpcHandler } from "../../src/master/trpc-handler";
import { createPhotoLimiter, createQuotationPhotoAccessCheck, quotationPhotoMethodCheck } from "../../src/quotation/quotation-photo.http";
import { sizeGuard } from "../../src/quotation/quotation-photo.storage";

/** UT-QT-B26…B30: INV-20261026-001 — bounded concurrency before buffering, release on finish/abort. */

vi.mock("@gms/storage", () => ({ uuidV7: () => "id", createStorage: () => ({}), buildKey: () => "quotation-photo/x.jpg" }));
vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

const context = (grants: string[]): MasterContext => ({
  principal: { userId: "u", sessionId: "s", isSuperAdmin: false, grants }, authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true,
});
const auth = (grants: string[]) => ({ createContext: async () => context(grants) }) as unknown as MasterTrpcHandler;

/** A response that records status/body and emits finish/close like Node's ServerResponse. */
function fakeResponse() {
  const emitter = new EventEmitter();
  const state = { status: 0, body: undefined as unknown, headers: {} as Record<string, string>, closed: false, destroyed: false };
  // Getters via defineProperties (Object.assign would copy their value once).
  Object.defineProperties(emitter, {
    closed: { get: () => state.closed },
    destroyed: { get: () => state.destroyed },
  });
  const response = Object.assign(emitter, {
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
    setHeader(key: string, value: string) { state.headers[key] = value; },
    close() { state.closed = true; emitter.emit("close"); },
    finish() { emitter.emit("finish"); emitter.emit("close"); },
  });
  return { response, state };
}

async function run(handler: ReturnType<typeof createQuotationPhotoAccessCheck>, method: string, response = fakeResponse()) {
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  handler({ method, headers: {} } as Request, response.response as unknown as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { next, ...response };
}

describe("quotation photo concurrency (INV-20261026-001)", () => {
  it("UT-QT-B26 the limiter caps active slots and a release is idempotent", () => {
    const limiter = createPhotoLimiter(2);
    const a = limiter.tryAcquire();
    const b = limiter.tryAcquire();
    expect(limiter.tryAcquire()).toBeNull();
    a!();
    a!();
    expect(limiter.active).toBe(1);
    expect(limiter.tryAcquire()).not.toBeNull();
    b!();
  });

  it("UT-QT-B27 over the cap → 503 PARTNER_UNAVAILABLE + Retry-After, before any body is read", async () => {
    const limiters = { uploads: createPhotoLimiter(1), downloads: createPhotoLimiter(1) };
    const handler = createQuotationPhotoAccessCheck(auth(["quotation:ADD", "quotation:VIEW"]), limiters);
    const first = await run(handler, "POST");
    expect(first.next).toHaveBeenCalledOnce();
    const second = await run(handler, "POST");
    expect(second.next).not.toHaveBeenCalled();
    expect(second.state).toMatchObject({ status: 503, headers: { "retry-after": "1" }, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
    // Uploads and downloads have separate caps.
    expect((await run(handler, "GET")).next).toHaveBeenCalledOnce();
  });

  it("UT-QT-B28 the slot is released when the response finishes or the client aborts", async () => {
    const limiters = { uploads: createPhotoLimiter(1), downloads: createPhotoLimiter(5) };
    const handler = createQuotationPhotoAccessCheck(auth(["quotation:EDIT"]), limiters);
    const finished = await run(handler, "POST");
    finished.response.finish();
    expect(limiters.uploads.active).toBe(0);
    const aborted = await run(handler, "POST");
    expect(limiters.uploads.active).toBe(1);
    aborted.response.close();
    expect(limiters.uploads.active).toBe(0);
  });

  it("UT-QT-B29 a client that left during authorization takes no slot; denied users take none either", async () => {
    const limiters = { uploads: createPhotoLimiter(1), downloads: createPhotoLimiter(1) };
    const gone = fakeResponse();
    gone.response.close();
    const left = await run(createQuotationPhotoAccessCheck(auth(["quotation:ADD"]), limiters), "POST", gone);
    expect(left.next).not.toHaveBeenCalled();
    expect(limiters.uploads.active).toBe(0);
    const denied = await run(createQuotationPhotoAccessCheck(auth(["quotation:VIEW"]), limiters), "POST");
    expect(denied.state.status).toBe(403);
    expect(limiters.uploads.active).toBe(0);
  });

  it("UT-QT-B30 a GET with a body is refused; the stream guard stops bytes past the recorded size", async () => {
    const response = fakeResponse();
    const next = vi.fn();
    quotationPhotoMethodCheck({ method: "GET", headers: { "content-length": "10" } } as unknown as Request, response.response as unknown as Response, next);
    expect(response.state.status).toBe(400);
    expect(next).not.toHaveBeenCalled();
    const sink: Buffer[] = [];
    await expect(pipeline(Readable.from([Buffer.alloc(3), Buffer.alloc(3)]), sizeGuard(4), async (source: AsyncIterable<Buffer>) => { for await (const chunk of source) sink.push(chunk); }))
      .rejects.toThrow("recorded size");
  });
});
