import { describe, expect, it } from "vitest";
import { replacedTakenCodeMessage, shouldPrefillCode } from "@/features/partner/code-suggestion";

/** UT-ADR21-02a…g: suggested running Code Name prefill (features/partner/code-suggestion.ts, ADR-0021 §2). */

const base = { enabled: true, suggestion: "C002", current: "", codeDirty: false };

describe("shouldPrefillCode", () => {
  it("UT-ADR21-02a prefills an empty, untouched Code Name in create mode", () => {
    expect(shouldPrefillCode(base)).toBe(true);
  });

  it("UT-ADR21-02b never prefills outside create mode / without ADD", () => {
    expect(shouldPrefillCode({ ...base, enabled: false })).toBe(false);
  });

  it("UT-ADR21-02c does nothing while the suggestion is loading or failed", () => {
    expect(shouldPrefillCode({ ...base, suggestion: undefined })).toBe(false);
    expect(shouldPrefillCode({ ...base, suggestion: "" })).toBe(false);
  });

  it("UT-ADR21-02d never replaces a value the user typed", () => {
    expect(shouldPrefillCode({ ...base, current: "MY-CODE", codeDirty: true })).toBe(false);
    expect(shouldPrefillCode({ ...base, current: "", codeDirty: true })).toBe(false);
  });

  it("UT-ADR21-02e replaces an untouched older suggestion with the new one (after *_CODE_TAKEN)", () => {
    expect(shouldPrefillCode({ ...base, current: "C001" })).toBe(true);
  });

  it("UT-ADR21-02f does nothing when the field already holds the suggestion", () => {
    expect(shouldPrefillCode({ ...base, current: "C002" })).toBe(false);
  });
});

describe("replacedTakenCodeMessage", () => {
  it("UT-ADR21-02g names the taken code and the new suggestion", () => {
    expect(replacedTakenCodeMessage("V001", "V002")).toBe("V001 is already in use. V002 is suggested instead; check it, then save again.");
  });
});
