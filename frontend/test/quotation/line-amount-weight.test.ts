import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** UT-ITEM-AMOUNT-01 (owner 2026-11-13): the line Amount is medium (500) in the item table and the return table. */
describe("line amount weight", () => {
  it("UT-ITEM-AMOUNT-01 both tables render the line amount with font-medium", () => {
    const itemTable = readFileSync("src/features/quotation/components/items/ItemTable.tsx", "utf8");
    expect(itemTable).toMatch(/<div data-line-amount className="font-medium">\s*\{formatMoney\(lineAmount\(line\), nf\.pricePlaces\)\} \{currency\}/);
    const returnTable = readFileSync("src/features/trade-document/return-item-table.tsx", "utf8");
    expect(returnTable).toContain('<td data-line-amount className="px-3 py-4 text-right font-medium">{filled ? formatMoney(lineAmount(line), nf.pricePlaces) : ""}</td>');
  });
});
