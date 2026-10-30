import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { HttpException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import type { MasterTrpcHandler } from "../../src/master/trpc-handler";
import { createPhotoAccessCheck, createPhotoLimiter, sharedPhotoLimiters, PHOTO_DOWNLOADS_MAX, PHOTO_UPLOADS_MAX } from "../../src/quotation/quotation-photo.http";
import { MemoReceivePhotoPublicController } from "../../src/trade-document/memo-receive-photo.public.controller";

/**
 * UT-MR-PH1…PH5: memo-receive SA revision 2 (SA-MR-15/16) — the Memo Receive photo boundary reuses the Quotation
 * photo code with its own module, source and grants, and takes slots from the same process-wide limiters.
 * Storage bytes and Prisma are mocked; the PostgreSQL + file-system path is IT-MR-09.
 */

const db = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  file: null as null | { objectKey: string; contentType: string },
  findWhere: [] as unknown[],
  stored: [] as Buffer[],
  modules: [] as string[],
}));

vi.mock("@gms/storage", () => ({ uuidV7: () => "00000000-0000-7000-8000-000000000009", createStorage: () => ({}), buildKey: () => "x" }));
vi.mock("../../src/database/prisma-client", () => ({
  prisma: {
    storedFile: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.created.push(data); return data; }),
      findFirst: vi.fn(async ({ where }: { where: unknown }) => { db.findWhere.push(where); return db.file; }),
    },
  },
}));
vi.mock("../../src/quotation/quotation-photo.storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/quotation/quotation-photo.storage")>()),
  createPhotoStore: (module: string) => {
    db.modules.push(module);
    return {
      store: vi.fn(async (data: Buffer) => { db.stored.push(data); return { key: `${module}/abc.png`, sizeBytes: data.length, sha256: "b".repeat(64) }; }),
      open: vi.fn(async () => ({ size: 3, stream: Readable.from([Buffer.from([0x89, 0x50]), Buffer.from([0x4e])]) })),
    };
  },
}));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PHOTO_ID = "00000000-0000-7000-8000-000000000009";
const context = (grants: string[], csrfVerified = true): MasterContext => ({
  principal: { userId: "user-1", sessionId: "s", isSuperAdmin: false, grants }, authorization: "CURRENT", license: "ELIGIBLE", csrfVerified,
});
const auth = (grants: string[], csrfVerified = true) => ({ createContext: async () => context(grants, csrfVerified) }) as unknown as MasterTrpcHandler;
const controllerFor = (grants: string[], csrfVerified = true) => new MemoReceivePhotoPublicController(auth(grants, csrfVerified));
const upload = (contentType: string, body: unknown) => ({ headers: { "content-type": contentType }, body } as unknown as Request);

async function code(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { error: { code: string; fieldErrors?: unknown } }).error;
    if (error instanceof TRPCError) return { code: error.message };
    throw error;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  db.created = [];
  db.stored = [];
  db.findWhere = [];
  db.file = { objectKey: "memo-receive-photo/abc.png", contentType: "image/png" };
});

describe("memo receive line photos (SA-MR-15/16)", () => {
  it("UT-MR-PH1 ADD or EDIT + CSRF may upload; the ready row has the memo receive kind/source and its own storage module", async () => {
    expect(db.modules).toContain("memo-receive-photo");
    await expect(controllerFor(["memo-receive:ADD"]).upload(upload("image/png", PNG))).resolves.toEqual({ photoId: PHOTO_ID });
    expect(db.created[0]).toMatchObject({
      kind: "memo-receive-photo", bucket: "files", objectKey: "memo-receive-photo/abc.png", status: "ready", sourceType: "memo_receive.line-photo",
      sourceId: PHOTO_ID, createdBy: "user-1", contentType: "image/png",
    });
    await expect(controllerFor(["memo-receive:EDIT"]).upload(upload("image/jpeg", JPEG))).resolves.toHaveProperty("photoId");
    expect(await code(controllerFor(["memo-receive:VIEW"]).upload(upload("image/png", PNG)))).toMatchObject({ code: "PERMISSION_DENIED" });
    // A Quotation grant is not a Memo Receive grant.
    expect(await code(controllerFor(["quotation:ADD", "quotation:EDIT"]).upload(upload("image/png", PNG)))).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await code(controllerFor(["memo-receive:ADD"], false).upload(upload("image/png", PNG)))).toMatchObject({ code: "CSRF_INVALID" });
    expect(db.created).toHaveLength(2);
  });

  it("UT-MR-PH2 wrong type, wrong magic bytes, empty or oversize bodies are MEMO_RECEIVE_PHOTO_INVALID and store nothing", async () => {
    const controller = controllerFor(["memo-receive:ADD"]);
    const cases: [string, unknown][] = [
      ["image/gif", PNG], ["image/jpeg", PNG], ["image/png", Buffer.alloc(0)], ["image/png", Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])], ["image/png", "text"],
    ];
    for (const [type, body] of cases) {
      expect(await code(controller.upload(upload(type, body)))).toEqual({ code: "MEMO_RECEIVE_PHOTO_INVALID", message: "A photo is missing or is not a JPEG or PNG image up to 5 MB", fieldErrors: [{ path: "(body)", code: "invalid_photo" }] });
    }
    expect(db.stored).toHaveLength(0);
    expect(db.created).toHaveLength(0);
  });

  it("UT-MR-PH3 VIEW streams a ready memo receive photo with immutable caching and safe headers", async () => {
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    const response = Object.assign(new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } }), {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      status: vi.fn(),
    });
    await controllerFor(["memo-receive:VIEW"]).read({} as Request, PHOTO_ID, response as unknown as Response);
    expect(db.findWhere[0]).toEqual({ id: PHOTO_ID, sourceType: "memo_receive.line-photo", status: "ready" });
    expect(headers).toMatchObject({
      "cache-control": "private, max-age=31536000, immutable", "content-type": "image/png", "content-length": "3", "content-disposition": "inline",
      "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0x89, 0x50, 0x4e]));
  });

  it("UT-MR-PH4 an unknown or foreign (e.g. quotation) photo is MEMO_RECEIVE_NOT_FOUND; Quotation VIEW alone is denied", async () => {
    db.file = null;
    expect(await code(controllerFor(["memo-receive:VIEW"]).read({} as Request, PHOTO_ID, {} as Response))).toMatchObject({ code: "MEMO_RECEIVE_NOT_FOUND" });
    expect(await code(controllerFor(["quotation:VIEW"]).read({} as Request, PHOTO_ID, {} as Response))).toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await code(controllerFor(["memo-receive:VIEW"]).read({} as Request, "not-a-uuid", {} as Response))).toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

/** A response that records status/body and emits finish/close like Node's ServerResponse. */
function fakeResponse() {
  const emitter = new EventEmitter();
  const state = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  Object.defineProperties(emitter, { closed: { get: () => false }, destroyed: { get: () => false } });
  const response = Object.assign(emitter, {
    status(value: number) { state.status = value; return response; },
    json(body: unknown) { state.body = body; return response; },
    setHeader(key: string, value: string) { state.headers[key] = value; },
    finish() { emitter.emit("finish"); emitter.emit("close"); },
  });
  return { response, state };
}

async function run(handler: ReturnType<typeof createPhotoAccessCheck>, method: string) {
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  const fake = fakeResponse();
  handler({ method, headers: {} } as Request, fake.response as unknown as Response, next);
  await new Promise((resolve) => setImmediate(resolve));
  return { next, ...fake };
}

describe("shared photo limiter (SA-MR-15, INV-20261026-001)", () => {
  it("UT-MR-PH5 Quotation and Memo Receive routes take slots from the same 3-upload / 6-download limiters; grants are per menu", async () => {
    expect([PHOTO_UPLOADS_MAX, PHOTO_DOWNLOADS_MAX]).toEqual([3, 6]);
    const grants = ["quotation:ADD", "quotation:VIEW", "memo-receive:ADD", "memo-receive:VIEW"];
    const quotation = createPhotoAccessCheck(auth(grants), "quotation", sharedPhotoLimiters);
    const memoReceive = createPhotoAccessCheck(auth(grants), "memo-receive", sharedPhotoLimiters);
    const held = [await run(quotation, "POST"), await run(quotation, "POST"), await run(memoReceive, "POST")];
    held.forEach((entry) => expect(entry.next).toHaveBeenCalledOnce());
    expect(sharedPhotoLimiters.uploads.active).toBe(3);
    const busy = await run(memoReceive, "POST");
    expect(busy.next).not.toHaveBeenCalled();
    expect(busy.state).toMatchObject({ status: 503, headers: { "retry-after": "1" }, body: { error: { code: "PARTNER_UNAVAILABLE" } } });
    expect((await run(quotation, "POST")).next).not.toHaveBeenCalled();
    // Downloads have their own (shared) cap.
    const reading = await run(memoReceive, "GET");
    expect(reading.next).toHaveBeenCalledOnce();
    expect(sharedPhotoLimiters.downloads.active).toBe(1);
    held[0].response.finish();
    const after = await run(memoReceive, "POST");
    expect(after.next).toHaveBeenCalledOnce();
    reading.response.finish();
    [held[1], held[2], after].forEach((entry) => entry.response.finish());
    expect(sharedPhotoLimiters.uploads.active).toBe(0);
    expect(sharedPhotoLimiters.downloads.active).toBe(0);

    // Grants are checked per menu before a slot is taken.
    const fresh = () => ({ uploads: createPhotoLimiter(1), downloads: createPhotoLimiter(1) });
    const quotationOnly = createPhotoAccessCheck(auth(["quotation:ADD", "quotation:VIEW"]), "memo-receive", fresh());
    const denied = await run(quotationOnly, "POST");
    expect(denied.next).not.toHaveBeenCalled();
    expect(denied.state).toMatchObject({ status: 403, body: { error: { code: "PERMISSION_DENIED" } } });
    expect((await run(quotationOnly, "GET")).state).toMatchObject({ status: 403 });
    expect((await run(createPhotoAccessCheck(auth(["memo-receive:VIEW"]), "memo-receive", fresh()), "GET")).next).toHaveBeenCalledOnce();
  });
});
