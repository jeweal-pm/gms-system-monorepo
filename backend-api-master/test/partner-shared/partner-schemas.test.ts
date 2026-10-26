import { describe, expect, it, vi } from "vitest";
import { decodeCursor, encodeCursor, MAX_CURSOR_LENGTH } from "../../src/common/cursor";
import {
  expectedUpdatedAtSchema,
  LIST_LIMIT_MAX,
  listQuerySchema,
  membershipErrors,
  optText,
  phoneSchema,
} from "../../src/common/partner-schemas";
import { escapeLike, isPrismaUnavailable, toIso } from "../../src/common/persistence";
import { failure, fieldErrors } from "./fixtures";
import { prismaError } from "./prisma-fake";

/** UT-PS-P01…P14: partner building blocks shared by customer and vendor (`common/*`). */

vi.mock("../../src/database/prisma-client", async () => (await import("./prisma-fake")).prismaModule);

const ID = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d0e";

describe("text, phone and version fields", () => {
  it("UT-PS-P01 optText trims, turns empty into null and bounds the length", () => {
    const schema = optText(5);
    expect(schema.parse("  ab ")).toBe("ab");
    expect(schema.parse("   ")).toBeNull();
    expect(schema.parse(null)).toBeNull();
    expect(fieldErrors(schema, "abcdef")).toEqual([{ path: "(root)", code: "too_big" }]);
  });

  it("UT-PS-P02 phone needs an ISO country and an E.164 number (strict)", () => {
    expect(phoneSchema.parse({ country: "TH", e164: "+66812345678" })).toEqual({ country: "TH", e164: "+66812345678" });
    expect(fieldErrors(phoneSchema, { country: "th", e164: "0812345678" }).map((error) => error.path)).toEqual(["country", "e164"]);
    expect(fieldErrors(phoneSchema, { country: "TH", e164: "+0812345678" }).map((error) => error.path)).toEqual(["e164"]);
    expect(fieldErrors(phoneSchema, { country: "TH", e164: "+66812345678", ext: "1" })).toEqual([{ path: "(root)", code: "unrecognized_keys" }]);
  });

  it("UT-PS-P03 expectedUpdatedAt is UTC ISO with exactly milliseconds", () => {
    expect(expectedUpdatedAtSchema.safeParse("2026-10-16T00:00:00.000Z").success).toBe(true);
    for (const value of ["2026-10-16T00:00:00Z", "2026-10-16T00:00:00.000+07:00", "2026-10-16", ""]) {
      expect(expectedUpdatedAtSchema.safeParse(value).success, value).toBe(false);
    }
  });
});

describe("listQuerySchema", () => {
  it("UT-PS-P04 parses string query values and trims q", () => {
    expect(listQuerySchema.parse({ q: "  acme ", active: "false", limit: "20", cursor: "abc" })).toEqual({ q: "acme", active: "false", limit: 20, cursor: "abc" });
    expect(listQuerySchema.parse({})).toEqual({});
  });

  it.each([
    ["limit 0", { limit: "0" }, "limit"],
    [`limit ${LIST_LIMIT_MAX + 1}`, { limit: String(LIST_LIMIT_MAX + 1) }, "limit"],
    ["non-numeric limit", { limit: "ten" }, "limit"],
    ["active other than true/false", { active: "yes" }, "active"],
    ["q over 100 characters", { q: "a".repeat(101) }, "q"],
    ["cursor over the cap", { cursor: "a".repeat(MAX_CURSOR_LENGTH + 1) }, "cursor"],
    ["repeated parameter", { q: ["a", "b"] }, "q"],
    ["unknown parameter", { sort: "name" }, "(root)"],
  ])("UT-PS-P05 rejects %s", (_label, query, path) => {
    expect(fieldErrors(listQuerySchema, query).map((error) => error.path)).toEqual([path]);
  });
});

describe("cursor", () => {
  it("UT-PS-P06 round-trips name key and id as base64url", () => {
    const value = encodeCursor({ nameKey: "acme co", id: ID });
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(value)).toEqual({ nameKey: "acme co", id: ID });
  });

  it.each([
    ["characters outside base64url", "abc+/="],
    ["a value over 200 characters", "a".repeat(MAX_CURSOR_LENGTH + 1)],
    ["non-JSON content", Buffer.from("not json").toString("base64url")],
    ["a wrong version", Buffer.from(JSON.stringify({ n: "a", i: ID, v: 2 })).toString("base64url")],
    ["a non-UUID id", Buffer.from(JSON.stringify({ n: "a", i: "1", v: 1 })).toString("base64url")],
    ["extra keys", Buffer.from(JSON.stringify({ n: "a", i: ID, v: 1, x: 1 })).toString("base64url")],
  ])("UT-PS-P07 rejects %s with 400 {cursor, invalid}", async (_label, value) => {
    expect(await failure(() => decodeCursor(value))).toEqual({ status: 400, code: "VALIDATION_ERROR", fieldErrors: [{ path: "cursor", code: "invalid" }] });
  });
});

describe("membershipErrors (D-09)", () => {
  it("UT-PS-P08 accepts listed currency and countries", () => {
    expect(membershipErrors(true, [["invoiceAddresses", [{ countryCode: "TH" }, { countryCode: "US" }]]])).toEqual([]);
  });

  it("UT-PS-P09 reports unknown currency and each unknown country with its index", () => {
    expect(membershipErrors(false, [["invoiceAddresses", [{ countryCode: "TH" }, { countryCode: "ZZ" }]], ["shippingAddresses", [{ countryCode: "XX" }]]])).toEqual([
      { path: "currencyCode", code: "unknown" },
      { path: "invoiceAddresses.1.countryCode", code: "unknown" },
      { path: "shippingAddresses.0.countryCode", code: "unknown" },
    ]);
  });

  it("UT-PS-P10 keeps values already stored on the record valid", () => {
    expect(membershipErrors(true, [["invoiceAddresses", [{ countryCode: "ZZ" }]]], new Set(["ZZ"]))).toEqual([]);
  });
});

describe("persistence helpers", () => {
  it("UT-PS-P11 escapeLike escapes %, _ and backslash", () => {
    expect(escapeLike("50%_off\\x")).toBe("50\\%\\_off\\\\x");
  });

  it("UT-PS-P12 toIso normalizes Date and PostgreSQL timestamp text to UTC ISO", () => {
    expect(toIso(new Date("2026-10-16T01:02:03.456Z"))).toBe("2026-10-16T01:02:03.456Z");
    expect(toIso("2026-10-16 01:02:03.456")).toBe("2026-10-16T01:02:03.456Z");
    expect(toIso("2026-10-16 08:02:03.456+07:00")).toBe("2026-10-16T01:02:03.456Z");
  });

  it.each(["P1001", "P1002", "P1008", "P1017", "P2024", "P2028"])("UT-PS-P13 %s counts as unavailable", (code) => {
    expect(isPrismaUnavailable(prismaError(code))).toBe(true);
  });

  it("UT-PS-P14 pool/transaction timeouts are unavailable; other errors are not", () => {
    expect(isPrismaUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isPrismaUnavailable(new Error("Transaction already closed: expired transaction"))).toBe(true);
    expect(isPrismaUnavailable(prismaError("P2002"))).toBe(false);
    expect(isPrismaUnavailable(new Error("boom"))).toBe(false);
    expect(isPrismaUnavailable("P1001")).toBe(false);
  });
});
