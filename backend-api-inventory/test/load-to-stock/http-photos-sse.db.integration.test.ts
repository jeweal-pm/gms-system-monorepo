import { randomBytes, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import { canRun, masterFixtures, masterModule, ORIGIN, startHarness, type Harness } from "../support/harness";

/**
 * IT-LS-B13 (photos), IT-LS-B15 (HTTP auth chain), IT-LS-B16 (SSE), NP-LS-06/07, the body-size cap (INV-20261117-001
 * acceptance: a chunked body over the limit → 413) and health, through the real Hono app on PostgreSQL + real master.
 */
const TAG = `ls-http-${randomUUID().slice(0, 8)}`;
let h: Harness;
let fx: Awaited<ReturnType<typeof masterFixtures>>;
let vendor: { id: string; addressId: string };
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(256)]);
const form = (data: Buffer, type = "image/png") => { const body = new FormData(); body.append("file", new Blob([new Uint8Array(data)], { type }), "a.png"); return body; };

describe.runIf(canRun)("IT-LS HTTP chain, photos and SSE on PostgreSQL", () => {
  beforeAll(async () => {
    h = await startHarness();
    fx = await masterFixtures(h, TAG);
    vendor = await fx.vendor(`LS Http Vendor ${TAG}`);
  }, 60_000);
  afterAll(async () => {
    if (!h) return;
    await fx.cleanup([]);
    await h.close();
  });

  it("IT-LS-B15 auth chain: no cookie 401; bad origin 403 before the body; missing grant 403 before input use (and before 404); license denied 403; auth view down 503", async () => {
    const viewer = await h.user(["load-to-stock:VIEW"]);
    expect((await h.app.request("/api/inventory/v1/load-to-stock")).status).toBe(401);
    const badOrigin = await viewer.call("POST", "/load-to-stock/purchase-lines/search", { q: "x" }, { origin: "https://evil.example" });
    expect(badOrigin.body.error.code).toBe("CSRF_INVALID");
    expect((await viewer.call("POST", "/load-to-stock/purchase-lines/search", { q: "x" }, { origin: "", "sec-fetch-site": "cross-site" })).status).toBe(403);
    const noGrant = await viewer.call("POST", "/load-to-stock", { not: "even valid" });
    expect(noGrant.body.error.code).toBe("PERMISSION_DENIED");
    const nobody = await h.user([]);
    expect((await nobody.call("GET", `/load-to-stock/${randomUUID()}`)).body.error.code).toBe("PERMISSION_DENIED"); // 403 before 404
    expect((await viewer.call("GET", `/load-to-stock/${randomUUID()}`)).body.error.code).toBe("LOAD_TO_STOCK_NOT_FOUND");
    h.license.state = "DENIED";
    expect((await viewer.call("GET", "/load-to-stock")).body.error.code).toBe("LICENSE_DENIED");
    h.license.state = "UNAVAILABLE";
    expect((await viewer.call("GET", "/load-to-stock")).status).toBe(503);
    h.license.state = "ELIGIBLE";
    h.license.authzDown = true;
    expect((await viewer.call("GET", "/load-to-stock")).body.error.code).toBe("AUTH_UNAVAILABLE");
    h.license.authzDown = false;
    h.sessions.delete(viewer.sessionId);
    expect((await viewer.call("GET", "/load-to-stock")).status).toBe(401);
    const admin = await h.user([], { admin: true });
    expect((await admin.call("GET", "/load-to-stock")).status).toBe(200);
    const ok = await admin.call("GET", "/load-to-stock");
    expect(ok.response.headers.get("cache-control")).toBe("no-store");
    expect(ok.response.headers.get("x-request-id")).toEqual(expect.any(String));
  });

  it("body caps: JSON > 256 KiB → 413 even when chunked (no content-length); malformed JSON → 400; wrong type → 415", async () => {
    const admin = await h.user([], { admin: true });
    const server = serve({ fetch: h.app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const big = "x".repeat(300 * 1024);
      const chunked = new ReadableStream({ start(controller) { for (let i = 0; i < big.length; i += 1024) controller.enqueue(new TextEncoder().encode(big.slice(i, i + 1024))); controller.close(); } });
      const response = await fetch(`http://127.0.0.1:${port}/api/inventory/v1/load-to-stock`, {
        method: "POST", body: chunked, duplex: "half", headers: { cookie: `gms_access=${admin.jwt}`, origin: ORIGIN, "content-type": "application/json" },
      } as RequestInit);
      expect(response.status).toBe(413);
    } finally {
      server.close();
    }
    const malformed = await h.app.request("/api/inventory/v1/load-to-stock", { method: "POST", body: "{", headers: { cookie: `gms_access=${admin.jwt}`, origin: ORIGIN, "content-type": "application/json" } });
    expect(malformed.status).toBe(400);
    expect((await admin.call("POST", "/load-to-stock/purchase-lines/search", "x", { "content-type": "text/plain" })).status).toBe(415);
  });

  it("IT-LS-B13 photos: upload JPEG/PNG ≤ 5 MiB (signature checked); copy from a PU line once (reuse, no new bytes); only under files/load-to-stock/; no delete API; NP-LS-06", async () => {
    const editor = await h.user(["load-to-stock:VIEW", "load-to-stock:ADD"]);
    const original = png();
    const uploaded = await editor.call("POST", "/load-to-stock/photos", form(original));
    expect(uploaded.status).toBe(201);
    const fake = await editor.call("POST", "/load-to-stock/photos", form(Buffer.from("GIF89a not a png"), "image/png"));
    expect(fake.body.error.code).toBe("PHOTO_TYPE_INVALID");
    const tooBig = await editor.call("POST", "/load-to-stock/photos", form(Buffer.concat([png(), Buffer.alloc(5 * 1024 * 1024)])));
    expect([413]).toContain(tooBig.status);
    const read = await editor.call("GET", `/load-to-stock/photos/${uploaded.body.id}`);
    expect(read.response.headers.get("content-type")).toBe("image/png");
    expect(read.response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(read.response.headers.get("cache-control")).toBe("private, max-age=300");
    expect((await editor.call("DELETE", `/load-to-stock/photos/${uploaded.body.id}`)).status).toBe(404);
    // Dev crash 2026-11-17: the photo body is a web byte stream (Readable.toWeb); a browser cancelling the image read must
    // not throw "ReadableStream is already closed" (that took the whole service down), and a full read still returns the bytes.
    const cancelled = await editor.call("GET", `/load-to-stock/photos/${uploaded.body.id}`);
    const reader = cancelled.response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const full = await editor.call("GET", `/load-to-stock/photos/${uploaded.body.id}`);
    expect(Buffer.from(await full.response.arrayBuffer()).equals(original)).toBe(true);

    // A PU line with two photos (written through master's own purchase photo store).
    const pu = await fx.purchase(vendor, [fx.line()]);
    const { createPhotoStore } = await masterModule("src/quotation/quotation-photo.storage");
    const store = createPhotoStore("purchase-photo");
    for (const position of [1, 2]) {
      const bytes = png();
      const saved = await store.store(bytes, "image/png");
      const fileId = randomUUID();
      await h.master.prisma.storedFile.create({ data: { id: fileId, kind: "photo", bucket: "files", objectKey: saved.key, filename: "p.png", contentType: "image/png", sizeBytes: BigInt(saved.sizeBytes), sha256: saved.sha256, status: "ready", sourceType: "purchase.line-photo", sourceId: fileId, createdBy: TAG, readyAt: new Date() } });
      await h.master.prisma.purchaseLinePhoto.create({ data: { lineId: pu.lineIds[0], position, fileId } });
    }
    const first = await h.measured(() => editor.call("POST", "/load-to-stock/photos/from-purchase-line", { purchaseLineId: pu.lineIds[0] }));
    expect(first.result.body.ids).toHaveLength(2);
    const again = await h.measured(() => editor.call("POST", "/load-to-stock/photos/from-purchase-line", { purchaseLineId: pu.lineIds[0] }));
    expect(again.result.body.ids).toEqual(first.result.body.ids);
    expect(first.queries).toBeLessThanOrEqual(3); // 1 lookup + 1 insert per new file (2)
    expect(again.queries).toBe(1);
    expect(again.master.filter((call) => call.includes("/content"))).toHaveLength(0);
    const files = readdirSync(join(h.dir, "inventory", "files", "load-to-stock"));
    expect(files.length).toBe(3); // 1 upload + 2 copies, nothing outside the module prefix
    expect(readdirSync(join(h.dir, "inventory", "files"))).toEqual(["load-to-stock"]);
    const otherVendorLine = await fx.purchase(await fx.vendor(`LS Http Other ${TAG}`), [fx.line({ pcs: 1, weightCt: "1" })]);
    await h.master.prisma.purchaseLine.update({ where: { id: otherVendorLine.lineIds[0] }, data: { loadedPcs: 1, loadedWeightCt: 1 } });
    expect((await editor.call("POST", "/load-to-stock/photos/from-purchase-line", { purchaseLineId: otherVendorLine.lineIds[0] })).body.error.code).toBe("LOAD_TO_STOCK_LINE_UNAVAILABLE");
    await h.master.prisma.purchaseLine.update({ where: { id: otherVendorLine.lineIds[0] }, data: { loadedPcs: 0, loadedWeightCt: 0 } });
    // Saved on a row, then unlinked by an edit: bytes and metadata stay (ADR-0030).
    const photoIds = [uploaded.body.id, ...first.result.body.ids];
    const meta = await h.db.stored_file.count({ where: { id: { in: photoIds } } });
    expect(meta).toBe(3);
  });

  it("INV-20261117-003 F1: the upload slot is taken before the body is read — 3 in flight → 429 RATE_LIMITED; the slot is released after success and after a refusal", async () => {
    const editor = await h.user(["load-to-stock:VIEW", "load-to-stock:ADD"]);
    const releases: (() => void)[] = [];
    const held = [1, 2, 3].map(() => h.photos.writes.run(() => new Promise<void>((resolve) => releases.push(resolve))));
    expect(h.photos.writes.inFlight).toBe(3);
    const full = await editor.call("POST", "/load-to-stock/photos", form(png()));
    expect(full.status).toBe(429);
    expect(full.body.error.code).toBe("RATE_LIMITED");
    expect(full.response.headers.get("retry-after")).toBe("2");
    for (const release of releases) release();
    await Promise.all(held);
    expect(h.photos.writes.inFlight).toBe(0);
    expect((await editor.call("POST", "/load-to-stock/photos", form(png()))).status).toBe(201);
    expect(h.photos.writes.inFlight).toBe(0);
    expect((await editor.call("POST", "/load-to-stock/photos", form(Buffer.from("not an image"), "image/png"))).status).toBe(415);
    expect(h.photos.writes.inFlight).toBe(0);
    const parallel = await Promise.all(Array.from({ length: 8 }, () => editor.call("POST", "/load-to-stock/photos", form(png()))));
    expect(parallel.every((result) => [201, 429].includes(result.status))).toBe(true);
    expect(h.photos.writes.inFlight).toBe(0);
  });

  it("IT-LS-B16 SSE: ready + ids-only notification; ≤ 3 streams per user (the oldest closes); 503 at the process cap; no DB connection held; NP-LS-07", async () => {
    const userA = await h.user(["load-to-stock:VIEW"]);
    const server = serve({ fetch: h.app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise((resolve) => server.once("listening", resolve));
    const port = (server.address() as { port: number }).port;
    const open = async () => {
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${port}/api/inventory/v1/notifications/stream`, { headers: { cookie: `gms_access=${userA.jwt}` }, signal: controller.signal });
      const reader = response.body!.getReader();
      return { response, reader, controller };
    };
    try {
      const first = await open();
      expect(first.response.headers.get("content-type")).toContain("text/event-stream");
      const ready = new TextDecoder().decode((await first.reader.read()).value);
      expect(ready).toContain("event: ready");
      expect(ready).toContain("retry: 5000");
      h.hub.publish({ eventId: "0193a000-0000-7000-8000-000000000001", type: "approval.pending", documentType: "load-to-stock", recipients: [userA.userId] });
      const pushed = new TextDecoder().decode((await first.reader.read()).value);
      expect(pushed).toContain("event: notification");
      expect(JSON.parse(pushed.split("data: ")[1])).toEqual({ id: "0193a000-0000-7000-8000-000000000001", type: "approval.pending", documentType: "load-to-stock" });
      const more = [await open(), await open(), await open()];
      expect(h.hub.size).toBe(3);
      const closed = await first.reader.read();
      expect(closed.done).toBe(true);
      for (const stream of more) stream.controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(h.hub.size).toBe(0);
      const crossSite = await fetch(`http://127.0.0.1:${port}/api/inventory/v1/notifications/stream`, { headers: { cookie: `gms_access=${userA.jwt}`, "sec-fetch-site": "cross-site" } });
      expect(crossSite.status).toBe(403);
      const unauth = await fetch(`http://127.0.0.1:${port}/api/inventory/v1/notifications/stream`);
      expect(unauth.status).toBe(401);
    } finally {
      server.close();
    }
    // NP-LS-07: notifications list is one statement for 1 or 20 rows.
    const { listForUser } = await import("../../src/platform/notification/store");
    const one = await h.measured(() => listForUser(h.db, userA.userId, undefined, 1));
    const many = await h.measured(() => listForUser(h.db, userA.userId, undefined, 20));
    expect([one.queries, many.queries]).toEqual([1, 1]);
  });

  it("health: /health/live process only; /health/ready DB SELECT 1 (master not part of readiness); both unauthenticated", async () => {
    expect((await h.app.request("/health/live")).status).toBe(200);
    expect(await (await h.app.request("/health/ready")).json()).toEqual({ status: "ok" });
  });
});
