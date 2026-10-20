import { describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/clipboard";

/** UT-SM-10: copy button helper for the Stone Code field (owner 2026-10-19). */
describe("copyText", () => {
  it("writes the text and resolves true", async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };
    await expect(copyText("RUB1.0-RDDEX", clipboard)).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith("RUB1.0-RDDEX");
  });

  it("resolves false for empty text, or when the API and the legacy path both fail", async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };
    const legacy = vi.fn(() => false);
    await expect(copyText("", clipboard, legacy)).resolves.toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(legacy).not.toHaveBeenCalled();
    await expect(copyText("X", undefined, legacy)).resolves.toBe(false);
    await expect(copyText("X", { writeText: async () => { throw new Error("denied"); } }, legacy)).resolves.toBe(false);
  });

  it("falls back to the legacy copy on an insecure origin (no Clipboard API) or a refused write", async () => {
    const legacy = vi.fn(() => true);
    await expect(copyText("X", undefined, legacy)).resolves.toBe(true);
    await expect(copyText("Y", { writeText: async () => { throw new Error("denied"); } }, legacy)).resolves.toBe(true);
    expect(legacy.mock.calls).toEqual([["X"], ["Y"]]);
    expect(await copyText("Z", { writeText: async () => undefined }, legacy)).toBe(true);
    expect(legacy).toHaveBeenCalledTimes(2);
  });

  it("the default legacy path is a no-op without a DOM", async () => {
    await expect(copyText("X", undefined)).resolves.toBe(false);
  });
});
