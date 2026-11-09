import { describe, expect, it } from "vitest";
import { PURCHASE_ORDER_KIND } from "@/features/purchase-order/defaults";
import { emptyPurchaseOrder } from "@/features/purchase-order/defaults";
import { purchaseOrderSchema } from "@/features/purchase-order/schema";
import { QUOTATION_KIND } from "@/features/quotation/document-kind";
import { emptyLine } from "@/features/quotation/lib/defaults";
import { isFilledLine, STONE_REQUIRED_MESSAGE } from "@/features/quotation/schema";
import { invalidSaveMessage, lineErrorMessages, type LineErrors } from "@/features/trade-document/document-form";

/** INV-20261107-004 / 006 (owner 2026-11-09): typed rows without a stone, and the Purchase Order price label. */

const header = { ...emptyPurchaseOrder(), docDate: "2026-11-09", dueDate: "2026-12-09", vendorId: "v", addressId: "a", currency: "AED" };

describe("INV-20261107-004 a typed row without a stone", () => {
  it("counts as filled once anything is typed; an untouched row stays empty", () => {
    expect(isFilledLine(emptyLine())).toBe(false);
    for (const patch of [{ lot: "NO-STONE-LOT" }, { pcs: "2" }, { weightCt: "0.5" }, { unitPrice: "100" }, { itemNote: "x" }, { cerNo: "C-1" }]) {
      expect(isFilledLine({ ...emptyLine(), ...patch })).toBe(true);
    }
  });

  it("Save names the row and asks for the stone instead of dropping it", () => {
    const row = { ...emptyLine(), lot: "NO-STONE-LOT", pcs: "2", weightCt: "0.5", unitPrice: "100" };
    const result = purchaseOrderSchema.safeParse({ ...header, lines: [row] });
    expect(result.success).toBe(false);
    const issues = result.error!.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    expect(issues).toEqual(["lines.0.stone: Choose the stone"]);
    expect(STONE_REQUIRED_MESSAGE).toBe("Choose the stone");
    const lineErrors = [{ stone: { message: "Choose the stone" } }] as unknown as LineErrors;
    expect(invalidSaveMessage(lineErrorMessages(lineErrors, 1))).toBe("Row 1: Choose the stone");
    expect(purchaseOrderSchema.safeParse({ ...header, lines: [{ ...row, stone: "Ruby" }] }).success).toBe(true);
    expect(purchaseOrderSchema.safeParse({ ...header, lines: [{ ...row, stoneCode: "RU-1" }] }).success).toBe(true);
  });
});

describe("INV-20261107-006 Purchase Order price label", () => {
  it("reads Price on Purchase Order; Quotation keeps its own", () => {
    expect(PURCHASE_ORDER_KIND.priceTitle).toBe("Price");
    expect(QUOTATION_KIND.priceTitle).not.toBe("Price");
  });
});
