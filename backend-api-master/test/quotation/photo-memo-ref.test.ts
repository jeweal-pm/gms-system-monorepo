import { Readable, Writable } from "node:stream";
import { Logger } from "@nestjs/common";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { lotRefFromQuery, streamPhoto, type PhotoEndpoint } from "../../src/quotation/quotation-photo.public.controller";

/**
 * UT-SO-PH1 (owner 2026-11-24, option 2): a document's photo route serves a Memo Receive photo ONLY while a line of that document
 * links it (`memoRefTable`), under the document's VIEW grant; its own source behaves as before. Prisma and storage are mocked.
 */
const db = vi.hoisted(() => ({
  file: null as null | { objectKey: string; contentType: string; sourceType: string },
  where: [] as unknown[],
  linked: false,
  belongs: false,
  opened: [] as string[],
}));

vi.mock("../../src/database/prisma-client", () => ({
  prisma: {
    // okPhotoRefs (lot check) is a VALUES query; the link check is an EXISTS.
    $queryRaw: vi.fn(async (query: { sql: string }) => (query.sql.includes("VALUES") ? (db.belongs ? [{ file_id: ID_FILE, ms: null, lk: "MS-x" }] : []) : [{ ok: db.linked }])),
    storedFile: { findFirst: vi.fn(async ({ where }: { where: unknown }) => { db.where.push(where); return db.file; }) },
  },
}));
vi.mock("../../src/quotation/quotation-photo.storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/quotation/quotation-photo.storage")>()),
  createPhotoStore: (module: string) => ({
    store: vi.fn(),
    open: vi.fn(async (key: string) => { db.opened.push(`${module}:${key}`); return { size: 3, stream: Readable.from([Buffer.from([0x89, 0x50, 0x4e])]) }; }),
  }),
}));

const ID = "00000000-0000-7000-8000-000000000009";
const ID_FILE = ID;
const LOT = "MS00000000-0000-7000-8000-00000000000a";
const context = (grants: string[]): MasterContext => ({ principal: { userId: "u", sessionId: "s", isSuperAdmin: false, grants }, authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true });
const notFound = new Error("NOT_FOUND");
const endpoint = (extra: Partial<PhotoEndpoint> = {}): PhotoEndpoint => ({
  menu: "reserve", kind: "reserve-photo", source: "reserve.line-photo", event: "reserve",
  store: vi.fn(), open: vi.fn(async (key: string) => { db.opened.push(`reserve-photo:${key}`); return { size: 3, stream: Readable.from([Buffer.from([0x89, 0x50, 0x4e])]) }; }),
  invalid: () => new Error("invalid"), notFound: () => notFound, mapError: (error) => error, ...extra,
});
const response = () => Object.assign(new Writable({ write(_chunk, _encoding, callback) { callback(); } }), { setHeader: vi.fn(), status: vi.fn() }) as unknown as Response;
const logger = new Logger("test");

beforeEach(() => {
  db.where = [];
  db.opened = [];
  db.linked = false;
  db.belongs = false;
  db.file = { objectKey: "memo-receive-photo/abc.png", contentType: "image/png", sourceType: "memo_receive.line-photo" };
});

describe("UT-SO-PH1 referenced Memo Receive photos", () => {
  it("a memo photo linked from a line of this document is served from the memo store under the document's VIEW grant", async () => {
    db.linked = true;
    await streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["reserve:VIEW"]), ID, response(), logger);
    expect(db.where[0]).toEqual({ id: ID, sourceType: { in: ["reserve.line-photo", "memo_receive.line-photo"] }, status: "ready" });
    expect(db.opened).toEqual(["memo-receive-photo:memo-receive-photo/abc.png"]);
  });

  it("an unrelated memo file (no line of this document links it) is not found; nothing is opened", async () => {
    db.linked = false;
    await expect(streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["reserve:VIEW"]), ID, response(), logger)).rejects.toBe(notFound);
    expect(db.opened).toEqual([]);
  });

  it("memo-receive VIEW alone does not read it through the document route; a document without the option never looks at memo files", async () => {
    await expect(streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["memo-receive:VIEW"]), ID, response(), logger)).rejects.toMatchObject({ message: "PERMISSION_DENIED" });
    db.file = null;
    await expect(streamPhoto(endpoint(), context(["reserve:VIEW"]), ID, response(), logger)).rejects.toBe(notFound);
    expect(db.where.at(-1)).toEqual({ id: ID, sourceType: "reserve.line-photo", status: "ready" });
  });

  it("picker preview: an unsaved row's photo is served through the document route when it belongs to the named lot; not when it does not", async () => {
    db.linked = false;
    db.belongs = true;
    await streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["reserve:VIEW"]), ID, response(), logger, lotRefFromQuery({ lotKey: LOT }));
    expect(db.opened).toEqual(["memo-receive-photo:memo-receive-photo/abc.png"]);
    db.opened = [];
    db.belongs = false;
    await expect(streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["reserve:VIEW"]), ID, response(), logger, lotRefFromQuery({ lotKey: LOT }))).rejects.toBe(notFound);
    expect(db.opened).toEqual([]);
    // Without the document's VIEW grant the lot hint changes nothing.
    db.belongs = true;
    await expect(streamPhoto(endpoint({ memoRefTable: "reserve_line_photo" }), context(["memo-receive:VIEW"]), ID, response(), logger, lotRefFromQuery({ lotKey: LOT }))).rejects.toMatchObject({ message: "PERMISSION_DENIED" });
  });

  it("the lot hint accepts only a well-formed lot key or stock id", () => {
    expect(lotRefFromQuery({ lotKey: LOT })).toEqual({ memoStockId: null, lotKey: LOT });
    expect(lotRefFromQuery({ memoStockId: "00000000-0000-7000-8000-00000000000B" })).toEqual({ memoStockId: "00000000-0000-7000-8000-00000000000b", lotKey: null });
    expect(lotRefFromQuery({ lotKey: "OS123" })).toBeUndefined();
    expect(lotRefFromQuery({ lotKey: ["x"], memoStockId: "nope" })).toBeUndefined();
    expect(lotRefFromQuery(undefined)).toBeUndefined();
  });

  it("every document that picks Memo Stock lots serves referenced photos through its own link table", async () => {
    const { linePhotoEndpoints } = await import("../../src/trade-document/line-photo.public.controllers");
    expect({
      reserve: linePhotoEndpoints.reserve.memoRefTable, memoOut: linePhotoEndpoints.memoOut.memoRefTable,
      purchase: linePhotoEndpoints.purchase.memoRefTable, memoReturn: linePhotoEndpoints.memoReturn.memoRefTable,
      memoOutReturn: linePhotoEndpoints.memoOutReturn.memoRefTable,
    }).toEqual({ reserve: "reserve_line_photo", memoOut: "memo_out_line_photo", purchase: "purchase_line_photo", memoReturn: "memo_return_line_photo", memoOutReturn: undefined });
  });
});
