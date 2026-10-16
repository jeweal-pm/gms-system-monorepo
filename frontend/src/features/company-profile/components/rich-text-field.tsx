"use client";

import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Code, Italic, Link2, List, ListOrdered, SquareCode, Strikethrough, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button, cx, focusRing } from "@/components/ui/button";

/** Links may only point to web pages or e-mail addresses (ui-spec, TC-CP-14). */
const SAFE_LINK = /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i;

type RichTextFieldProps = {
  id: string;
  /** Id of the visible label (the section title). */
  labelledBy: string;
  /** Editor JSON (SA-CP-03); null = empty. */
  value: JSONContent | null;
  onChange: (doc: JSONContent | null) => void;
  onBlur: () => void;
  placeholder: string;
  readOnly: boolean;
  error?: string;
};

/** Editor JSON, or null when the document is empty, so an untouched field stays null. */
function currentValue(editor: Editor): JSONContent | null {
  return editor.isEmpty ? null : editor.getJSON();
}

/** Structural comparison of two editor values (bounded: ≤ 2,000 nodes by the server schema). */
function sameValue(a: JSONContent | null, b: JSONContent | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type ToolbarButton = { id: string; label: string; icon: LucideIcon; isActive: (editor: Editor) => boolean; run: (editor: Editor) => void };

const toolbarGroups: ToolbarButton[][] = [
  [
    { id: "bold", label: "Bold", icon: Bold, isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
    { id: "italic", label: "Italic", icon: Italic, isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
    { id: "strike", label: "Strikethrough", icon: Strikethrough, isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  ],
  // Link is handled separately (it opens the URL row).
  [],
  [
    { id: "ordered", label: "Numbered list", icon: ListOrdered, isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { id: "bullet", label: "Bulleted list", icon: List, isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  ],
  [
    { id: "code", label: "Code", icon: Code, isActive: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
    { id: "codeBlock", label: "Code block", icon: SquareCode, isActive: (e) => e.isActive("codeBlock"), run: (e) => e.chain().focus().toggleCodeBlock().run() },
  ],
];

const toolButton = cx(
  "flex size-7 items-center justify-center rounded-gms-sm text-gms-text transition-colors hover:bg-gms-nav-active disabled:cursor-default disabled:text-gms-text-placeholder disabled:hover:bg-transparent",
  focusRing,
);

/** Content styles: Tailwind preflight removes list and code styling, so restore it inside the editor. */
const contentClass = [
  "min-h-[104px] px-3 py-3 text-sm leading-[22px] text-gms-text outline-none",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_a]:text-gms-primary [&_a]:underline",
  "[&_code]:rounded-gms-sm [&_code]:bg-gms-surface-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]",
  "[&_pre]:my-1 [&_pre]:rounded-gms-md [&_pre]:bg-gms-surface-sunken [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-gms-text-placeholder [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
].join(" ");

/**
 * CP-08 rich-text field (S2/S3; DEP-CP-01 Tiptap 3.31.4): toolbar Bold, Italic, Strikethrough │ Link │
 * Numbered, Bulleted │ Code, Code block; the active mark shows pressed. Headings, quotes, rules and
 * underline are disabled so the output stays within the planned sanitising allow-list. Read-only
 * keeps the toolbar visible but disabled (Q-CP-06). Client-only rendering (`immediatelyRender: false`).
 * The value is the editor JSON, validated again by the gateway and partner (SA-CP-03).
 */
export function RichTextField({ id, labelledBy, value, onChange, onBlur, placeholder, readOnly, error }: RichTextFieldProps) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  }, [onChange, onBlur]);

  const errorId = `${id}-error`;
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    content: value ?? "",
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        horizontalRule: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url, { defaultValidate }) => defaultValidate(url) && SAFE_LINK.test(url),
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelledBy,
        class: contentClass,
      },
    },
    onUpdate: ({ editor: instance }) => onChangeRef.current(currentValue(instance)),
    onBlur: () => onBlurRef.current(),
  });

  // Reflect form resets (Cancel, Discard, load) without echoing an update back to the form.
  useEffect(() => {
    if (editor && !sameValue(value, currentValue(editor))) editor.commands.setContent(value ?? "", { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Error state and read-only are announced on the editable element itself.
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    element.setAttribute("aria-invalid", error ? "true" : "false");
    if (error) element.setAttribute("aria-describedby", errorId);
    else element.removeAttribute("aria-describedby");
    element.setAttribute("aria-readonly", readOnly ? "true" : "false");
  }, [editor, error, errorId, readOnly]);

  const active = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const state: Record<string, boolean> = { link: instance?.isActive("link") ?? false };
      if (instance) for (const group of toolbarGroups) for (const button of group) state[button.id] = button.isActive(instance);
      return state;
    },
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInputId = `${id}-link`;
  const disabled = readOnly || !editor;

  function openLink() {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!SAFE_LINK.test(url)) {
      setLinkError("Enter a link starting with https://, http:// or mailto:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }

  return (
    <div>
      <div className={cx("overflow-hidden rounded-gms-md border", error ? "border-gms-danger" : "border-gms-border")}>
        <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap items-center gap-1 bg-gms-surface-muted px-2 py-1.5">
          {toolbarGroups.map((group, index) => (
            <Fragment key={index}>
              {index > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-gms-border" />}
              {index === 1 ? (
                <button
                  type="button"
                  aria-label="Link"
                  aria-pressed={active?.link ?? false}
                  aria-expanded={linkOpen}
                  aria-controls={linkOpen ? `${linkInputId}-row` : undefined}
                  disabled={disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => (linkOpen ? setLinkOpen(false) : openLink())}
                  className={cx(toolButton, active?.link && "bg-gms-nav-active")}
                >
                  <Link2 size={18} strokeWidth={1.75} aria-hidden />
                </button>
              ) : (
                group.map((button) => {
                  const Icon = button.icon;
                  const pressed = active?.[button.id] ?? false;
                  return (
                    <button
                      key={button.id}
                      type="button"
                      aria-label={button.label}
                      aria-pressed={pressed}
                      disabled={disabled}
                      // Keep the editor selection when the toolbar is clicked.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => editor && button.run(editor)}
                      className={cx(toolButton, pressed && "bg-gms-nav-active")}
                    >
                      <Icon size={18} strokeWidth={1.75} aria-hidden />
                    </button>
                  );
                })
              )}
            </Fragment>
          ))}
        </div>
        {linkOpen && !readOnly && (
          <div id={`${linkInputId}-row`} className="flex flex-wrap items-center gap-2 border-t border-gms-border bg-gms-surface px-3 py-2">
            <label htmlFor={linkInputId} className="text-[13px] text-gms-text-secondary">
              Link
            </label>
            <input
              id={linkInputId}
              type="url"
              value={linkUrl}
              autoFocus
              placeholder="https://"
              aria-invalid={linkError ? true : undefined}
              aria-describedby={linkError ? `${linkInputId}-error` : undefined}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setLinkOpen(false);
                  editor?.commands.focus();
                }
              }}
              className="h-8 min-w-0 flex-1 rounded-gms-sm border border-gms-border px-2 text-sm outline-none focus:border-gms-primary"
            />
            <Button variant="primary" className="h-8" onClick={applyLink}>
              Apply
            </Button>
            <Button className="h-8" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            {linkError && (
              <p id={`${linkInputId}-error`} className="w-full text-[13px] italic text-gms-danger">
                {linkError}
              </p>
            )}
          </div>
        )}
        <div className="resize-y overflow-auto bg-gms-surface">
          <EditorContent editor={editor} />
        </div>
      </div>
      {error && (
        <p id={errorId} className="mt-1 pl-4 text-[13px] italic leading-[18px] text-gms-danger">
          {error}
        </p>
      )}
    </div>
  );
}
