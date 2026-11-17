import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { checkLineLocations, decodeLocationCursor, encodeLocationCursor, LOCATION_CURSOR_MAX, LOCATION_OPTIONS_LIMIT } from "../../src/location-master/location-master.service";
import { createLocationBodySchema, deleteLocationBodySchema, updateLocationBodySchema } from "../../src/location-master/location-master.schemas";

/** UT-LM-B01 / B03 / B04 (location-master SA rev 1, ADR-0053): schemas, cursor, the documents' line check. */

const AT = "2026-11-16T03:00:00.000Z";

function fieldErrors(error: unknown) {
  return ((error as HttpException).getResponse() as { error: { code: string; fieldErrors: { path: string; code: string }[] } }).error;
}

describe("location master schemas (UT-LM-B01)", () => {
  it("trims the name, 1–40 characters, active defaults on, strict inputs", () => {
    expect(createLocationBodySchema.parse({ name: "  Safe A  " })).toEqual({ name: "Safe A", active: true });
    expect(createLocationBodySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createLocationBodySchema.safeParse({ name: "x".repeat(41) }).success).toBe(false);
    expect(createLocationBodySchema.safeParse({ name: "x".repeat(40) }).success).toBe(true);
    expect(createLocationBodySchema.safeParse({ name: "A", code: "x" }).success).toBe(false);
    expect(updateLocationBodySchema.parse({ name: "B", active: false, expectedUpdatedAt: AT })).toEqual({ name: "B", active: false, expectedUpdatedAt: AT });
    expect(updateLocationBodySchema.safeParse({ name: "B", active: false }).success).toBe(false);
    expect(deleteLocationBodySchema.safeParse({ expectedUpdatedAt: "yesterday" }).success).toBe(false);
  });
});

describe("list cursor (UT-LM-B03)", () => {
  it("round-trips the last name and id and refuses anything else", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(decodeLocationCursor(encodeLocationCursor("Safe A", id))).toEqual({ name: "Safe A", id });
    for (const bad of ["not-base64!", Buffer.from("{}").toString("base64url"), Buffer.from(JSON.stringify({ n: "A", i: "x", v: 1 })).toString("base64url"), "a".repeat(LOCATION_CURSOR_MAX + 1)]) {
      expect(() => decodeLocationCursor(bad)).toThrow(HttpException);
    }
  });

  it("fits a 40-character Thai name and a 40-character escaped name (sec-auditor 2026-11-16)", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const name of ["ก".repeat(40), "\u0001".repeat(40), "\u{1F48E}".repeat(20)]) {
      const cursor = encodeLocationCursor(name, id);
      expect(cursor.length).toBeLessThanOrEqual(LOCATION_CURSOR_MAX);
      expect(decodeLocationCursor(cursor)).toEqual({ name, id });
    }
    expect(encodeLocationCursor("ก".repeat(40), id).length).toBeGreaterThan(200);
  });
});

describe("document line locations (UT-LM-B04, SA-LM-05)", () => {
  const client = (active: string[]) => ({ location: { findMany: vi.fn(async () => active.map((name) => ({ name }))) } }) as never;
  type Line = { location: string; source: "MANUAL" | "STOCK" };
  const manual = (line: Line) => line.source === "MANUAL";

  it("an active name (any case) is stored in the master's spelling; blank and copied lines pass untouched", async () => {
    const tx = client(["Safe A", "Shelf 1"]);
    const lines: Line[] = [{ location: "safe a", source: "MANUAL" }, { location: "", source: "MANUAL" }, { location: "Memo", source: "STOCK" }];
    const stored = vi.fn(async () => [] as string[]);
    expect(await checkLineLocations(tx, lines, manual, stored)).toEqual([{ location: "Safe A", source: "MANUAL" }, { location: "", source: "MANUAL" }, { location: "Memo", source: "STOCK" }]);
  });

  it("a value the document already stores may stay (old typed or deactivated name)", async () => {
    const lines: Line[] = [{ location: "Back room", source: "MANUAL" }];
    expect(await checkLineLocations(client(["Safe A"]), lines, manual, async () => ["Back room"])).toEqual(lines);
  });

  it("an unknown or inactive name on a typed line is refused with its row's field error", async () => {
    const lines: Line[] = [{ location: "Safe A", source: "MANUAL" }, { location: "Nowhere", source: "MANUAL" }, { location: "Elsewhere", source: "STOCK" }, { location: "Old", source: "MANUAL" }];
    const error = await checkLineLocations(client(["Safe A"]), lines, manual, async () => []).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect(fieldErrors(error)).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: [{ path: "lines.1.location", code: "unknown_location" }, { path: "lines.3.location", code: "unknown_location" }] });
  });

  it("no typed location reads nothing; the active names are bounded", async () => {
    const tx = client(["Safe A"]);
    const stored = vi.fn(async () => [] as string[]);
    await checkLineLocations(tx, [{ location: " ", source: "MANUAL" }], manual, stored);
    expect((tx as unknown as { location: { findMany: ReturnType<typeof vi.fn> } }).location.findMany).not.toHaveBeenCalled();
    expect(stored).not.toHaveBeenCalled();
    await checkLineLocations(tx, [{ location: "Safe A", source: "MANUAL" }], manual, stored);
    expect((tx as unknown as { location: { findMany: ReturnType<typeof vi.fn> } }).location.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true }, take: LOCATION_OPTIONS_LIMIT }));
  });
});
