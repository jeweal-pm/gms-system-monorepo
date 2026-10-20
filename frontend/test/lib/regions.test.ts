import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { cityInState, cityKey, cityOptions, fetchRegionData, hasCities, parseCityKey, parseRegionFile, stateOptions, type RegionFile } from "@/lib/regions";

const data: RegionFile = {
  states: ["Bangkok", "Chiang Mai", "Phuket"],
  cities: [
    ["Bang Rak", 0],
    ["Mueang", 1],
    ["Mueang", 2],
    ["Pathum Wan", 0],
  ],
};

const response = (status: number, body: unknown = null) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

describe("parseRegionFile", () => {
  it("keeps well-formed rows and drops rows pointing outside the state list", () => {
    expect(parseRegionFile({ states: ["A"], cities: [["X", 0], ["Y", 1], ["Z", -1], [1, 0], "bad"] })).toEqual({ states: ["A"], cities: [["X", 0]] });
  });

  it("treats a malformed or empty file as no list", () => {
    expect(parseRegionFile(null)).toBeNull();
    expect(parseRegionFile({ states: [], cities: [] })).toBeNull();
    expect(parseRegionFile({ states: [1], cities: [] })).toBeNull();
    expect(parseRegionFile({ states: ["A"] })).toBeNull();
  });
});

describe("fetchRegionData", () => {
  it("loads /regions/<CC>.json for a valid country code", async () => {
    const fetcher = vi.fn(async () => response(200, data));
    await expect(fetchRegionData("TH", fetcher as unknown as typeof fetch)).resolves.toEqual(data);
    expect(fetcher).toHaveBeenCalledWith("/regions/TH.json");
  });

  it("never requests a path built from an invalid code", async () => {
    const fetcher = vi.fn();
    for (const code of ["", "th", "../x", "THA", "T/"]) await expect(fetchRegionData(code, fetcher as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns no list on 404 and throws on other failures (Retry)", async () => {
    await expect(fetchRegionData("AQ", (async () => response(404)) as unknown as typeof fetch)).resolves.toBeNull();
    await expect(fetchRegionData("TH", (async () => response(500)) as unknown as typeof fetch)).rejects.toThrow("HTTP 500");
  });
});

describe("state and city options", () => {
  it("lists the country's states and keeps a saved name that is not listed", () => {
    expect(stateOptions(data, "").map((option) => option.value)).toEqual(["Bangkok", "Chiang Mai", "Phuket"]);
    expect(stateOptions(data, "Old Name")[0]).toEqual({ value: "Old Name", label: "Old Name" });
  });

  it("lists every city with its state while no state is chosen; same-named cities stay distinct", () => {
    const options = cityOptions(data, "", "");
    expect(options.map((option) => option.label)).toEqual(["Bang Rak, Bangkok", "Mueang, Chiang Mai", "Mueang, Phuket", "Pathum Wan, Bangkok"]);
    expect(new Set(options.map((option) => option.value)).size).toBe(4);
  });

  it("narrows the cities to the chosen state", () => {
    expect(cityOptions(data, "Bangkok", "").map((option) => option.label)).toEqual(["Bang Rak", "Pathum Wan"]);
  });

  it("keeps a saved city that is not listed under its state", () => {
    expect(cityOptions(data, "Bangkok", "Silom")[0]).toEqual({ value: cityKey("Silom", "Bangkok"), label: "Silom" });
  });

  it("round-trips a city key to the city and its state", () => {
    expect(parseCityKey(cityKey("Mueang", "Phuket"))).toEqual({ city: "Mueang", state: "Phuket" });
    expect(parseCityKey("Plain")).toEqual({ city: "Plain", state: "" });
  });

  it("knows whether a state has cities and whether a city belongs to a state", () => {
    expect(hasCities(data, "")).toBe(true);
    expect(hasCities(data, "Phuket")).toBe(true);
    expect(hasCities(data, "Unlisted")).toBe(false);
    expect(cityInState(data, "Mueang", "Phuket")).toBe(true);
    expect(cityInState(data, "Bang Rak", "Phuket")).toBe(false);
  });
});

describe("generated region files", () => {
  const file = new URL("../../public/regions/TH.json", import.meta.url);
  it.runIf(existsSync(file))("Thailand lists Bangkok with its cities", () => {
    const parsed = parseRegionFile(JSON.parse(readFileSync(file, "utf8")));
    expect(parsed?.states).toContain("Bangkok");
    expect(hasCities(parsed!, "Bangkok")).toBe(true);
  });
});
