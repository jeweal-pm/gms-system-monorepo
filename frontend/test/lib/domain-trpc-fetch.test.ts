import { describe, expect, it, vi } from "vitest";
import { createDomainTrpcFetch } from "../../src/lib/domain-trpc-fetch";

describe("domain tRPC fetch", () => {
  it("forwards same-origin cookies and adds the required CSRF marker", async () => {
    const baseFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("ok"));
    const fetchWithDomainSecurity = createDomainTrpcFetch(baseFetch);

    await fetchWithDomainSecurity("/api/master/trpc/customer.create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    const [url, options] = baseFetch.mock.calls[0]!;
    expect(url).toBe("/api/master/trpc/customer.create");
    expect(options?.credentials).toBe("include");
    expect(new Headers(options?.headers).get("x-gms-csrf")).toBe("1");
    expect(new Headers(options?.headers).get("content-type")).toBe("application/json");
  });

  it("refreshes once for concurrent expired reads and retries each GET once", async () => {
    let resolveRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve; });
    let domainCalls = 0;
    const baseFetch = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "/api/auth/refresh") return refreshResponse;
      domainCalls += 1;
      return new Response("", { status: domainCalls <= 2 ? 401 : 200 });
    });
    const fetchWithDomainSecurity = createDomainTrpcFetch(baseFetch);
    const first = fetchWithDomainSecurity("/api/master/trpc/customer.list", { method: "GET" });
    const second = fetchWithDomainSecurity("/api/auth/trpc/session.current", { method: "GET" });
    await vi.waitFor(() => expect(baseFetch.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh")).toHaveLength(1));
    resolveRefresh(new Response(null, { status: 204 }));
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(domainCalls).toBe(4);
    expect(baseFetch.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh")).toHaveLength(1);
  });

  it("never refreshes or replays a mutation and does not loop after a second 401", async () => {
    const baseFetch = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === "/api/auth/refresh") return new Response(null, { status: 204 });
      return new Response("", { status: 401 });
    });
    const fetchWithDomainSecurity = createDomainTrpcFetch(baseFetch);
    const mutation = await fetchWithDomainSecurity("/api/master/trpc/customer.create", { method: "POST", body: "{}" });
    expect(mutation.status).toBe(401);
    expect(baseFetch).toHaveBeenCalledTimes(1);

    baseFetch.mockClear();
    const read = await fetchWithDomainSecurity("/api/master/trpc/customer.list", { method: "GET" });
    expect(read.status).toBe(401);
    expect(baseFetch.mock.calls.filter(([url]) => String(url) === "/api/auth/refresh")).toHaveLength(1);
    expect(baseFetch.mock.calls.filter(([url]) => String(url) === "/api/master/trpc/customer.list")).toHaveLength(2);
  });
});
