import { describe, expect, it } from "vitest";
import {
  assertAtMostOneDefault,
  LIST_LIMIT_MAX,
  listInputSchema,
  listOutputSchema,
  listQueryString,
  optText,
} from "../../src/trpc/partner-schemas";
import { failure, formatted } from "./fixtures";

/** UT-PS-G01…G08: gateway partner building blocks shared by `customer.*` and `vendor.*` (list input incl. cursor/direction). */

describe("listInputSchema", () => {
  it("UT-PS-G01 defaults limit to 50 and accepts an empty input", () => {
    expect(listInputSchema.parse({})).toEqual({ limit: LIST_LIMIT_MAX });
  });

  it("UT-PS-G02 accepts the useInfiniteQuery cursor (null/undefined/string ≤ 200) and direction forward/backward", () => {
    expect(listInputSchema.parse({ cursor: null, direction: "forward" })).toEqual({ cursor: null, direction: "forward", limit: 50 });
    expect(listInputSchema.parse({ cursor: "abc", direction: "backward", limit: 10 })).toEqual({ cursor: "abc", direction: "backward", limit: 10 });
    expect(listInputSchema.parse({ cursor: undefined })).toEqual({ limit: 50 });
    expect(listInputSchema.safeParse({ cursor: "a".repeat(200) }).success).toBe(true);
  });

  it.each([
    ["cursor", { cursor: "a".repeat(201) }, "too_big"],
    ["cursor", { cursor: 5 }, "invalid_type"],
    ["direction", { direction: "up" }, "invalid_value"],
    ["limit", { limit: 0 }, "too_small"],
    ["limit", { limit: 51 }, "too_big"],
    ["limit", { limit: 2.5 }, "invalid_type"],
    ["active", { active: "true" }, "invalid_type"],
    ["q", { q: "a".repeat(101) }, "too_big"],
    ["(root)", { sort: "name" }, "unrecognized_keys"],
  ])("UT-PS-G03 rejects %s %j", (path, input, code) => {
    expect(formatted(listInputSchema, input)?.fieldErrors).toEqual([{ path, code }]);
  });

  it("UT-PS-G04 trims q", () => {
    expect(listInputSchema.parse({ q: "  acme  " }).q).toBe("acme");
  });
});

describe("listQueryString", () => {
  it("UT-PS-G05 forwards limit, q, active (also false) and cursor but never direction", () => {
    expect(listQueryString(listInputSchema.parse({ q: "a&b=c", active: false, cursor: "x_y-z", direction: "backward", limit: 5 }))).toBe("limit=5&q=a%26b%3Dc&active=false&cursor=x_y-z");
  });

  it("UT-PS-G06 omits an empty q, a missing active and a null cursor", () => {
    expect(listQueryString(listInputSchema.parse({ q: "   ", cursor: null }))).toBe("limit=50");
  });
});

describe("assertAtMostOneDefault / optText / list output", () => {
  it("UT-PS-G07 reports every array with more than one default, in key order; zero is fine", async () => {
    expect(() => assertAtMostOneDefault({ a: [], b: [{ isDefault: false }] })).not.toThrow();
    expect(await failure(Promise.resolve().then(() => assertAtMostOneDefault({ b: [{ isDefault: true }, { isDefault: true }], a: [{ isDefault: true }, { isDefault: true }, { isDefault: false }] })))).toEqual({
      code: "BAD_REQUEST", domainCode: "VALIDATION_ERROR", fieldErrors: [{ path: "b", code: "multiple_defaults" }, { path: "a", code: "multiple_defaults" }],
    });
  });

  it("UT-PS-G08 optText and the list output schema behave as the partner contract", () => {
    expect(optText(3).parse("  ")).toBeNull();
    expect(optText(3).safeParse("abcd").success).toBe(false);
    expect(listOutputSchema.safeParse({ items: [], nextCursor: "a".repeat(201), total: 0 }).success).toBe(false);
    expect(listOutputSchema.parse({ items: [{ id: "1", name: "a", code: "C001", active: true, updatedAt: "t", extra: 1 }], nextCursor: null, total: 1 }).items[0]).not.toHaveProperty("extra");
  });
});
