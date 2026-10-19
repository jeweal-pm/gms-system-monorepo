import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TextField } from "@/components/ui/outlined-field";
import { LogoUploadTile } from "@/features/company-profile/components/logo-upload-tile";
import { PlainTextField } from "@/features/company-profile/components/plain-text-field";
import { ProfileSection } from "@/features/company-profile/components/profile-section";
import { COMPANY_PROFILE_FIELD_ORDER } from "@/features/company-profile/schema";

/** UT-CP-F32…F42: company profile UI revision 3 layout pieces, rendered to static markup (node environment). */

const noop = () => {};
const tile = (props: Partial<Parameters<typeof LogoUploadTile>[0]>) =>
  renderToStaticMarkup(createElement(LogoUploadTile, { id: "cp-logo", value: { kind: "unchanged" }, savedUrl: null, onChange: noop, readOnly: false, ...props }));

describe("ProfileSection", () => {
  it("UT-CP-F32 renders the title as the section heading above its fields, in the second grid column", () => {
    // eslint-disable-next-line react/no-children-prop -- .ts test without JSX; `children` is a required prop of ProfileSection
    const html = renderToStaticMarkup(createElement(ProfileSection, { id: "company-address", title: "Address", children: createElement("p", null, "fields") }));
    expect(html).toContain('aria-labelledby="company-address-title"');
    expect(html).toContain('<h2 id="company-address-title"');
    expect(html).toContain("lg:col-start-2");
    expect(html.indexOf("Address</h2>")).toBeLessThan(html.indexOf("fields"));
  });
});

describe("TextField endIcon", () => {
  it("UT-CP-F33 shows a decorative end icon and reserves space for it", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "cp-city", label: "City", endIcon: createElement("svg", { "data-testid": "chevron" }) }));
    expect(html).toContain('data-testid="chevron"');
    expect(html).toContain("pr-11");
    expect(html).toMatch(/<span aria-hidden="true"[^>]*pointer-events-none/);
  });

  it("UT-CP-F34 hides the end icon in read-only view", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "cp-city", label: "City", readOnly: true, endIcon: createElement("svg", { "data-testid": "chevron" }) }));
    expect(html).not.toContain("chevron");
    expect(html).not.toContain("pr-11");
  });

  it("UT-CP-F35 keeps the plain layout without an end icon", () => {
    const html = renderToStaticMarkup(createElement(TextField, { id: "cp-name", label: "Name" }));
    expect(html).toContain("px-4");
    expect(html).not.toContain("pointer-events-none");
  });
});

describe("LogoUploadTile", () => {
  it("UT-CP-F36 renders the empty upload tile at 200 px", () => {
    const html = tile({});
    expect(html).toContain("size-50");
    expect(html).toContain("Upload photo");
    expect(html).toContain("JPEG or PNG only");
  });

  it("UT-CP-F37 shows a spinner over the grey tile while the picked logo uploads", () => {
    const html = tile({ value: { kind: "new", file: new File([], "logo.png", { type: "image/png" }), previewUrl: "blob:logo" }, uploading: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Uploading logo");
    expect(html).toContain("bg-gms-checkbox-readonly");
    expect(html).not.toContain("Remove company logo");
  });

  it("UT-CP-F38 shows the white tile with the trash button in edit mode, logo not cropped", () => {
    const html = tile({ savedUrl: "/api/v1/company-profile/logo?v=1" });
    expect(html).toContain("Remove company logo");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("Uploading logo");
  });
});

describe("COMPANY_PROFILE_FIELD_ORDER", () => {
  it("UT-CP-F39 follows the revision 3 page order (Road/Street, Country, State/Province, City — owner 2026-10-19; no terms)", () => {
    const order: readonly string[] = COMPANY_PROFILE_FIELD_ORDER;
    expect(order.indexOf("address2")).toBeLessThan(order.indexOf("roadStreet"));
    expect(order.indexOf("roadStreet")).toBeLessThan(order.indexOf("countryCode"));
    expect(order.indexOf("countryCode")).toBeLessThan(order.indexOf("state"));
    expect(order.indexOf("state")).toBeLessThan(order.indexOf("city"));
    expect(order).not.toContain("terms");
  });
});

describe("PlainTextField", () => {
  it("UT-CP-F41 renders a resizable textarea labelled by the section title, value as literal text", () => {
    const html = renderToStaticMarkup(createElement(PlainTextField, { id: "cp-bankDetails", labelledBy: "company-bank-title", placeholder: "Enter bank transfer details...", defaultValue: "<b>KBank</b>" }));
    expect(html).toContain("<textarea");
    expect(html).toContain('aria-labelledby="company-bank-title"');
    expect(html).toContain("resize-y");
    expect(html).toContain("&lt;b&gt;KBank&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("UT-CP-F42 is disabled with the read-only fill in view mode and shows an error", () => {
    expect(renderToStaticMarkup(createElement(PlainTextField, { id: "cp-bankDetails", labelledBy: "t", readOnly: true }))).toMatch(/disabled=""[^>]*bg-gms-field-disabled|bg-gms-field-disabled[^>]*disabled=""/);
    const html = renderToStaticMarkup(createElement(PlainTextField, { id: "cp-bankDetails", labelledBy: "t", error: "Too long" }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="cp-bankDetails-error"');
    expect(html).toContain("Too long");
  });
});
