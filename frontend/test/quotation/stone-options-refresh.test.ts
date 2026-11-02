import { describe, expect, it } from "vitest";
import { isStaleOptionsQuery } from "@/features/quotation/options-context";

const query = (path: string[], dataUpdatedAt: number) => ({ queryKey: [path, { type: "query" }], state: { dataUpdatedAt } }) as unknown as Parameters<typeof isStaleOptionsQuery>[0];

/** Owner 2026-11-02: opening a stone dropdown in the row panel fetches the latest stone codes. */
describe("row panel option refresh", () => {
  const now = 1_000_000;

  it("UT-QT-OPT-01 a document's options query is refetched once it is a few seconds old", () => {
    expect(isStaleOptionsQuery(query(["quotation", "options"], now - 60_000), now)).toBe(true);
    expect(isStaleOptionsQuery(query(["memoOut", "options"], now - 3_000), now)).toBe(true);
    expect(isStaleOptionsQuery(query(["reserve", "options"], 0), now)).toBe(true);
  });

  it("UT-QT-OPT-02 options fetched just now, and other queries, are left alone", () => {
    expect(isStaleOptionsQuery(query(["quotation", "options"], now - 500), now)).toBe(false);
    expect(isStaleOptionsQuery(query(["quotation", "get"], 0), now)).toBe(false);
    expect(isStaleOptionsQuery({ queryKey: ["custom", "options"], state: { dataUpdatedAt: 0 } } as unknown as Parameters<typeof isStaleOptionsQuery>[0], now)).toBe(false);
  });
});
