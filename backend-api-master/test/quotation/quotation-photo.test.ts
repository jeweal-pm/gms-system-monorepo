import { Readable, Writable } from "node:stream";
import { HttpException } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import type { MasterTrpcHandler } from "../../src/master/trpc-handler";
import { QuotationPhotoPublicController } from "../../src/quotation/quotation-photo.public.controller";

/** UT-QT-B21…B24: line photo upload/read boundary (SA-QT-10). Storage bytes are mocked. */

const db = vi.hoisted(() => ({ created: [] as Record<string, unknown>[], file: null as null | { objectKey: string; contentType: string }, stored: [] as Buffer[] }));

vi.mock("@gms/storage", () => ({ uuidV7: () => "00000000-0000-7000-8000-000000000001", createStorage: () => ({}), buildKey: () => "quotation-photo/x.jpg" }));
vi.mock("../../src/database/prisma-client", () => ({
  prisma: {
    storedFile: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.created.push(data); return data; }),
      findFirst: vi.fn(async () => db.file),
    },
  },
}));
vi.mock("../../src/quotation/quotation-photo.storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/quotation/quotation-photo.storage")>()),
  storeQuotationPhoto: vi.fn(async (data: Buffer) => { db.stored.push(data); return { key: "quotation-photo/abc.jpg", sizeBytes: data.length, sha256: "a".repeat(64) }; }),
  openQuotationPhoto: vi.fn(async () => ({ size: 4, stream: Readable.from([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0x00])]) })),
}));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const context = (grants: string[]): MasterContext => ({
  principal: { userId: "user-1", sessionId: "s", isSuperAdmin: false, grants }, authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true,
});
const controllerFor = (grants: string[]) => new QuotationPhotoPublicController({ createContext: async () => context(grants) } as unknown as MasterTrpcHandler);
const upload = (contentType: string, body: unknown) => ({ headers: { "content-type": contentType }, body } as unknown as Request);

async function code(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    if (error instanceof HttpException) return (error.getResponse() as { error: { code: string } }).error.code;
    if (error instanceof TRPCError) return error.message;
    throw error;
  }
  throw new Error("expected a failure");
}

beforeEach(() => {
  db.created = [];
  db.stored = [];
  db.file = { objectKey: "quotation-photo/abc.jpg", contentType: "image/jpeg" };
});

describe("quotation line photos", () => {
  it("UT-QT-B21 ADD or EDIT may upload a JPEG/PNG; the metadata row is ready and owned by the uploader", async () => {
    await expect(controllerFor(["quotation:ADD"]).upload(upload("image/jpeg", JPEG))).resolves.toEqual({ photoId: "00000000-0000-7000-8000-000000000001" });
    expect(db.created[0]).toMatchObject({ kind: "quotation-photo", bucket: "files", status: "ready", sourceType: "quotation.line-photo", sourceId: "00000000-0000-7000-8000-000000000001", createdBy: "user-1", contentType: "image/jpeg" });
    await expect(controllerFor(["quotation:EDIT"]).upload(upload("image/jpeg; charset=x", JPEG))).resolves.toHaveProperty("photoId");
    expect(await code(controllerFor(["quotation:VIEW"]).upload(upload("image/jpeg", JPEG)))).toBe("PERMISSION_DENIED");
  });

  it("UT-QT-B22 wrong type, wrong magic bytes, empty or oversize bodies are QUOTATION_PHOTO_INVALID and store nothing", async () => {
    const controller = controllerFor(["quotation:ADD"]);
    expect(await code(controller.upload(upload("image/gif", JPEG)))).toBe("QUOTATION_PHOTO_INVALID");
    expect(await code(controller.upload(upload("image/png", JPEG)))).toBe("QUOTATION_PHOTO_INVALID");
    expect(await code(controller.upload(upload("image/jpeg", Buffer.alloc(0))))).toBe("QUOTATION_PHOTO_INVALID");
    expect(await code(controller.upload(upload("image/jpeg", Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]))))).toBe("QUOTATION_PHOTO_INVALID");
    expect(db.stored).toHaveLength(0);
  });

  it("UT-QT-B23 VIEW streams a quotation photo (no whole-file buffer) with immutable caching and safe headers", async () => {
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    const response = Object.assign(new Writable({ write(chunk: Buffer, _encoding, callback) { chunks.push(chunk); callback(); } }), {
      setHeader: (key: string, value: string) => { headers[key] = value; },
      status: vi.fn(),
    });
    await controllerFor(["quotation:VIEW"]).read({} as Request, "00000000-0000-7000-8000-000000000001", response as unknown as Response);
    expect(headers).toMatchObject({ "cache-control": "private, max-age=31536000, immutable", "content-type": "image/jpeg", "content-length": "4", "x-content-type-options": "nosniff" });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  });

  it("UT-QT-B24 an unknown or non-quotation file is NOT_FOUND; no VIEW is denied", async () => {
    db.file = null;
    expect(await code(controllerFor(["quotation:VIEW"]).read({} as Request, "00000000-0000-7000-8000-000000000001", {} as Response))).toBe("QUOTATION_NOT_FOUND");
    expect(await code(controllerFor([]).read({} as Request, "00000000-0000-7000-8000-000000000001", {} as Response))).toBe("PERMISSION_DENIED");
  });
});
