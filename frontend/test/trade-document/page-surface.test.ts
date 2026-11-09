import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Transaction pages: gray page (#f9f9f9) with the header form and the item section on white cards (owner design 2026-11-09). */
const FORMS = [
  "src/features/quotation/components/QuotationForm.tsx",
  "src/features/memo-receive/components/MemoReceiveForm.tsx",
  "src/features/purchase-order/components/PurchaseOrderForm.tsx",
  "src/features/trade-document/document-form.tsx",
];
const CARD = "mx-6 rounded-gms-md bg-gms-surface";

describe("UT-TX-BG-01 transaction page surface", () => {
  it.each(FORMS)("%s uses the gray page and white cards, no divider", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain('relative flex h-full bg-gms-page"');
    expect(source).not.toContain('relative flex h-full bg-white"');
    expect(source).toContain(`<fieldset disabled={readOnly} className="${CARD}">`);
    expect(source).toContain(`className="${CARD} mt-4 mb-6 flex gap-4 px-6 py-6"`);
    expect(source).not.toContain('<hr className="border-[#E3E6EA]" />');
  });

  it("the page token is the design's body background", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/--color-gms-page:\s*#f9f9f9;/);
  });
});
