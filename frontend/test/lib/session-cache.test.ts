import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearAccountCache } from "@/lib/session-cache";

/** UT-SC-01…02: a new sign-in/sign-out never reuses the previous account's cached data. */
describe("clearAccountCache", () => {
  it("UT-SC-01 removes the previous account's permission.mine result", () => {
    const client = new QueryClient();
    const key = [["permission", "mine"], { type: "query" }];
    client.setQueryData(key, { isSuperAdmin: false, permissions: ["vendor:VIEW"] });
    clearAccountCache(client);
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it("UT-SC-02 empties every cached query, not only permissions", () => {
    const client = new QueryClient();
    client.setQueryData(["a"], 1);
    client.setQueryData(["b"], 2);
    clearAccountCache(client);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
