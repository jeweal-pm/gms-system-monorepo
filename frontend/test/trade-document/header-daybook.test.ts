import { describe, expect, it } from "vitest";
import { exchangeRateLabel } from "@/features/quotation/lib/format";
import { daybookDot } from "@/features/trade-document/document-api";

describe("UT-DOC-H1 Exchange Rate label (INV-20261102-005)", () => {
  it("names the relation without a question mark", () => {
    expect(exchangeRateLabel("AED", "THB")).toBe("Exchange Rate (AED per 1 THB)");
    expect(exchangeRateLabel("AED", "AED")).toBe("Exchange Rate");
    expect(exchangeRateLabel(undefined, "THB")).toBe("Exchange Rate");
    expect(exchangeRateLabel("AED", "THB")).not.toContain("?");
  });
});

describe("UT-DOC-D1 daybook dot", () => {
  it("is green once approved and amber while pending, as on Memo Receive", () => {
    expect(daybookDot("APPROVED")).toEqual({ className: "bg-[#22C55E]", label: "Approved" });
    expect(daybookDot("PENDING_APPROVAL")).toEqual({ className: "bg-[#F5A524]", label: "Pending approval" });
  });
});
