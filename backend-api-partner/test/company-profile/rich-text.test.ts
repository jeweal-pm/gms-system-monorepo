import { describe, expect, it } from "vitest";
import { parseRichText, RICH_TEXT_LIMITS } from "../../src/company-profile/rich-text";

/** UT-CP-P01…P14: rich-text allow-list and limits (SA-CP-03). */

const doc = (...content: unknown[]) => ({ type: "doc", content });
const text = (value: string, marks?: unknown[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const paragraph = (...content: unknown[]) => ({ type: "paragraph", ...(content.length > 0 ? { content } : {}) });

function nestedList(depth: number) {
  let node: unknown = paragraph(text("deep"));
  for (let level = 0; level < depth; level += 1) node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
  return doc(node);
}

describe("parseRichText", () => {
  it("UT-CP-P01 keeps null as an empty value", () => {
    expect(parseRichText(null)).toEqual({ ok: true, value: null, textLength: 0 });
  });

  it("UT-CP-P02 turns a document with only empty paragraphs into null", () => {
    expect(parseRichText(doc(paragraph(), paragraph()))).toEqual({ ok: true, value: null, textLength: 0 });
  });

  it("UT-CP-P03 accepts every allowed node and mark and counts the text", () => {
    const input = doc(
      paragraph(text("Bank ", [{ type: "bold" }]), text("name", [{ type: "italic" }, { type: "strike" }]), { type: "hardBreak" }, text("code", [{ type: "code" }])),
      { type: "bulletList", content: [{ type: "listItem", content: [paragraph(text("one"))] }] },
      { type: "orderedList", attrs: { start: 3, type: null }, content: [{ type: "listItem", content: [paragraph(text("two"))] }] },
      { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] },
      paragraph(text("site", [{ type: "link", attrs: { href: "https://example.com", target: "_blank", rel: "noopener" } }])),
    );
    const result = parseRichText(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.textLength).toBe("Bank ".length + "name".length + "code".length + "one".length + "two".length + "const a = 1;".length + "site".length);
    // Unknown attributes are dropped: only href stays on the link, start on the list, language on the code block.
    expect(result.value?.content[4]).toEqual(paragraph(text("site", [{ type: "link", attrs: { href: "https://example.com" } }])));
    expect(result.value?.content[2]).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(result.value?.content[3]).toMatchObject({ type: "codeBlock", attrs: { language: "ts" } });
  });

  it("UT-CP-P04 drops the default ordered-list start of 1", () => {
    const result = parseRichText(doc({ type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [paragraph(text("a"))] }] }));
    expect(result.ok && result.value?.content[0]).toEqual({ type: "orderedList", content: [{ type: "listItem", content: [paragraph(text("a"))] }] });
  });

  it("UT-CP-P05 stores script-like text as plain text", () => {
    const result = parseRichText(doc(paragraph(text("<script>alert(1)</script>"))));
    expect(result).toMatchObject({ ok: true, textLength: 25 });
  });

  it("UT-CP-P06 accepts mailto links", () => {
    expect(parseRichText(doc(paragraph(text("mail", [{ type: "link", attrs: { href: "mailto:a@example.com" } }])))).ok).toBe(true);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<b>x</b>"],
    ["relative", "/admin"],
    ["missing href", undefined],
  ])("UT-CP-P07 rejects a %s link", (_label, href) => {
    expect(parseRichText(doc(paragraph(text("x", [{ type: "link", attrs: { href } }]))))).toEqual({ ok: false, code: "unsafe_link" });
  });

  it.each([
    ["an unknown node", doc({ type: "image", attrs: { src: "x" } })],
    ["an unknown mark", doc(paragraph(text("x", [{ type: "underline" }])))],
    ["an unknown key on a node", doc({ type: "paragraph", style: "color:red" })],
    ["a duplicate mark", doc(paragraph(text("x", [{ type: "bold" }, { type: "bold" }])))],
    ["marks inside a code block", doc({ type: "codeBlock", content: [text("x", [{ type: "bold" }])] })],
    ["an empty list", doc({ type: "bulletList", content: [] })],
    ["an empty text node", doc(paragraph(text("")))],
    ["a list item at the top level", doc({ type: "listItem", content: [paragraph(text("x"))] })],
    ["a root that is not a doc", paragraph(text("x"))],
    ["an invalid ordered-list start", doc({ type: "orderedList", attrs: { start: 0 }, content: [{ type: "listItem", content: [paragraph(text("a"))] }] })],
    ["an invalid code language", doc({ type: "codeBlock", attrs: { language: "a b" }, content: [text("x")] })],
    ["a string", "<p>html</p>"],
  ])("UT-CP-P08 rejects %s", (_label, input) => {
    expect(parseRichText(input)).toEqual({ ok: false, code: "invalid_rich_text" });
  });

  it("UT-CP-P09 allows nesting up to the depth limit and rejects one level more", () => {
    // doc (1) + n × (list + item) + paragraph + text: 7 levels with n = 2 stays within 8.
    expect(parseRichText(nestedList(2)).ok).toBe(true);
    expect(parseRichText(nestedList(4))).toEqual({ ok: false, code: "too_deep" });
  });

  it("UT-CP-P10 rejects more nodes than the limit", () => {
    const many = doc(...Array.from({ length: RICH_TEXT_LIMITS.maxNodes }, () => paragraph()));
    expect(parseRichText(many)).toEqual({ ok: false, code: "too_many_nodes" });
  });

  it("UT-CP-P11 rejects a single text node over the per-node limit", () => {
    expect(parseRichText(doc(paragraph(text("a".repeat(RICH_TEXT_LIMITS.maxTextNodeLength + 1)))))).toEqual({ ok: false, code: "invalid_rich_text" });
  });
});
