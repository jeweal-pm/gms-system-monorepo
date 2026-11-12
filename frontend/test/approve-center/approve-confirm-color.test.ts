import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** UT-AP-CONFIRM-01 (owner 2026-11-12): the Approve confirmation button is the primary green, not the destructive red. */
describe("approve confirmation colour", () => {
  it("UT-AP-CONFIRM-01 the Approve dialog passes confirmVariant primary, which renders bg-gms-primary", () => {
    const source = readFileSync("src/features/approve-center/components/ApproveCenterPage.tsx", "utf8");
    const dialog = source.slice(source.indexOf("<ConfirmDialog"), source.indexOf("/>", source.indexOf("<ConfirmDialog")));
    expect(dialog).toContain('confirmLabel="Approve"');
    expect(dialog).toContain('confirmVariant="primary"');

    const props = { open: true, title: "Approve QT-1020?", body: "It can no longer be edited.", cancelLabel: "Cancel", confirmLabel: "Approve", pendingLabel: "Approving…", pending: false, onCancel: () => undefined, onConfirm: () => undefined };
    const green = renderToStaticMarkup(createElement(ConfirmDialog, { ...props, confirmVariant: "primary" }));
    expect(green).toMatch(/class="[^"]*bg-gms-primary [^"]*"[^>]*>Approve</);
    expect(green).not.toContain("bg-gms-danger-button");
  });
});
