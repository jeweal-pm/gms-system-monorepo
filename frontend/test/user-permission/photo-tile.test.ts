import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoTile } from "@/features/user-permission/components/photo-tile";

/** UT-PH-F06…F07: the user photo shows whole inside the 120 px square, on a white tile (owner 2026-10-19). */

const noop = () => {};
const tile = (props: Partial<Parameters<typeof PhotoTile>[0]>) =>
  renderToStaticMarkup(createElement(PhotoTile, { value: { kind: "unchanged" }, savedUrl: null, onChange: noop, readOnly: false, ...props }));

describe("PhotoTile", () => {
  it("UT-PH-F06 view mode: square frame, white tile, photo contained (not cropped)", () => {
    const html = tile({ savedUrl: "/api/v1/user-admin/users/u/photo?v=1", readOnly: true });
    expect(html).toContain('alt="User photo"');
    expect(html).toContain("h-[120px] w-[120px]");
    expect(html).toContain("bg-gms-surface");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
    expect(html).not.toContain("bg-gms-checkbox-readonly");
  });

  it("UT-PH-F07 edit mode: photo contained with the remove button", () => {
    const html = tile({ savedUrl: "/api/v1/user-admin/users/u/photo?v=1" });
    expect(html).toContain("Remove photo");
    expect(html).toContain("object-contain");
    expect(html).not.toContain("object-cover");
  });
});
