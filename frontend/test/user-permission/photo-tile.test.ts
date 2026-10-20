import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoTile } from "@/features/user-permission/components/photo-tile";

/** UT-PH-F06…F08: the user photo shows whole inside the 124 px square, on a white tile (owner 2026-10-19/20). */

const noop = () => {};
const tile = (props: Partial<Parameters<typeof PhotoTile>[0]>) =>
  renderToStaticMarkup(createElement(PhotoTile, { value: { kind: "unchanged" }, savedUrl: null, onChange: noop, readOnly: false, ...props }));

describe("PhotoTile", () => {
  it("UT-PH-F06 view mode: square frame, white tile, photo contained (not cropped)", () => {
    const html = tile({ savedUrl: "/api/v1/user-admin/users/u/photo?v=1", readOnly: true });
    expect(html).toContain('alt="User photo"');
    expect(html).toContain("size-[124px]");
    expect(html).toContain("bg-gms-surface");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("bg-gms-checkbox-readonly");
  });

  it("UT-PH-F08 empty tile: 124 px, dashed white border, design upload icon (owner 2026-10-20)", () => {
    const html = tile({});
    expect(html).toContain("size-[124px]");
    expect(html).toContain("border-dashed border-white");
    expect(html).toContain("bg-gms-upload-tile");
    expect(html).toContain('data-icon="upload-photo"');
    expect(html).toContain('width="32"');
    expect(html).toContain("Upload photo");
    expect(html).toContain("JPEG or PNG only");
  });

  it("UT-PH-F07 edit mode: photo contained with the remove button", () => {
    const html = tile({ savedUrl: "/api/v1/user-admin/users/u/photo?v=1" });
    expect(html).toContain("Remove photo");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });
});
