import { TRPCError } from "@trpc/server";
import { firstValueFrom, take, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { emitNotificationSignals, NotificationHub, notificationHub, STREAMS_MAX } from "../../src/notification/notification-hub";
import { approverRecipients, creatorRecipient, setApproverLookup } from "../../src/notification/notification-recipients";
import { cleanSummary, decodeCursor, encodeCursor, recordNotification } from "../../src/notification/notification-store";
import { createNotificationStreamGate, NotificationStreamController, reauthDelay, REAUTH_LEAD_MS, STREAM_MAX_MS } from "../../src/notification/notification-stream";
import { isNotificationDocumentType } from "../../src/notification/notification-types";
import { TradeDocumentEngine } from "../../src/trade-document/document-engine";

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));

/** UT-NT-01…10: ADR-0049 notifications (owner 2026-11-11). */
const EVENT = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d01";
const DOC = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d02";

const subscriber = (userId: string) => ({ userId, push: vi.fn(), close: vi.fn() });
const signal = (recipients: string[]) => ({ eventId: EVENT, type: "approval.pending" as const, documentType: "reserve" as const, recipients });

afterEach(() => setApproverLookup(null));

describe("notification hub (D6/D7)", () => {
  it("UT-NT-01 pushes ids only to each recipient's open streams, never to others", () => {
    const hub = new NotificationHub();
    const a = subscriber("a");
    const a2 = subscriber("a");
    const b = subscriber("b");
    hub.open(a);
    hub.open(a2);
    hub.open(b);
    hub.publish(signal(["a", "a"]));
    expect(a.push).toHaveBeenCalledTimes(1);
    expect(a.push).toHaveBeenCalledWith({ id: EVENT, type: "approval.pending", documentType: "reserve" });
    expect(a2.push).toHaveBeenCalledTimes(1);
    expect(b.push).not.toHaveBeenCalled();
  });

  it("UT-NT-02 keeps ≤ 3 streams per user (closing the oldest) and refuses past the process cap", () => {
    const hub = new NotificationHub(3, 4);
    const streams = [subscriber("a"), subscriber("a"), subscriber("a"), subscriber("a")];
    const closers = streams.map((stream) => hub.open(stream));
    expect(streams[0].close).toHaveBeenCalledTimes(1);
    expect(hub.size).toBe(3);
    closers[0]?.(); // the closed oldest unregisters as a no-op
    expect(hub.size).toBe(3);
    expect(hub.open(subscriber("b"))).not.toBeNull();
    expect(hub.isFull()).toBe(true);
    expect(hub.open(subscriber("c"))).toBeNull();
    closers[3]?.();
    closers[3]?.();
    expect(hub.size).toBe(3);
    expect(STREAMS_MAX).toBe(200);
  });

  it("UT-NT-03 emits only real signals with recipients, and a broken stream does not stop the others", () => {
    const broken = { userId: "x", push: vi.fn(() => { throw new Error("gone"); }), close: vi.fn() };
    const ok = subscriber("x");
    const close1 = notificationHub.open(broken);
    const close2 = notificationHub.open(ok);
    emitNotificationSignals([null, undefined, signal([]), signal(["x"])]);
    expect(ok.push).toHaveBeenCalledTimes(1);
    close1?.();
    close2?.();
    expect(notificationHub.size).toBe(0);
  });
});

describe("recipients (D4, Q-NT-08)", () => {
  it("UT-NT-04 approvers come from the lookup without the actor; a failed lookup never fails the save", async () => {
    expect(await approverRecipients("reserve", "a")).toEqual([]);
    const lookup = vi.fn(async () => ["a", "b", "b", "c"]);
    setApproverLookup(lookup);
    expect(await approverRecipients("purchase-order", "a")).toEqual(["b", "c"]);
    expect(lookup).toHaveBeenCalledWith("purchase-order");
    setApproverLookup(async () => { throw new Error("db down"); });
    expect(await approverRecipients("reserve", "a")).toEqual([]);
    expect(creatorRecipient("u1", "u2")).toEqual(["u1"]);
    expect(creatorRecipient("u1", "u1")).toEqual([]);
    expect(creatorRecipient(null, "u1")).toEqual([]);
    expect(isNotificationDocumentType("memo-out")).toBe(true);
    expect(isNotificationDocumentType("quotation")).toBe(true);
    expect(isNotificationDocumentType("stone-master")).toBe(false);
  });
});

describe("store (D2/D5)", () => {
  it("UT-NT-14 (BE-NT-007) a Thai party name and a Thai reason at full length still fit the 1 KB summary CHECK", () => {
    const thai = (n: number) => "ก".repeat(n); // 3 UTF-8 bytes each
    const summary = cleanSummary({ partyName: thai(250), amount: "123456789012.34", currency: "THB", reason: thai(250) });
    const jsonbText = JSON.stringify(summary).replace(/":/g, "\": ").replace(/,"/g, ", \""); // jsonb's text adds spaces
    expect(Buffer.byteLength(jsonbText, "utf8")).toBeLessThanOrEqual(1024);
    expect(summary.partyName).toBe(thai(200)); // the party name is kept whole; the reason gives way first
    expect(summary.reason?.endsWith("…")).toBe(true);
    expect(summary.reason!.length).toBeGreaterThan(20);
    // Short texts and emoji (surrogate pairs) are never cut in half.
    expect(cleanSummary({ reason: "ราคาไม่ถูกต้อง" })).toEqual({ reason: "ราคาไม่ถูกต้อง" });
    const emoji = cleanSummary({ partyName: "💎".repeat(200), reason: "💎".repeat(200) });
    expect(Buffer.byteLength(JSON.stringify(emoji), "utf8")).toBeLessThanOrEqual(960);
    expect(emoji.reason ?? "").not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("UT-NT-15 (INV-20261112-002) clipping keeps whole code points: an emoji at UTF-16 unit 199/200 or a lone surrogate never reaches jsonb", () => {
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    const odd = `${"a".repeat(199)}😀${"b".repeat(50)}`;
    const summary = cleanSummary({ reason: odd, partyName: `${"x".repeat(199)}💎💎` });
    for (const text of [summary.reason!, summary.partyName!]) {
      expect(text).not.toMatch(lone);
      expect(JSON.stringify(text)).not.toMatch(/\\ud[89a-f]/i);
      expect(Array.from(text)).toHaveLength(200);
    }
    expect(summary.reason!.endsWith("😀")).toBe(true);
    expect(cleanSummary({ reason: "bad \uD83D end", partyName: "\uDC00x" })).toEqual({ reason: "bad � end", partyName: "�x" });
  });

  it("UT-NT-05 records the event and distinct recipient rows (never the actor) in the given transaction", async () => {
    const tx = { notificationEvent: { create: vi.fn(async () => ({})) }, notificationRecipient: { createMany: vi.fn(async () => ({ count: 2 })) } };
    const result = await recordNotification(tx as never, {
      type: "approval.pending", documentType: "reserve", documentId: DOC, docNo: "RS-1", actorId: "a",
      recipients: ["a", "b", "b", "c"], summary: { partyName: `  ${"x".repeat(300)} `, amount: "10.00", currency: "THB", reason: "  " },
    });
    expect(result).toMatchObject({ type: "approval.pending", documentType: "reserve", recipients: ["b", "c"] });
    const created = (tx.notificationEvent.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(created).toMatchObject({ id: result.eventId, documentId: DOC, docNo: "RS-1", actorUserId: "a", summary: { partyName: "x".repeat(200), amount: "10.00", currency: "THB" } });
    expect(created.summary).not.toHaveProperty("reason");
    expect(tx.notificationRecipient.createMany).toHaveBeenCalledWith({ data: [{ eventId: result.eventId, userId: "b", createdAt: created.createdAt }, { eventId: result.eventId, userId: "c", createdAt: created.createdAt }] });

    const alone = { notificationEvent: { create: vi.fn(async () => ({})) }, notificationRecipient: { createMany: vi.fn() } };
    expect((await recordNotification(alone as never, { type: "document.approved", documentType: "purchase", documentId: DOC, docNo: "PU-1", actorId: "a", recipients: ["a"], summary: {} })).recipients).toEqual([]);
    expect(alone.notificationRecipient.createMany).not.toHaveBeenCalled();
  });

  it("UT-NT-06 keyset cursors round-trip and anything else is a VALIDATION_ERROR", () => {
    const at = new Date("2026-11-11T03:04:05.678Z");
    expect(decodeCursor(encodeCursor(at, EVENT))).toEqual({ createdAt: at, id: EVENT });
    for (const bad of ["", "abc", Buffer.from(`2026-11-11|${EVENT}`).toString("base64url"), Buffer.from(`${at.toISOString()}|not-a-uuid`).toString("base64url"), Buffer.from(`${at.toISOString()}|${EVENT}|x`).toString("base64url")]) {
      expect(() => decodeCursor(bad)).toThrow();
    }
    expect(cleanSummary({ partyName: "A", extra: "no" } as never)).toEqual({ partyName: "A" });
  });
});

describe("engine hook (D3)", () => {
  const engine = (transactionKey: string) => new TradeDocumentEngine({
    model: "reserve", transactionKey, party: { nameColumn: "customerName" }, event: "reserve", createStatus: "PENDING_APPROVAL",
  } as never);

  it("UT-NT-07 an approval tells the creator (with a display summary), and documents without approval stay silent", async () => {
    const findUnique = vi.fn(async ({ select }: { select: Record<string, boolean> }) => (
      select.createdBy ? { docNo: "RS-2611-0001", createdBy: "creator" } : { customerName: "Acme", grandTotal: { toFixed: () => "1234.50" }, currencyCode: "THB" }
    ));
    const tx = { reserve: { findUnique }, notificationEvent: { create: vi.fn(async () => ({})) }, notificationRecipient: { createMany: vi.fn(async () => ({ count: 1 })) } };
    const [sent] = await engine("reserve").notifyApproved(tx as never, DOC, "approver");
    expect(sent).toMatchObject({ type: "document.approved", documentType: "reserve", recipients: ["creator"] });
    expect(tx.notificationEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ docNo: "RS-2611-0001", summary: { partyName: "Acme", amount: "1234.50", currency: "THB" } }) });
    expect(await engine("stone-master").notifyApproved(tx as never, DOC, "approver")).toEqual([]);
  });
});

describe("stream (D6)", () => {
  const context = (overrides: Partial<MasterContext> = {}): MasterContext => ({
    principal: { userId: "u1", sessionId: "s1", isSuperAdmin: false, grants: [] },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true, accessExpiresAt: 1_000_000, ...overrides,
  });
  function response() {
    const res = { closed: false, destroyed: false, statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
    return Object.assign(res, {
      status: vi.fn((code: number) => { res.statusCode = code; return res; }),
      json: vi.fn((body: unknown) => { res.body = body; return res; }),
      setHeader: vi.fn((name: string, value: string) => { res.headers[name] = value; }),
    });
  }
  async function run(gate: ReturnType<typeof createNotificationStreamGate>, headers: Record<string, string> = {}, method = "GET") {
    const req = { method, headers } as never as { notificationPrincipal?: unknown };
    const res = response();
    const next = vi.fn();
    gate(req as never, res as never, next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { req, res, next };
  }

  it("UT-NT-08 reauth goes 60 s before access expiry, never later than 14 min, never negative", () => {
    expect(reauthDelay(10 * 60_000, 0)).toBe(10 * 60_000 - REAUTH_LEAD_MS);
    expect(reauthDelay(null, 0)).toBe(STREAM_MAX_MS);
    expect(reauthDelay(60 * 60_000, 0)).toBe(STREAM_MAX_MS);
    expect(reauthDelay(30_000, 0)).toBe(0);
  });

  it("UT-NT-09 the gate refuses wrong methods, cross-site, no session and a full process before opening a stream", async () => {
    const ok = { createContext: vi.fn(async () => context()) };
    expect((await run(createNotificationStreamGate(ok), {}, "POST")).res.statusCode).toBe(405);
    expect((await run(createNotificationStreamGate(ok), { "sec-fetch-site": "cross-site" })).res.statusCode).toBe(403);
    const anonymous = { createContext: vi.fn(async () => { throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHENTICATED" }); }) };
    const refused = await run(createNotificationStreamGate(anonymous));
    expect(refused.res.statusCode).toBe(401);
    expect(refused.res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "UNAUTHENTICATED" } });
    expect(refused.next).not.toHaveBeenCalled();
    const stale = await run(createNotificationStreamGate({ createContext: vi.fn(async () => context({ authorization: "UNAVAILABLE" })) }));
    expect(stale.res.statusCode).toBe(503);

    const accepted = await run(createNotificationStreamGate(ok), { "sec-fetch-site": "same-origin" });
    expect(accepted.next).toHaveBeenCalledTimes(1);
    expect(accepted.req.notificationPrincipal).toEqual({ userId: "u1", accessExpiresAt: 1_000_000 });
    expect(accepted.res.headers).toMatchObject({ "cache-control": "no-store", "x-accel-buffering": "no" });

    const full = new NotificationHub(3, 0);
    const spy = vi.spyOn(notificationHub, "isFull").mockImplementation(() => full.isFull());
    const busy = await run(createNotificationStreamGate(ok));
    expect(busy.res.statusCode).toBe(503);
    expect(busy.res.headers["retry-after"]).toBe("30");
    spy.mockRestore();
  });

  it("UT-NT-10 a stream says ready, relays its user's notifications, then asks to reauth and closes", async () => {
    vi.useFakeTimers({ now: 0 });
    try {
      const controller = new NotificationStreamController();
      const events = firstValueFrom(controller.stream({ notificationPrincipal: { userId: "u9", accessExpiresAt: 90_000 } } as never).pipe(take(4), toArray()));
      emitNotificationSignals([signal(["u9"])]);
      await vi.advanceTimersByTimeAsync(25_000);
      await vi.advanceTimersByTimeAsync(5_000);
      expect((await events).map((event) => event.type)).toEqual(["ready", "notification", "ping", "reauth"]);
      expect(notificationHub.size).toBe(0);
      expect(() => controller.stream({} as never)).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
