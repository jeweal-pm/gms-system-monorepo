import { readFileSync } from "node:fs";
import { TRPCClientError } from "@trpc/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { LinePhotosField } from "@/features/quotation/components/items/LinePhotosField";
import { LinePhotoContext } from "@/features/quotation/options-context";
import { emptyLine } from "@/features/quotation/lib/defaults";
import { mapDocumentSaveError } from "@/features/trade-document/document-api";
import { DOCUMENT_PHOTOS } from "@/features/trade-document/document-photos";

/** UT-LP-F01…F04: line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase (ADR-0048, owner 2026-11-11). */
describe("document line photos", () => {
  it("UT-LP-F01 each document has its own photo route and read link", () => {
    expect(Object.fromEntries(Object.entries(DOCUMENT_PHOTOS).map(([key, photos]) => [key, photos.url("a b")]))).toEqual({
      reserve: "/api/v1/reserve/photos/a%20b",
      memoReturn: "/api/v1/memo-return/photos/a%20b",
      memoOut: "/api/v1/memo-out/photos/a%20b",
      memoOutReturn: "/api/v1/memo-out-return/photos/a%20b",
      purchase: "/api/v1/purchase/photos/a%20b",
    });
    for (const photos of Object.values(DOCUMENT_PHOTOS)) expect(photos.target.upload).toBeTypeOf("function");
  });

  it("UT-LP-F02 upload posts the file to the document's route and returns a form photo", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ photoId: "p9" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "ring.png", { type: "image/png" });
    await expect(DOCUMENT_PHOTOS.reserve.uploadPhoto(file)).resolves.toEqual({ id: "p9", name: "ring.png", url: "/api/v1/reserve/photos/p9" });
    expect((fetchMock.mock.calls as unknown as [string][])[0]?.[0]).toBe("/api/v1/reserve/photos");
    vi.unstubAllGlobals();
  });

  it("UT-LP-F03 with a photo target the row panel offers uploads (no 'later update' note)", () => {
    function Harness({ withPhotos }: { withPhotos: boolean }) {
      const form = useForm({ defaultValues: { lines: [{ ...emptyLine(), photos: [] }] } });
      const field = createElement(LinePhotosField, { index: 0, readOnly: false });
      return createElement(
        FormProvider,
        form as never,
        withPhotos ? createElement(LinePhotoContext.Provider, { value: DOCUMENT_PHOTOS.memoOut.target }, field) : createElement(LinePhotoContext.Provider, { value: { upload: null, url: (id: string) => id } }, field),
      );
    }
    const enabled = renderToStaticMarkup(createElement(Harness, { withPhotos: true }));
    expect(enabled).not.toContain("later update");
    expect(enabled).toMatch(/<button type="button" class="[^"]*">Add files<\/button>/);
    expect(renderToStaticMarkup(createElement(Harness, { withPhotos: false }))).toContain("Photos for this document come in a later update.");
  });

  it("UT-LP-F04 every one of the five pages passes its photos; a refused photo has its own message", () => {
    const pages: [string, string][] = [
      ["src/features/reserve/components/ReservePage.tsx", "photos: DOCUMENT_PHOTOS.reserve"],
      ["src/features/memo-out/components/MemoOutPage.tsx", "photos: DOCUMENT_PHOTOS.memoOut"],
      ["src/features/memo-return/components/MemoReturnPage.tsx", "photos: DOCUMENT_PHOTOS.memoReturn"],
      ["src/features/memo-out-return/components/MemoOutReturnPage.tsx", "photos: DOCUMENT_PHOTOS.memoOutReturn"],
      ["src/features/purchase/components/PurchasePage.tsx", "photos: DOCUMENT_PHOTOS.purchase"],
    ];
    for (const [file, text] of pages) expect(readFileSync(file, "utf8")).toContain(text);
    const form = readFileSync("src/features/trade-document/document-form.tsx", "utf8");
    expect(form).toContain("<LinePhotoContext.Provider value={config.photos?.target ?? NO_PHOTOS}>");
    expect(form).toContain("uploadPhoto: config.photos.uploadPhoto");
    const refused = TRPCClientError.from({ error: { message: "RESERVE_PHOTO_INVALID", code: -32000, data: { code: "UNPROCESSABLE_CONTENT", httpStatus: 422, domainCode: "RESERVE_PHOTO_INVALID", fieldErrors: [{ path: "lines.0.photoIds.0", code: "invalid_photo" }] } } } as never);
    expect(mapDocumentSaveError(refused, "RESERVE", "reserve", [])).toEqual({ fieldErrors: [{ name: "lines", message: "Check item row 1" }], message: "A photo couldn't be used. Remove it and add it again." });
  });
});
