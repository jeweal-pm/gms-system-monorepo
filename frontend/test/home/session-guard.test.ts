import { describe, expect, it } from "vitest";
import { sessionView } from "@/features/home/app-shell";

const base = { hasSession: false, hasLastSession: false, failed: false, isPending: false, isChecked: true };

/** INV-20261102-001: only a completed "no session" answer signs the user out; a refused check never does. */
describe("UT-SHELL-S1 session guard", () => {
  it("waits for this page's fresh check, then shows the page or the login redirect", () => {
    expect(sessionView({ ...base, isPending: true })).toBe("loading");
    expect(sessionView({ ...base, hasSession: true, isChecked: false })).toBe("loading");
    expect(sessionView({ ...base, hasSession: true })).toBe("ready");
    expect(sessionView(base)).toBe("signed-out");
  });

  it("a failed check (429 / 5xx) keeps the last session on screen, or shows a retry notice — never the login page", () => {
    expect(sessionView({ ...base, failed: true, hasLastSession: true })).toBe("ready");
    expect(sessionView({ ...base, failed: true, hasLastSession: true, isChecked: false })).toBe("ready");
    expect(sessionView({ ...base, failed: true })).toBe("retry");
  });
});
