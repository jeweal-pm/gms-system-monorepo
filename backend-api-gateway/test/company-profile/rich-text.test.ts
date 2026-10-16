import { describe, expect, it } from "vitest";
import { parseRichText } from "../../src/trpc/rich-text";

/**
 * UT-CP-G01…G05: the gateway copy of the rich-text allow-list must behave like partner's
 * (SA-CP-03, defence in depth). Full branch coverage lives in the partner suite.
 */

const doc = (...content: unknown[]) => ({ type: "doc", content });
const paragraph = (text: string, marks?: unknown[]) => ({ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] });

describe("gateway parseRichText", () => {
  it("UT-CP-G01 accepts allowed formatting and normalizes link attributes", () => {
    const result = parseRichText(doc(paragraph("x", [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com", target: "_blank" } }])));
    expect(result).toEqual({ ok: true, textLength: 1, value: doc(paragraph("x", [{ type: "bold" }, { type: "link", attrs: { href: "https://example.com" } }])) });
  });

  it("UT-CP-G02 rejects a javascript: link", () => {
    expect(parseRichText(doc(paragraph("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))).toEqual({ ok: false, code: "unsafe_link" });
  });

  it("UT-CP-G03 rejects an unknown node type", () => {
    expect(parseRichText(doc({ type: "image", attrs: { src: "x" } }))).toEqual({ ok: false, code: "invalid_rich_text" });
  });

  it("UT-CP-G04 treats an empty document as null", () => {
    expect(parseRichText(doc({ type: "paragraph" }))).toEqual({ ok: true, value: null, textLength: 0 });
  });

  it("UT-CP-G05 rejects deep nesting", () => {
    let node: unknown = paragraph("deep");
    for (let level = 0; level < 4; level += 1) node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
    expect(parseRichText(doc(node))).toEqual({ ok: false, code: "too_deep" });
  });
});
