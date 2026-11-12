import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuotationHeader } from "@/features/quotation/components/header/QuotationHeader";
import { daybookDot, daybookState, DocumentDaybook, mapDocumentSaveError } from "@/features/trade-document/document-api";
import {
  APPROVAL_DOCUMENTS,
  daybookNote,
  flowActions,
  flowDot,
  flowOf,
  flowStatusNote,
  FLOW_STATUS_LABELS,
  isChangeableStatus,
  mapFlowError,
  restoreStatusLabel,
  savedMessage,
  sendToApproveConfirm,
  sentMessage,
  type DocFlow,
} from "@/features/trade-document/flow-status";
import { readDomainError } from "@/lib/trpc-error";

vi.mock("next/link", async () => {
  const { createElement: h } = await import("react");
  return { default: ({ href, children, ...rest }: { href: string; children: unknown }) => h("a", { href, ...rest }, children as never) };
});

/**
 * approval-setup FE-AS-010 / FE-AS-012 (ADR-0048) unit cases UT-AS-F01…F10: the shared document flow rules
 * (`flow-status.ts`), the header's status text, the Daybook dots / reason and `readDomainError().details`.
 */

const flow = (patch: Partial<DocFlow> = {}): DocFlow => ({ status: "DRAFT", autoApproved: false, revisionCount: 0, canEdit: true, canDelete: true, canSubmit: true, usedBy: null, review: null, ...patch });
const ALL = { add: true, edit: true, delete: true };
const idle = { deleted: false, editing: false, dirty: false };
const domainError = (domainCode: string, details?: Record<string, unknown>, status = 409) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: status, domainCode, ...(details ? { details } : {}) } } } as never);
const noop = () => undefined;
const header = (props: Partial<Parameters<typeof QuotationHeader>[0]> = {}) =>
  renderToStaticMarkup(createElement(QuotationHeader, { docNo: "RS-1", isPreview: false, mode: "view", saving: false, canSave: true, canCreate: true, canEdit: true, canDelete: true, actions: { onCancel: noop, onSave: noop, onEdit: noop, onDelete: noop, onDuplicate: noop, onRefresh: noop }, ...props }));

describe("UT-AS-F01 buttons per Flow and setting (FE-AS-010)", () => {
  it("approval ON: a Draft offers Edit, Delete and Send to approve (ADD or EDIT); not while editing or dirty", () => {
    expect(flowActions({ flow: flow(), requireApproval: true, access: ALL, ...idle })).toEqual({ showEditDelete: true, canEdit: true, canDelete: true, showSend: true, canSend: true });
    expect(flowActions({ flow: flow(), requireApproval: true, access: { add: true, edit: false, delete: false }, ...idle })).toMatchObject({ canEdit: false, canDelete: false, showSend: true, canSend: true });
    expect(flowActions({ flow: flow(), requireApproval: true, access: { add: false, edit: false, delete: false }, ...idle }).showSend).toBe(false);
    expect(flowActions({ flow: flow(), requireApproval: true, access: ALL, ...idle, editing: true }).canSend).toBe(false);
    expect(flowActions({ flow: flow(), requireApproval: true, access: ALL, ...idle, dirty: true }).canSend).toBe(false);
  });

  it("Revise is editable and can be sent again; Pending / Rejected / reviewed Approved hide Edit / Delete and Send", () => {
    expect(flowActions({ flow: flow({ status: "REVISION_REQUESTED", revisionCount: 1 }), requireApproval: true, access: ALL, ...idle })).toMatchObject({ showEditDelete: true, showSend: true });
    for (const status of ["PENDING_APPROVAL", "REJECTED"]) {
      expect(flowActions({ flow: flow({ status, canEdit: false, canDelete: false, canSubmit: false }), requireApproval: true, access: ALL, ...idle })).toEqual({ showEditDelete: false, canEdit: false, canDelete: false, showSend: false, canSend: false });
    }
    expect(flowActions({ flow: flow({ status: "APPROVED", autoApproved: false, canEdit: false, canDelete: false }), requireApproval: true, access: ALL, ...idle }).showEditDelete).toBe(false);
  });

  it("approval OFF: no Send to approve; an auto-approved document is editable until used", () => {
    expect(flowActions({ flow: flow(), requireApproval: false, access: ALL, ...idle }).showSend).toBe(false);
    expect(flowActions({ flow: flow({ status: "APPROVED", autoApproved: true }), requireApproval: false, access: ALL, ...idle })).toEqual({ showEditDelete: true, canEdit: true, canDelete: true, showSend: false, canSend: false });
    expect(flowActions({ flow: flow({ status: "APPROVED", autoApproved: true, canEdit: false, canDelete: false, usedBy: { docNo: "MOR-1" } }), requireApproval: false, access: ALL, ...idle }).showEditDelete).toBe(false);
    expect(isChangeableStatus({ status: "APPROVED", autoApproved: true, usedBy: null })).toBe(true);
    expect(isChangeableStatus({ status: "APPROVED", autoApproved: false, usedBy: null })).toBe(false);
  });

  it("the server flags win over the grant; an unknown setting follows the server's canSubmit; a new document has no flow", () => {
    expect(flowActions({ flow: flow({ canEdit: false }), requireApproval: true, access: ALL, ...idle }).canEdit).toBe(false);
    expect(flowActions({ flow: flow({ canSubmit: true }), requireApproval: undefined, access: ALL, ...idle }).showSend).toBe(true);
    expect(flowActions({ flow: flow({ canSubmit: false }), requireApproval: undefined, access: ALL, ...idle }).showSend).toBe(false);
    expect(flowActions({ flow: null, requireApproval: true, access: ALL, ...idle })).toEqual({ showEditDelete: true, canEdit: false, canDelete: false, showSend: false, canSend: false });
  });

  it("flowOf picks only the Flow block of a get result", () => {
    const detail = { ...flow({ status: "PENDING_APPROVAL" }), docNo: "RS-1", lines: [] } as DocFlow;
    expect(flowOf(detail)).toEqual(flow({ status: "PENDING_APPROVAL" }));
  });
});

describe("UT-AS-F02 status badges and read-only text", () => {
  it("labels every status (Draft grey, Pending / Revise orange, Approved green, Rejected red)", () => {
    expect(FLOW_STATUS_LABELS.DRAFT).toEqual({ label: "Draft", tone: "bg-[#EEF0F2] text-[#4B5563]" });
    expect(FLOW_STATUS_LABELS.PENDING_APPROVAL?.label).toBe("Pending Approval");
    expect(FLOW_STATUS_LABELS.REVISION_REQUESTED?.label).toBe("Revise");
    expect(FLOW_STATUS_LABELS.APPROVED?.tone).toContain("#15803D");
    expect(FLOW_STATUS_LABELS.REJECTED?.tone).toContain("#B42318");
  });

  it("says why a document is read-only and shows the revise / reject reason", () => {
    const review = (action: "REVISE" | "REJECT", note: string) => ({ action, note, at: "2026-11-11T03:00:00.000Z", byName: "Boss" });
    expect(flowStatusNote(flow())).toBeNull();
    expect(flowStatusNote(flow({ status: "PENDING_APPROVAL" }))).toEqual({ text: "Waiting for approval · Read-only until it is approved, sent back or rejected", tone: "muted" });
    expect(flowStatusNote(flow({ status: "REVISION_REQUESTED", review: review("REVISE", "Fix the price") }))).toEqual({ text: "Revise: Fix the price", tone: "warning" });
    expect(flowStatusNote(flow({ status: "REJECTED", review: review("REJECT", "Wrong customer") }))).toEqual({ text: "Reason: Wrong customer · Read-only", tone: "danger" });
    expect(flowStatusNote(flow({ status: "APPROVED", autoApproved: true, usedBy: { docNo: "MOR-1 (deleted)" } }))).toEqual({ text: "Used in MOR-1 (deleted) · Read-only", tone: "muted" });
    expect(flowStatusNote(flow({ status: "APPROVED", autoApproved: true }))).toBeNull();
    expect(flowStatusNote(flow({ status: "APPROVED", autoApproved: false }))?.text).toBe("Approved · Read-only");
    expect(flowStatusNote(null)).toBeNull();
  });

  it("the shared header shows the note under the badge and the Send to approve button in place of Approve", () => {
    const markup = header({ status: "REVISION_REQUESTED", statusLabels: FLOW_STATUS_LABELS, statusNote: { text: "Revise: Fix the price", tone: "warning" }, extraActions: createElement("button", null, "Send to approve") });
    expect(markup).toContain(">Revise<");
    expect(markup).toContain('<p class="mt-1 max-w-xl text-xs break-words text-[#B45309]">Revise: Fix the price</p>');
    expect(markup).toContain("Send to approve");
    expect(markup).not.toContain("> Approve<");
    // A note replaces the old Quotation reason line; without one the reason still shows (Cancelled).
    expect(header({ status: "CANCELLED", statusReason: "Customer left" })).toContain("Reason: Customer left");
  });
});

describe("UT-AS-F03 messages", () => {
  it("Save toasts follow the saved status (OFF Save says it took effect at once)", () => {
    expect(savedMessage("QT-1", { status: "APPROVED", autoApproved: true })).toBe("QT-1 saved and approved (approval is off).");
    expect(savedMessage("RS-1", { status: "DRAFT", autoApproved: false })).toBe("Saved RS-1 as Draft");
    expect(savedMessage(undefined, { status: "DRAFT" })).toBe("Saved as Draft");
    expect(savedMessage("RS-1", { status: "REVISION_REQUESTED" })).toBe("Saved RS-1");
    expect(savedMessage("RS-1", undefined)).toBe("Saved RS-1");
    expect(sentMessage("RS-1")).toBe("Sent RS-1 to approve");
  });

  it("Send to approve asks first; Restore goes back to Draft (ON) or Approved (OFF)", () => {
    expect(sendToApproveConfirm("RS-1")).toEqual({
      title: "Send RS-1 to approve?",
      body: "It can't be edited or deleted until it is approved, sent back for revision or rejected in the Approve menu.",
      cancelLabel: "Cancel",
      confirmLabel: "Send to approve",
      confirmVariant: "primary",
    });
    expect(restoreStatusLabel(true)).toBe("Draft");
    expect(restoreStatusLabel(false)).toBe("Approved");
  });
});

describe("UT-AS-F04 new error codes (error-handling.md)", () => {
  it("maps every ADR-0048 code of each document type; other codes are left to the page", () => {
    for (const [type, { code, menu }] of Object.entries(APPROVAL_DOCUMENTS) as [keyof typeof APPROVAL_DOCUMENTS, { code: string; menu: string }][]) {
      expect(mapFlowError(domainError(`${code}_APPROVAL_OFF`), type, "X-1", "submit")).toEqual({ message: `Approval is now off for ${menu}. Save to approve it.`, refetch: true, settingChanged: true });
      expect(mapFlowError(domainError(`${code}_IN_USE`, { usedBy: "MOR-7" }), type, "X-1", "save")).toEqual({ message: "X-1 can't be changed: its items are used in MOR-7.", refetch: true, settingChanged: false });
      expect(mapFlowError(domainError(`${code}_STATUS_INVALID`), type, "X-1", "delete")?.message).toBe("X-1 can't be changed in its current status.");
      expect(mapFlowError(domainError(`${code}_STATUS_INVALID`), type, "X-1", "submit")?.message).toBe("X-1 can't be sent to approve in its current status.");
      expect(mapFlowError(domainError(`${code}_REVISE_LIMIT`), type, "X-1", "submit")?.message).toBe("X-1 was already sent back once. Approve or reject it.");
      expect(mapFlowError(domainError(`${code}_CHANGED`), type, "X-1", "save")).toBeNull();
    }
    // `_IN_USE` without usedBy (race, G9) and without a number.
    expect(mapFlowError(domainError("RESERVE_IN_USE"), "reserve", undefined, "delete")?.message).toBe("This Reserve can't be changed: its items are used in another document.");
    expect(mapFlowError(domainError("PERMISSION_DENIED", undefined, 403), "reserve", "RS-1", "save")).toBeNull();
    expect(mapFlowError(new Error("x"), "reserve", "RS-1", "save")).toBeNull();
  });

  it("readDomainError carries the envelope details (G5) and nothing else", () => {
    expect(readDomainError(domainError("RESERVE_IN_USE", { usedBy: "MO-1" })).details).toEqual({ usedBy: "MO-1" });
    expect(readDomainError(domainError("RESERVE_CHANGED")).details).toBeNull();
    expect(readDomainError(domainError("X", ["a"] as never)).details).toBeNull();
    expect(readDomainError("nope").details).toBeNull();
  });

  it("the pages' own mapping still handles the other codes (stale version)", () => {
    expect(mapDocumentSaveError(domainError("RESERVE_CHANGED"), "RESERVE", "reserve", []).message).toBe("Someone else changed this reserve. Refresh to see the latest.");
  });
});

describe("UT-AS-F05 Daybook dots and reasons (FE-AS-012, ADR-0048 D6)", () => {
  it("Draft grey, Pending / Revise orange, Approved green, Rejected red; approval OFF shows Drafts green", () => {
    expect(flowDot("DRAFT")).toEqual({ className: "bg-[#A9B1B9]", label: "Draft" });
    expect(flowDot("PENDING_APPROVAL")).toEqual({ className: "bg-[#F5A524]", label: "Pending approval" });
    expect(flowDot("REVISION_REQUESTED")).toEqual({ className: "bg-[#F5A524]", label: "Revise" });
    expect(flowDot("APPROVED")).toEqual({ className: "bg-[#22C55E]", label: "Approved" });
    expect(flowDot("REJECTED")).toEqual({ className: "bg-[#E5484D]", label: "Rejected" });
    expect(flowDot("DRAFT", false)).toEqual({ className: "bg-[#22C55E]", label: "Approved" });
    expect(flowDot("REJECTED", false).label).toBe("Rejected");
    expect(daybookDot("DRAFT", true).label).toBe("Draft");
  });

  it("the reason shows under the party only for Revise and Reject", () => {
    const review = { action: "REVISE" as const, note: "Fix it", at: "", byName: null };
    expect(daybookNote({ status: "REVISION_REQUESTED", review })).toBe("Fix it");
    expect(daybookNote({ status: "REJECTED", review: { ...review, action: "REJECT", note: "No" } })).toBe("No");
    expect(daybookNote({ status: "PENDING_APPROVAL", review })).toBeUndefined();
    expect(daybookNote({ status: "APPROVED" })).toBeUndefined();
  });

  it("renders one row per document with its dot and reason", () => {
    const rows = [
      { id: "1", docNo: "RS-3", docDate: "2026-11-12", status: "REVISION_REQUESTED", customerName: "Aom", review: { action: "REVISE" as const, note: "Check weight", at: "", byName: null } },
      { id: "2", docNo: "RS-2", docDate: "2026-11-11", status: "REJECTED", customerName: "Ben", review: { action: "REJECT" as const, note: "Duplicate", at: "", byName: null } },
      { id: "3", docNo: "RS-1", docDate: "2026-11-10", status: "DRAFT", customerName: "Cat", review: null },
    ];
    const state = daybookState({ isPending: false, isError: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: noop, data: { pages: [{ items: rows }] } }, () => "x", (item) => item.customerName);
    expect(state.items.map((item) => item.note)).toEqual(["Check weight", "Duplicate", undefined]);
    const on = renderToStaticMarkup(createElement(DocumentDaybook, { plural: "reserves", href: (id) => `/r/${id}`, state, requireApproval: true }));
    expect(on).toContain('title="Revise"');
    expect(on).toContain('title="Rejected"');
    expect(on).toContain('title="Draft"');
    expect(on).toContain('text-[#B45309]">Check weight<');
    expect(on).toContain('text-[#B42318]">Duplicate<');
    const off = renderToStaticMarkup(createElement(DocumentDaybook, { plural: "reserves", href: (id) => `/r/${id}`, state, requireApproval: false }));
    expect(off).not.toContain('title="Draft"');
  });
});
