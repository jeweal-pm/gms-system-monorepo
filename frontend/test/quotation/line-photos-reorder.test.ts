import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { LinePhotosField, movePhoto, PHOTO_DRAG_TYPE } from "@/features/quotation/components/items/LinePhotosField";
import { DocumentKindContext, QUOTATION_KIND } from "@/features/quotation/document-kind";
import { emptyLine } from "@/features/quotation/lib/defaults";
import { LinePhotoContext } from "@/features/quotation/options-context";
import type { PhotoRef, QuotationLine } from "@/features/quotation/schema";

/** Owner 2026-11-04: row-panel photos on every transaction can be dragged into a new order; slot 0 is the main photo (crown). */

const photo = (id: string): PhotoRef => ({ id, name: `Photo ${id}`, url: `/photos/${id}` });
const [A, B, C, D] = ["a", "b", "c", "d"].map(photo);
const ids = (photos: PhotoRef[]) => photos.map((p) => p.id).join("");

function render(photos: PhotoRef[], readOnly: boolean) {
  const lines: QuotationLine[] = [{ ...emptyLine(), photos }];
  function Harness() {
    const form = useForm({ defaultValues: { lines } });
    return createElement(FormProvider, form as never,
      createElement(DocumentKindContext.Provider, { value: QUOTATION_KIND },
        createElement(LinePhotoContext.Provider, { value: { upload: true, url: (id: string) => id } as never },
          createElement(LinePhotosField, { index: 0, readOnly }))));
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe("line photo reorder", () => {
  it("UT-PH-01 dropping a photo on the first slot makes it the main photo; the rest keep their order", () => {
    expect(ids(movePhoto([A, B, C, D], "c", 0))).toBe("cabd");
    expect(ids(movePhoto([A, B, C, D], "a", 0))).toBe("abcd");
  });

  it("UT-PH-02 moves forward and backward, and past the end goes last", () => {
    expect(ids(movePhoto([A, B, C, D], "a", 2))).toBe("bcad");
    expect(ids(movePhoto([A, B, C, D], "d", 1))).toBe("adbc");
    expect(ids(movePhoto([A, B, C], "a", 9))).toBe("bca");
    expect(ids(movePhoto([A, B, C], "b", -3))).toBe("bac");
  });

  it("UT-PH-03 an unknown id leaves the list unchanged and never drops a photo", () => {
    const list = [A, B, C];
    expect(ids(movePhoto(list, "zz", 0))).toBe("abc");
    expect(movePhoto(list, "b", 0)).toHaveLength(3);
    expect(ids(list)).toBe("abc");
  });

  it("UT-PH-04 an editable row's photo tiles are draggable; the crown stays on the first photo", () => {
    const html = render([A, B], false);
    expect(html.match(/<div draggable="true"/g)).toHaveLength(2);
    expect(html).toContain("Drag to reorder. The first photo is the main photo.");
    expect(html).toContain('aria-label="Main photo"');
    expect(html).toMatch(/<img src="\/photos\/a"[^>]*draggable="false"/);
    expect(PHOTO_DRAG_TYPE).toBe("application/x-gms-line-photo");
  });

  it("UT-PH-05 a read-only row can't be reordered", () => {
    const html = render([A, B], true);
    expect(html).not.toContain('draggable="true"');
    expect(html).not.toContain("Drag to reorder");
  });
});
