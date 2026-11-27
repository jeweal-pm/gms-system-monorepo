/**
 * Transaction table look (owner table guide 2026-11-27); the CSS lives in globals.css (`.gms-row`, `.gms-head`).
 * Header #E9EDED (neutral group 30%); rows white, 56px; states come from data attributes.
 */
export const TABLE_HEAD = "gms-head bg-[#E9EDED]";
export const TABLE_ROW = "gms-row border-b border-[#EEF0F2] bg-white";

/** Data attributes for a row's state: active (the row shown in the side panel), checkbox active, error. */
export function rowState(state: { active?: boolean; checked?: boolean; error?: boolean }) {
  return {
    "data-active": state.active ? "" : undefined,
    "data-checked": state.checked ? "" : undefined,
    "data-error": state.error ? "" : undefined,
  } as const;
}

/** Guide column groups: head 30%, sub-head 18%, cell 8%. */
export const COLUMN_TONE = {
  neutral: { head: "bg-[#E9EDED]", sub: "bg-[#F2F4F4]", body: "bg-[#FFFFFF]" },
  green: { head: "bg-[#C0E2CE]", sub: "bg-[#D9EEE1]", body: "bg-[#EEF7F2]" },
  red: { head: "bg-[#F4CBCE]", sub: "bg-[#F8E0E2]", body: "bg-[#FCF1F2]" },
  purple: { head: "bg-[#DDCEEE]", sub: "bg-[#EBE1F5]", body: "bg-[#F6F2FB]" },
  orange: { head: "bg-[#F6DCC0]", sub: "bg-[#F9EAD9]", body: "bg-[#FDF6EE]" },
  blue: { head: "bg-[#C5D7F4]", sub: "bg-[#DCE7F8]", body: "bg-[#F0F4FC]" },
  teal: { head: "bg-[#B7CDCF]", sub: "bg-[#D4E1E2]", body: "bg-[#ECF2F2]" },
} as const;
