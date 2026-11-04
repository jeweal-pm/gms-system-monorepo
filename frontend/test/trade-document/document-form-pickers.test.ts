import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemToolButtons } from "@/features/trade-document/document-form";

/** UT-PU-01 (purchase FE-PU-001): the shared form's optional second item button. */

const noop = () => undefined;
const primary = { label: "Memo Stock", title: "Pick stones still out on memo", disabled: false, onClick: noop };
const render = (props: Parameters<typeof ItemToolButtons>[0]) => renderToStaticMarkup(createElement(ItemToolButtons, props));
const buttons = (html: string) => html.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? [];
const darkButtons = (html: string) => buttons(html).filter((b) => b.includes("bg-[#1C252E]"));

describe("UT-PU-01 item tool buttons", () => {
  it("without a second picker: one dark item button and the scan placeholder, as every existing page", () => {
    const html = render({ primary, readOnly: false });
    expect(darkButtons(html)).toHaveLength(1);
    expect(html).toContain('<span title="Pick stones still out on memo"><button type="button"');
    expect(html).toContain('aria-label="Scan to add"');
    expect(html).not.toContain("aria-describedby");
  });

  it("a second picker with a disabled reason: disabled, tooltip and aria-describedby text", () => {
    const html = render({ primary, readOnly: false, secondary: { label: "Purchase Order", hint: "Pick lines", disabledReason: "Purchase Order isn't available yet", onClick: noop } });
    const [first, second] = darkButtons(html);
    expect(darkButtons(html)).toHaveLength(2);
    expect(first).toContain("Memo Stock");
    expect(second).toContain("Purchase Order");
    expect(second).toContain('disabled=""');
    expect(html).toContain(`<span title="Purchase Order isn&#x27;t available yet">`);
    const describedBy = /aria-describedby="([^"]+)"/.exec(second ?? "")?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`<span id="${describedBy}" class="sr-only">Purchase Order isn&#x27;t available yet</span>`);
    // Order: first picker, second picker, scan.
    expect(html.indexOf("Memo Stock")).toBeLessThan(html.indexOf("Purchase Order"));
    expect(html.indexOf("Purchase Order")).toBeLessThan(html.indexOf("Scan to add"));
  });

  it("a second picker with its own dialog: enabled with its hint; read-only disables both", () => {
    const secondary = { label: "Purchase Order", hint: "Pick lines from a purchase order", onClick: noop };
    const html = render({ primary, readOnly: false, secondary });
    const second = darkButtons(html)[1] ?? "";
    expect(second).toContain("Purchase Order");
    expect(second).not.toContain('disabled=""');
    expect(html).toContain('<span title="Pick lines from a purchase order">');
    expect(html).not.toContain("aria-describedby");
    const readOnly = render({ primary: { ...primary, disabled: true }, readOnly: true, secondary });
    expect(darkButtons(readOnly).every((b) => b.includes('disabled=""'))).toBe(true);
  });

  it("only the purchase page configures a second picker (existing pages keep one button)", () => {
    const root = join(process.cwd(), "src");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(root);
    const users = files.filter((file) => /secondaryPicker:/.test(readFileSync(file, "utf8"))).map((file) => file.slice(root.length + 1).replaceAll("\\", "/"));
    expect(users).toEqual(["features/purchase/components/PurchasePage.tsx"]);
  });
});
