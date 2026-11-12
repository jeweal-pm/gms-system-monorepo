import { afterEach, describe, expect, it, vi } from "vitest";
import { retryAfterMs, uploadLinePhoto } from "@/features/quotation/api";

/**
 * UT-PH-R01…R04 (owner 2026-11-11, "sometimes it says Couldn't upload the photo"): an expired access cookie (401) is
 * renewed once and the photo sent again; a busy route (503) is retried once after Retry-After.
 */
const ROUTE = "/api/v1/reserve/photos";
const file = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ring.png", { type: "image/png" });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function stubFetch(replies: Response[]) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      const next = replies.shift();
      if (!next) throw new Error("unexpected request " + String(input));
      return next;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("line photo upload retries", () => {
  it("UT-PH-R01 401 → renew the session → send again → photo id", async () => {
    const calls = stubFetch([json(401, {}), new Response(null, { status: 204 }), json(201, { photoId: "p1" })]);
    await expect(uploadLinePhoto(ROUTE, file())).resolves.toBe("p1");
    expect(calls).toEqual([
      { url: ROUTE, method: "POST" },
      { url: "/api/auth/refresh", method: "POST" },
      { url: ROUTE, method: "POST" },
    ]);
  });

  it("UT-PH-R02 the session can't be renewed → a clear sign-in message, not 'Try again'", async () => {
    const calls = stubFetch([json(401, {}), json(401, {})]);
    await expect(uploadLinePhoto(ROUTE, file())).rejects.toThrow("Your session has ended. Sign in again, then add the photo.");
    expect(calls.map((call) => call.url)).toEqual([ROUTE, "/api/auth/refresh"]);
  });

  it("UT-PH-R03 503 (busy) → wait Retry-After → send once more", async () => {
    vi.useFakeTimers();
    const calls = stubFetch([json(503, {}, { "retry-after": "1" }), json(201, { photoId: "p2" })]);
    const upload = uploadLinePhoto(ROUTE, file());
    await vi.advanceTimersByTimeAsync(1000);
    await expect(upload).resolves.toBe("p2");
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
    stubFetch([json(503, {}, { "retry-after": "0" }), json(503, {})]);
    await expect(uploadLinePhoto(ROUTE, file())).rejects.toThrow("The server is busy. Wait a moment and add the photo again.");
  });

  it("UT-PH-R04 Retry-After is kept between 300 ms and 2 s", () => {
    const headers = (value: string | null) => ({ headers: new Headers(value === null ? {} : { "retry-after": value }) });
    expect(retryAfterMs(headers(null))).toBe(1000);
    expect(retryAfterMs(headers("0.1"))).toBe(300);
    expect(retryAfterMs(headers("30"))).toBe(2000);
    expect(retryAfterMs(headers("abc"))).toBe(1000);
  });
});
