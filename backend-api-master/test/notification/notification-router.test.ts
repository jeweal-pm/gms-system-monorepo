import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterContext } from "../../src/master/authorization";
import { createMasterRouter, viewableNotificationTypes, type MasterServices } from "../../src/master/router";
import * as store from "../../src/notification/notification-store";

vi.mock("../../src/database/prisma-client", () => ({ prisma: {} }));
vi.mock("../../src/notification/notification-store", () => ({
  NOTIFICATION_PAGE_MAX: 20,
  unreadCount: vi.fn(async () => ({ count: 2 })),
  listForUser: vi.fn(async () => ({ items: [], nextCursor: null })),
  listForTypes: vi.fn(async () => ({ items: [], nextCursor: null })),
  markRead: vi.fn(async () => ({ updated: 1 })),
  markAllRead: vi.fn(async () => ({ updated: 3 })),
}));

/** UT-NT-11…13: the `notification` tRPC router (api-contract rev 1). */
const A = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d01";
const router = createMasterRouter({} as MasterServices);

function context(grants: string[], overrides: Partial<MasterContext> = {}): MasterContext {
  return {
    principal: { userId: "user-1", sessionId: "session-1", isSuperAdmin: false, grants },
    authorization: "CURRENT", license: "ELIGIBLE", csrfVerified: true, ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("notification router (ADR-0049)", () => {
  it("UT-NT-11 needs a live session but no menu grant, and only ever reads the caller's own rows", async () => {
    await expect(router.createCaller(context([], { principal: null })).notification.unreadCount()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(router.createCaller(context([], { license: "DENIED" })).notification.unreadCount()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await router.createCaller(context([])).notification.unreadCount()).toEqual({ count: 2 });
    expect(store.unreadCount).toHaveBeenCalledWith("user-1");
    await router.createCaller(context([])).notification.list({ scope: "for-me", cursor: "c", limit: 5 });
    expect(store.listForUser).toHaveBeenCalledWith("user-1", "c", 5);
    await expect(router.createCaller(context([])).notification.list({ scope: "for-me", limit: 21 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // The browser's infinite query adds `direction` (regression: a strict schema refused every panel load).
    await router.createCaller(context([])).notification.list({ scope: "for-me", limit: 20, cursor: null, direction: "forward" });
    expect(store.listForUser).toHaveBeenLastCalledWith("user-1", null, 20);
  });

  it("UT-NT-12 \"all\" lists only document types the caller may VIEW (Super Admin: every type)", async () => {
    await router.createCaller(context(["reserve:VIEW", "purchase:APPROVE", "quotation:VIEW"])).notification.list({ scope: "all" });
    expect(store.listForTypes).toHaveBeenCalledWith(["quotation", "reserve"], undefined, undefined);
    expect(viewableNotificationTypes(context([], { principal: { userId: "x", sessionId: "s", isSuperAdmin: true, grants: [] } }))).toHaveLength(8);
    expect(viewableNotificationTypes(context([], { principal: null }))).toEqual([]);
  });

  it("UT-NT-13 marking read needs CSRF and 1…50 distinct ids", async () => {
    await expect(router.createCaller(context([], { csrfVerified: false })).notification.markRead({ ids: [A] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context([], { csrfVerified: false })).notification.markAllRead()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(router.createCaller(context([])).notification.markRead({ ids: [] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context([])).notification.markRead({ ids: [A, A] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(router.createCaller(context([])).notification.markRead({ ids: ["nope"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.markRead).not.toHaveBeenCalled();
    expect(await router.createCaller(context([])).notification.markRead({ ids: [A] })).toEqual({ updated: 1 });
    expect(store.markRead).toHaveBeenCalledWith("user-1", [A]);
    expect(await router.createCaller(context([])).notification.markAllRead()).toEqual({ updated: 3 });
    expect(store.markAllRead).toHaveBeenCalledWith("user-1");
  });
});
