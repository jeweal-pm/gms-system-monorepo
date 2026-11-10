import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/features/quotation/components/ui";

/** Document action buttons (Create New, Cancel, Save, Edit, Delete) are 36px high (owner design 2026-11-09). */
describe("UT-TX-BTN-01 button height 36px", () => {
  it("the transaction Button md is h-9; sm stays h-8", () => {
    expect(renderToStaticMarkup(createElement(Button, null, "Save"))).toContain("h-9 px-5");
    expect(renderToStaticMarkup(createElement(Button, { size: "sm" }, "Add"))).toContain("h-8 px-3");
  });

  it("the Create New link matches the buttons", () => {
    const source = readFileSync("src/features/quotation/components/header/QuotationHeader.tsx", "utf8");
    expect(source).toContain('className="inline-flex h-9 items-center gap-2 rounded-lg border');
    expect(source).not.toMatch(/inline-flex h-10 items-center gap-2 rounded-lg border/);
  });
});
