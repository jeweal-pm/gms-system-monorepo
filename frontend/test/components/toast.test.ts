import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastCard, ToastMark, type ToastItem } from "@/components/ui/toast";

/** UT-TOAST-01…04: toast restyled to the owner's design (2026-10-20). */

const card = (toast: Partial<ToastItem>) =>
  renderToStaticMarkup(createElement(ToastCard, { toast: { id: 1, tone: "success", message: "Saved", ...toast }, onDismiss: () => {} }));

describe("Toast", () => {
  it("UT-TOAST-01 dark card with white semibold message and a dismiss button", () => {
    const html = card({ message: "Toast message" });
    expect(html).toContain("bg-gms-toast");
    expect(html).toContain("text-gms-toast-text");
    expect(html).toContain("min-h-14");
    expect(html).toContain("font-semibold");
    expect(html).toContain("Toast message");
    expect(html).toContain('aria-label="Dismiss notification"');
  });

  it("UT-TOAST-02 each tone has its mark: info square, success/error/warning discs on a halo", () => {
    const mark = (tone: ToastItem["tone"]) => renderToStaticMarkup(createElement(ToastMark, { tone }));
    expect(mark("info")).toContain("bg-gms-toast-info");
    expect(mark("info")).toContain(">i<");
    expect(mark("success")).toContain("bg-gms-toast-success-halo");
    expect(mark("success")).toMatch(/bg-gms-toast-success["\s]/);
    expect(mark("error")).toContain("bg-gms-toast-error");
    expect(mark("warning")).toContain("bg-gms-toast-warning");
    for (const tone of ["error", "warning"] as const) {
      expect(mark(tone)).toContain("bg-gms-toast-alert-halo");
      expect(mark(tone)).toContain(">!<");
    }
  });

  it("UT-TOAST-03 errors and warnings are alerts; success and info are polite status", () => {
    expect(card({ tone: "error" })).toContain('role="alert"');
    expect(card({ tone: "warning" })).toContain('role="alert"');
    expect(card({ tone: "success" })).toContain('role="status"');
    expect(card({ tone: "info" })).toContain('role="status"');
  });

  it("UT-TOAST-04 the text action (design: Settings) appears only when given", () => {
    expect(card({})).not.toContain("Settings");
    expect(card({ action: { label: "Settings", onClick: () => {} } })).toContain(">Settings</button>");
  });
});
