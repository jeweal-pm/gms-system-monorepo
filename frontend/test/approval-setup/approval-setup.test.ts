import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingRow } from "@/features/approval-setup/components/ApprovalSetupPage";
import {
  blockedText,
  checkFailedText,
  countedSetupMenus,
  DEFAULT_APPROVAL_SETTINGS,
  documentsLabel,
  helperText,
  isNotAvailable,
  PREVIEW_NOTICE,
  SETUP_ROWS,
  statusChain,
  switchedToast,
  turnOffDecision,
  turnOffText,
  turnOnText,
  waitingCell,
} from "@/features/approval-setup/model";
import { approveMenuFor, type ApproveMenu } from "@/features/approve-center/menus";
import { setupLandingTiles } from "@/features/setup/setup-destinations";

/** approval-setup UI rev 1, phase 1 (FE-AS-001…006, owner 2026-11-09). */
const menu = (slug: string) => approveMenuFor(slug) as ApproveMenu;
const noop = () => undefined;
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const row = (slug: string, props: Partial<Parameters<typeof SettingRow>[0]> = {}) =>
  html(createElement("table", null, createElement("tbody", null, createElement(SettingRow, { menu: menu(slug), on: true, count: undefined, canOpenApprove: true, checking: false, onToggle: noop, onRetry: noop, ...props }))));

describe("UT-AS-01 rows and defaults", () => {
  it("11 rows in sidebar order with the Memo rows (owner answer 2); Quotation off, the rest on (owner answer 4)", () => {
    expect(SETUP_ROWS.map((entry) => entry.label)).toEqual([
      "Quotation", "Reserve", "Memo Receive", "Memo Return", "Memo Out", "Memo Out Return",
      "Purchase Order (PO)", "Purchase", "Load to Stock", "Merge/Split Stock", "Transfer Location",
    ]);
    expect(Object.entries(DEFAULT_APPROVAL_SETTINGS).filter(([, on]) => !on).map(([slug]) => slug)).toEqual(["quotation"]);
    expect(SETUP_ROWS.filter(isNotAvailable).map((entry) => entry.slug)).toEqual(["load-to-stock", "merge-split", "transfer-location"]);
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

describe("UT-AS-04 waiting cell", () => {
  it("pluralises correctly and covers every state (Q-AS-07)", () => {
    expect(documentsLabel(1)).toBe("1 document");
    expect(documentsLabel(2)).toBe("2 documents");
    expect(documentsLabel(1200)).toBe("1,200 documents");
    expect(waitingCell(undefined)).toEqual({ kind: "none-applicable" });
    expect(waitingCell({ status: "pending" })).toEqual({ kind: "loading" });
    expect(waitingCell({ status: "error" })).toEqual({ kind: "error" });
    expect(waitingCell({ status: "success", total: 0 })).toEqual({ kind: "zero" });
    expect(waitingCell({ status: "success", total: 1 })).toEqual({ kind: "count", total: 1, text: "1 document" });
  });

  it("counts only types with a document API that the user may list (VIEW), not Quotation or the missing pages", () => {
    expect(countedSetupMenus({ isSuperAdmin: true, permissions: "ALL" }).map((entry) => entry.slug)).toEqual([
      "reserve", "memo-receive", "memo-return", "memo-out", "memo-out-return", "purchase-order", "purchase",
    ]);
    expect(countedSetupMenus({ isSuperAdmin: false, permissions: ["reserve:VIEW", "purchase:APPROVE"] }).map((entry) => entry.slug)).toEqual(["reserve"]);
    expect(countedSetupMenus(undefined)).toEqual([]);
  });

  it("reuses the Approve Center count query keys (no extra request when the sidebar counts are fresh)", () => {
    const source = readFileSync("src/features/approval-setup/components/ApprovalSetupPage.tsx", "utf8");
    expect(source).toContain('queryKey: listQueryKey(menu.proc, COUNT_INPUT, "query")');
    expect(source).not.toMatch(/refetchInterval|localStorage|sessionStorage/);
  });
});

describe("UT-AS-07 turning off (owner answer 3)", () => {
  it("waits for a loading count, blocks while documents wait, never turns off on a failed count", () => {
    expect(turnOffDecision({ status: "pending" })).toBe("wait");
    expect(turnOffDecision({ status: "success", total: 2 })).toBe("blocked");
    expect(turnOffDecision({ status: "error" })).toBe("failed");
    expect(turnOffDecision({ status: "success", total: 0 })).toBe("confirm");
    expect(turnOffDecision(undefined)).toBe("confirm");
  });

  it("blocking dialog text follows source 03 (singular and plural)", () => {
    expect(blockedText(menu("reserve"), 2)).toEqual({
      title: "Can't turn off approval yet",
      lead: "2 Reserve documents are still waiting for approval.",
      body: "Approve or reject them in the Approve menu first, then turn approval off.",
      confirmLabel: "Go to Approve",
      cancelLabel: "Close",
    });
    expect(blockedText(menu("reserve"), 1).lead).toBe("1 Reserve document is still waiting for approval.");
    expect(checkFailedText(menu("purchase")).body).toBe("Try again in a moment. Approval for Purchase stays on.");
  });

  it("confirm texts and the not-saved toast (Q-AS-05, Q-AS-06)", () => {
    expect(turnOnText(menu("quotation")).title).toBe("Turn on approval for Quotation?");
    expect(turnOffText(menu("quotation")).body).toBe("From now on, saving a Quotation approves it at once. Documents already saved don't change.");
    expect(turnOffText(menu("memo-out")).body).toContain("its stock changes happen on Save");
    expect(switchedToast(menu("reserve"), false)).toBe("Approval turned off for Reserve. Not saved yet.");
    expect(PREVIEW_NOTICE).toMatch(/^Preview only\. These settings aren't saved yet/);
  });
});

describe("UT-AS-09 row render", () => {
  it("an On row shows the chain, the waiting link to Approve and an enabled switch", () => {
    const markup = row("reserve", { count: { status: "success", total: 2 } });
    expect(markup).toContain(">Pending approval<");
    expect(markup).toContain('href="/approve/reserve"');
    expect(markup).toContain("2 documents");
    expect(markup).toContain('aria-checked="true"');
    expect(markup).not.toContain('aria-disabled="true"');
  });

  it("without APPROVE the count is plain text; an Off row shows — and no link", () => {
    expect(row("reserve", { count: { status: "success", total: 1 }, canOpenApprove: false })).not.toContain("href=");
    const off = row("quotation", { on: false });
    expect(off).toContain('aria-label="Not applicable"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain(">Off<");
  });

  it("not-available rows: switch disabled with \"Not available yet\" (Q-AS-04)", () => {
    const markup = row("load-to-stock");
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("Not available yet");
  });

  it("while a turn-off waits for its count the switch is busy and blocked", () => {
    const markup = row("reserve", { count: { status: "pending" }, checking: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-label="Checking waiting documents"');
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
