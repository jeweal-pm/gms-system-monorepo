import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingRow } from "@/features/approval-setup/components/ApprovalSetupPage";
import {
  blockedText,
  documentsLabel,
  helperText,
  isNotAvailable,
  rowLocked,
  settingOf,
  SETUP_ROWS,
  statusChain,
  switchedToast,
  turnOffDecision,
  turnOffText,
  turnOnText,
  updateFailure,
  waitingCell,
  type ApprovalSettingItem,
} from "@/features/approval-setup/model";
import { approveMenuFor, type ApproveMenu } from "@/features/approve-center/menus";
import { SETUP_MENU_KEYS } from "@/features/home/navigation";
import { setupLandingTiles } from "@/features/setup/setup-destinations";

/** approval-setup UI rev 1: phase 1 (FE-AS-001…006) and phase 2 (FE-AS-008 persisted settings, FE-AS-011 permissions). */
const menu = (slug: string) => approveMenuFor(slug) as ApproveMenu;
const noop = () => undefined;
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const settingItem = (type: string, patch: Partial<ApprovalSettingItem> = {}): ApprovalSettingItem => ({
  type,
  requireApproval: true,
  available: true,
  version: 1,
  updatedAt: "2026-11-10T00:00:00.000Z",
  updatedByName: null,
  waiting: 0,
  ...patch,
});
const row = (slug: string, props: Partial<Parameters<typeof SettingRow>[0]> = {}) =>
  html(
    createElement(
      "table",
      null,
      createElement("tbody", null, createElement(SettingRow, { menu: menu(slug), setting: settingItem(menu(slug).type), canEdit: true, canOpenApprove: true, saving: false, onToggle: noop, ...props })),
    ),
  );
const domainError = (domainCode: string, details?: Record<string, number>) =>
  TRPCClientError.from({ error: { message: domainCode, code: -32000, data: { code: "CONFLICT", httpStatus: 409, domainCode, details } } } as never);

describe("UT-AS-01 rows", () => {
  it("11 rows in sidebar order with the Memo rows (owner answer 2); the three inventory rows are not available", () => {
    expect(SETUP_ROWS.map((entry) => entry.label)).toEqual([
      "Quotation", "Reserve", "Memo Receive", "Memo Return", "Memo Out", "Memo Out Return",
      "Purchase Order (PO)", "Purchase", "Load to Stock", "Merge/Split Stock", "Transfer Location",
    ]);
    expect(SETUP_ROWS.filter(isNotAvailable).map((entry) => entry.slug)).toEqual(["load-to-stock", "merge-split", "transfer-location"]);
  });

  it("FE-AS-008: each row reads its server item by the setting key; unavailable or loading rows are locked", () => {
    const items = [settingItem("reserve"), settingItem("stock-transfer-location", { available: false }), settingItem("quotation", { available: false })];
    expect(settingOf(items, "reserve")?.type).toBe("reserve");
    expect(rowLocked(menu("reserve"), settingOf(items, "reserve"))).toBeNull();
    expect(rowLocked(menu("transfer-location"), settingOf(items, "stock-transfer-location"))).toBe("not-available");
    expect(rowLocked(menu("quotation"), settingOf(items, "quotation"))).toBe("not-available");
    expect(rowLocked(menu("purchase"), undefined)).toBe("loading");
  });
});

describe("UT-AS-02 status chain and helper text", () => {
  it("starts with a Save step chip, not Draft (Q-AS-01, owner 2026-11-09)", () => {
    expect(statusChain(false).map((step) => step.map((chip) => chip.label))).toEqual([["Save"], ["Approved"]]);
    expect(statusChain(true).map((step) => step.map((chip) => chip.label))).toEqual([["Save"], ["Pending approval"], ["Approved", "Revise", "Rejected"]]);
  });

  it("On: a pending document can't be edited (Q-AS-02, owner 2026-11-09); Off: Quotation editable, others read-only (Q-AS-03)", () => {
    expect(helperText(menu("reserve"), true)).toBe("Waits in the Approve menu and can't be edited until the approver decides.");
    expect(helperText(menu("quotation"), false)).toBe("Approved automatically on Save. Can still be edited later.");
    expect(helperText(menu("purchase"), false)).toBe("Approved automatically on Save and takes effect at once. Can't be edited afterwards.");
  });
});

describe("UT-AS-04 waiting cell (FE-AS-008: `waiting` from approvalSetting.list)", () => {
  it("pluralises, shows 100+ at the cap, '—' when the count is not returned", () => {
    expect(documentsLabel(1)).toBe("1 document");
    expect(documentsLabel(2)).toBe("2 documents");
    expect(documentsLabel(100)).toBe("100+ documents");
    expect(waitingCell(null)).toEqual({ kind: "none-applicable" });
    expect(waitingCell(undefined)).toEqual({ kind: "none-applicable" });
    expect(waitingCell(0)).toEqual({ kind: "zero" });
    expect(waitingCell(1)).toEqual({ kind: "count", total: 1, text: "1 document" });
  });

  it("the page shares the document pages' approvalSetting.list query (same options) and never polls or stores settings", () => {
    const source = readFileSync("src/features/approval-setup/components/ApprovalSetupPage.tsx", "utf8");
    expect(source).toContain("masterTrpc.approvalSetting.list.useQuery(undefined, APPROVAL_SETTING_QUERY)");
    expect(source).not.toMatch(/refetchInterval|localStorage|sessionStorage|\.list\.query\(COUNT_INPUT/);
  });
});

describe("UT-AS-07 turning off (owner answer 3, ADR-0050 D5)", () => {
  it("blocks at once while the loaded count shows waiting documents; otherwise confirms and the server decides", () => {
    expect(turnOffDecision(2)).toBe("blocked");
    expect(turnOffDecision(0)).toBe("confirm");
    expect(turnOffDecision(null)).toBe("confirm");
  });

  it("blocking dialog: source 03 layout with the Q-AS-12 wording (Revise included), singular and plural", () => {
    expect(blockedText(menu("reserve"), 2)).toEqual({
      title: "Can't turn off approval yet",
      lead: "2 Reserve documents are still waiting for approval or sent back for revision.",
      body: "Finish them in the Approve menu (or have them sent again or deleted) first, then turn approval off.",
      confirmLabel: "Go to Approve",
      cancelLabel: "Close",
    });
    expect(blockedText(menu("reserve"), 1).lead).toBe("1 Reserve document is still waiting for approval or sent back for revision.");
  });

  it("confirm texts; the toast no longer says 'Not saved yet' (FE-AS-008)", () => {
    expect(turnOnText(menu("quotation")).title).toBe("Turn on approval for Quotation?");
    expect(turnOffText(menu("quotation")).body).toBe("From now on, saving a Quotation approves it at once. Documents already saved don't change.");
    expect(turnOffText(menu("memo-out")).body).toContain("its stock changes happen on Save");
    expect(switchedToast(menu("reserve"), false)).toBe("Approval turned off for Reserve.");
    const page = readFileSync("src/features/approval-setup/components/ApprovalSetupPage.tsx", "utf8");
    expect(page).not.toMatch(/Preview only|PREVIEW_NOTICE|Not saved yet/);
  });

  it("update errors: HAS_WAITING → blocked with pending + revision; CHANGED / VALIDATION / PERMISSION → toast + refetch; others keep the value", () => {
    expect(updateFailure(domainError("APPROVAL_SETTING_HAS_WAITING", { pending: 2, revision: 1 }), menu("reserve"), true)).toEqual({ kind: "blocked", total: 3 });
    expect(updateFailure(domainError("APPROVAL_SETTING_CHANGED"), menu("reserve"), true)).toEqual({ kind: "toast", message: "Approval for Reserve was changed by someone else.", refetchSettings: true, refetchAccess: false });
    expect(updateFailure(domainError("VALIDATION_ERROR"), menu("merge-split"), true)).toMatchObject({ message: "Approval for Merge/Split Stock is not available yet.", refetchSettings: true });
    expect(updateFailure(domainError("PERMISSION_DENIED"), menu("reserve"), true)).toMatchObject({ message: "You don't have permission to change approval settings.", refetchAccess: true });
    expect(updateFailure(new Error("offline"), menu("purchase"), false)).toMatchObject({ message: "Couldn't save. Approval for Purchase is still off.", refetchSettings: false });
  });
});

describe("UT-AS-09 row render", () => {
  it("an On row shows the chain, the waiting link to Approve and an enabled switch", () => {
    const markup = row("reserve", { setting: settingItem("reserve", { waiting: 2 }) });
    expect(markup).toContain(">Pending approval<");
    expect(markup).toContain('href="/approve/reserve"');
    expect(markup).toContain("2 documents");
    expect(markup).toContain('aria-checked="true"');
    expect(markup).not.toContain('aria-disabled="true"');
    expect(markup).not.toContain('aria-readonly="true"');
  });

  it("without APPROVE the count is plain text; an Off row shows — and no link; no VIEW count (null) shows —", () => {
    expect(row("reserve", { setting: settingItem("reserve", { waiting: 1 }), canOpenApprove: false })).not.toContain("href=");
    const off = row("quotation", { setting: settingItem("quotation", { requireApproval: false, waiting: 3 }) });
    expect(off).toContain('aria-label="Not applicable"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain(">Off<");
    expect(row("reserve", { setting: settingItem("reserve", { waiting: null }) })).toContain('aria-label="Not applicable"');
  });

  it("not-available rows: switch disabled with \"Not available yet\" (Q-AS-04, G6)", () => {
    const markup = row("load-to-stock", { setting: settingItem("load-to-stock", { available: false }) });
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("Not available yet");
  });

  it("FE-AS-011: VIEW without EDIT shows read-only switches", () => {
    const markup = row("reserve", { canEdit: false });
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("while its update runs the switch is busy and blocked (not optimistic); a loading row shows skeletons", () => {
    const markup = row("reserve", { saving: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Saving"');
    expect(markup).toContain('aria-disabled="true"');
    expect(row("reserve", { setting: undefined })).toContain('aria-label="Loading"');
  });
});

describe("UT-AS-13 permission leaf (FE-AS-011)", () => {
  it("approval-setup is a Setup leaf after document-setup, so Setup shows for an approval-setup-only user", () => {
    expect(SETUP_MENU_KEYS.indexOf("approval-setup")).toBe(SETUP_MENU_KEYS.indexOf("document-setup") + 1);
  });
});

describe("UT-AS-11 Setup tile", () => {
  it("Approval sits after Document Setup, links to /setup/approval and is gated by approval-setup (Q-AS-09/10)", () => {
    const ids = setupLandingTiles.map((tile) => tile.id);
    expect(ids.indexOf("approval-setup")).toBe(ids.indexOf("document-setup") + 1);
    const tile = setupLandingTiles.find((entry) => entry.id === "approval-setup");
    expect(tile && "href" in tile ? tile.href : null).toBe("/setup/approval");
    expect(tile?.permission).toEqual(["approval-setup"]);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/--color-gms-tile-emerald:\s*#14a460;/);
  });
});

describe("UT-AS-12 ConfirmDialog additions (FE-AS-006)", () => {
  it("primary confirm and a rich body; the default stays danger", () => {
    const base = { open: true, title: "T", cancelLabel: "Close", confirmLabel: "Go", pendingLabel: "Go", pending: false, onCancel: noop, onConfirm: noop };
    const primary = html(createElement(ConfirmDialog, { ...base, confirmVariant: "primary", body: createElement("strong", null, "Lead") }));
    expect(primary).toContain("<strong>Lead</strong>");
    expect(primary).toContain("bg-gms-primary");
    expect(html(createElement(ConfirmDialog, { ...base, body: "Plain" }))).toContain("bg-gms-danger-button");
  });
});

describe("UT-AS-13 Approval permission leaf (catalog 2026-11-10)", () => {
  it("the tile follows approval-setup:VIEW; the key is a Setup catalog key", async () => {
    const { canViewWith, menuKeyFor, SETUP_MENU_KEYS } = await import("@/features/home/navigation");
    expect(menuKeyFor("approval-setup")).toBe("approval-setup");
    expect(SETUP_MENU_KEYS).toContain("approval-setup");
    const tile = setupLandingTiles.find((entry) => entry.id === "approval-setup");
    expect(canViewWith({ isSuperAdmin: false, permissions: ["approval-setup:VIEW"] }, tile?.permission)).toBe(true);
    expect(canViewWith({ isSuperAdmin: false, permissions: ["document-setup:VIEW"] }, tile?.permission)).toBe(false);
  });
});
