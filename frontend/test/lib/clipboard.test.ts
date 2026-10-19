import { describe, expect, it, vi } from "vitest";
import { copyText } from "@/lib/clipboard";

/** UT-SM-10: copy button helper for the Stone Code field (owner 2026-10-19). */
describe("copyText", () => {
  it("writes the text and resolves true", async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };
    await expect(copyText("RUB1.0-RDDEX", clipboard)).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith("RUB1.0-RDDEX");
  });

  it("resolves false for empty text, no clipboard, or a refused write", async () => {
    const clipboard = { writeText: vi.fn(async () => undefined) };
    await expect(copyText("", clipboard)).resolves.toBe(false);
    expect(clipboard.writeText).not.toHaveBeenCalled();
    await expect(copyText("X", undefined)).resolves.toBe(false);
    await expect(copyText("X", { writeText: async () => { throw new Error("denied"); } })).resolves.toBe(false);
  });
});
