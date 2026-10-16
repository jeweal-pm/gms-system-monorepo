/**
 * Rich-text validation (company-profile SA-CP-03, ADR-0021): the editor's Tiptap/ProseMirror JSON is
 * accepted only for an allow-listed set of nodes and marks, with safe link protocols and bounded
 * size/depth. The result is normalized (unknown attributes dropped), so no HTML is ever stored.
 * Keep identical to `backend-api-partner/src/company-profile/rich-text.ts` (defence in depth: both validate).
 */

export const RICH_TEXT_LIMITS = { maxDepth: 8, maxNodes: 2_000, maxTextNodeLength: 10_000 } as const;

export type RichTextMark = { type: "bold" | "italic" | "strike" | "code" } | { type: "link"; attrs: { href: string } };
export type RichTextNode = {
  type: string;
  content?: RichTextNode[];
  text?: string;
  marks?: RichTextMark[];
  attrs?: Record<string, string | number>;
};
export type RichTextDoc = { type: "doc"; content: RichTextNode[] };

export type RichTextResult = { ok: true; value: RichTextDoc | null; textLength: number } | { ok: false; code: string };

const SAFE_HREF = /^(https?:\/\/\S+|mailto:[^\s@]+@[^\s@]+)$/i;
const BLOCKS = new Set(["paragraph", "bulletList", "orderedList", "codeBlock"]);
const INLINE = new Set(["text", "hardBreak"]);
const SIMPLE_MARKS = new Set(["bold", "italic", "strike", "code"]);
const NODE_KEYS = new Set(["type", "content", "text", "marks", "attrs"]);

/** Allowed children per node type. */
const CHILDREN: Record<string, ReadonlySet<string> | null> = {
  doc: BLOCKS,
  paragraph: INLINE,
  bulletList: new Set(["listItem"]),
  orderedList: new Set(["listItem"]),
  listItem: BLOCKS,
  codeBlock: new Set(["text"]),
  text: null,
  hardBreak: null,
};

class RichTextError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function parseMarks(value: unknown, insideCode: boolean): RichTextMark[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 5) throw new RichTextError("invalid_rich_text");
  if (insideCode && value.length > 0) throw new RichTextError("invalid_rich_text");
  const seen = new Set<string>();
  const marks: RichTextMark[] = [];
  for (const mark of value) {
    if (!isRecord(mark) || typeof mark.type !== "string" || seen.has(mark.type)) throw new RichTextError("invalid_rich_text");
    seen.add(mark.type);
    if (SIMPLE_MARKS.has(mark.type)) {
      marks.push({ type: mark.type as "bold" | "italic" | "strike" | "code" });
    } else if (mark.type === "link") {
      const href = isRecord(mark.attrs) ? mark.attrs.href : undefined;
      if (typeof href !== "string" || href.length > 2048 || !SAFE_HREF.test(href)) throw new RichTextError("unsafe_link");
      marks.push({ type: "link", attrs: { href } });
    } else {
      throw new RichTextError("invalid_rich_text");
    }
  }
  return marks.length > 0 ? marks : undefined;
}

function parseAttrs(type: string, value: unknown): Record<string, string | number> | undefined {
  if (value !== undefined && value !== null && !isRecord(value)) throw new RichTextError("invalid_rich_text");
  const attrs = isRecord(value) ? value : {};
  if (type === "orderedList" && attrs.start !== undefined && attrs.start !== null) {
    const start = attrs.start;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 1 || start > 10_000) throw new RichTextError("invalid_rich_text");
    return start === 1 ? undefined : { start };
  }
  if (type === "codeBlock" && typeof attrs.language === "string" && attrs.language !== "") {
    if (!/^[a-z0-9+#-]{1,32}$/i.test(attrs.language)) throw new RichTextError("invalid_rich_text");
    return { language: attrs.language };
  }
  return undefined;
}

/**
 * Parses editor JSON. `null` stays `null`; a document with no text and only empty paragraphs
 * becomes `null`. `textLength` counts the characters of all text nodes.
 */
export function parseRichText(input: unknown): RichTextResult {
  if (input === null) return { ok: true, value: null, textLength: 0 };
  let nodes = 0;
  let textLength = 0;

  function parseNode(value: unknown, depth: number, allowed: ReadonlySet<string>, insideCode: boolean): RichTextNode {
    if (depth > RICH_TEXT_LIMITS.maxDepth) throw new RichTextError("too_deep");
    nodes += 1;
    if (nodes > RICH_TEXT_LIMITS.maxNodes) throw new RichTextError("too_many_nodes");
    if (!isRecord(value) || typeof value.type !== "string" || !allowed.has(value.type)) throw new RichTextError("invalid_rich_text");
    for (const key of Object.keys(value)) if (!NODE_KEYS.has(key)) throw new RichTextError("invalid_rich_text");
    const type = value.type;

    if (type === "text") {
      const text = value.text;
      if (typeof text !== "string" || text.length === 0 || text.length > RICH_TEXT_LIMITS.maxTextNodeLength || value.content !== undefined) throw new RichTextError("invalid_rich_text");
      textLength += text.length;
      const marks = parseMarks(value.marks, insideCode);
      return marks ? { type, text, marks } : { type, text };
    }
    if (value.text !== undefined || value.marks !== undefined) throw new RichTextError("invalid_rich_text");
    if (type === "hardBreak") {
      if (value.content !== undefined) throw new RichTextError("invalid_rich_text");
      return { type };
    }

    const childTypes = CHILDREN[type];
    const rawContent = value.content;
    if (rawContent !== undefined && !Array.isArray(rawContent)) throw new RichTextError("invalid_rich_text");
    const content = (rawContent ?? []).map((child: unknown) => parseNode(child, depth + 1, childTypes ?? new Set(), insideCode || type === "codeBlock"));
    if ((type === "bulletList" || type === "orderedList" || type === "listItem") && content.length === 0) throw new RichTextError("invalid_rich_text");
    const attrs = parseAttrs(type, value.attrs);
    return { type, ...(attrs ? { attrs } : {}), ...(content.length > 0 ? { content } : {}) };
  }

  try {
    const doc = parseNode(input, 1, new Set(["doc"]), false);
    const content = doc.content ?? [];
    const empty = textLength === 0 && content.every((node) => node.type === "paragraph" && !node.content);
    return { ok: true, value: empty ? null : { type: "doc", content }, textLength };
  } catch (error) {
    if (error instanceof RichTextError) return { ok: false, code: error.code };
    throw error;
  }
}
