import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuotationHeader, statusChipText } from "@/features/quotation/components/header/QuotationHeader";
import { APPROVAL_STATUS_LABELS } from "@/features/trade-document/document-form";

/** UT-TX-HDR-01 (owner 2026-11-10): transaction number 24 px and a "Status: ● …" chip on every transaction page. */
const noop = () => undefined;
const header = (status?: Parameters<typeof QuotationHeader>[0]["status"], extra: Partial<Parameters<typeof QuotationHeader>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(QuotationHeader, {
      docNo: "QTGMS2609001",
      isPreview: !status,
      status,
      mode: "view",
      saving: false,
      canSave: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop },
      ...extra,
    }),
  );

describe("transaction header", () => {
  it("the number is 24 px, #1C252E", () => {
    expect(header()).toContain('<h1 class="text-[24px] leading-8 font-semibold text-[#1C252E]">QTGMS2609001</h1>');
  });

  it("a new document shows Status: Draft", () => {
    const html = header();
    expect(html).toContain('data-status="DRAFT"');
    expect(html).toMatch(/Status:<span aria-hidden="true" class="size-2.5 rounded-full bg-\[#ADB1B4\]"><\/span>Draft<\/span>/);
  });

  it("every status has its label and dot; a page's statusLabels can rename it", () => {
    expect(statusChipText("PENDING_APPROVAL", APPROVAL_STATUS_LABELS)).toEqual({ label: "Pending Approval", dot: "bg-[#FFAB00]" });
    expect(statusChipText("APPROVED", {})).toEqual({ label: "Approved", dot: "bg-[#22C55E]" });
    expect(statusChipText("REJECTED", {})).toEqual({ label: "Rejected", dot: "bg-[#DF1016]" });
    expect(statusChipText("CANCELLED", {})).toEqual({ label: "Cancelled", dot: "bg-[#6B7480]" });
    expect(statusChipText("DRAFT", { DRAFT: { label: "Open", tone: "" } }).label).toBe("Open");
    expect(header("APPROVED")).toContain('data-status="APPROVED"');
  });
});
