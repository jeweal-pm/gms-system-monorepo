import { describe, expect, it } from "vitest";
import { addressRemoval } from "@/features/partner/components/address-item";

/** Address card trash icon rule (owner 2026-10-19): any address except the default one and the last remaining one. */

const base = { isOnly: false, isDefault: false, readOnly: false, itemLabel: "Invoice address" };

describe("addressRemoval", () => {
  it("allows removing any non-default address while others remain, including #1", () => {
    expect(addressRemoval(base)).toEqual({ canRemove: true, hint: undefined });
  });

  it("blocks the default address with a hint", () => {
    expect(addressRemoval({ ...base, isDefault: true })).toEqual({ canRemove: false, hint: "The default invoice address cannot be removed" });
  });

  it("blocks the last remaining address (at least one is required)", () => {
    expect(addressRemoval({ ...base, isOnly: true })).toEqual({ canRemove: false, hint: "At least one invoice address is required" });
  });

  it("disables removal in read-only view without a hint", () => {
    expect(addressRemoval({ ...base, readOnly: true })).toEqual({ canRemove: false, hint: undefined });
  });
});
