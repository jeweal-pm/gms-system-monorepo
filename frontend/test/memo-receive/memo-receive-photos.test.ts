import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fromMemoReceive,
  mapMemoReceiveError,
  MEMO_RECEIVE_PHOTO_ROUTE,
  memoReceivePhotoUrl,
  toMemoReceiveInput,
  uploadMemoReceivePhoto,
  type MemoReceiveDetail,
} from "@/features/memo-receive/api";
import { MEMO_RECEIVE_PHOTOS } from "@/features/memo-receive/components/MemoReceiveForm";
import { emptyMemoReceive, MEMO_RECEIVE_KIND } from "@/features/memo-receive/defaults";
import { PhotoUploadError, uploadQuotationPhoto } from "@/features/quotation/api";
import { ItemPhotoBox } from "@/features/quotation/components/items/ItemPhotoBox";
import { LinePhotosField } from "@/features/quotation/components/items/LinePhotosField";
import { DocumentKindContext, QUOTATION_KIND } from "@/features/quotation/document-kind";
import { emptyLine } from "@/features/quotation/lib/defaults";
import { LinePhotoContext, type LinePhotoTarget } from "@/features/quotation/options-context";
import type { QuotationLine } from "@/features/quotation/schema";
import { gatewayError } from "../partner/helpers";

/**
 * memo-receive UI rev 4 + SA revision 2 (owner 2026-10-29): line photos.
 * UT-MR-F3: upload target and error mapping, photo ids sent on save and loaded back, row-panel photos read-only once
 * Approved, and the left item card showing the selected row's main photo.
 */

const ID = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";
const P1 = "44444444-4444-4444-8444-444444444444";
const P2 = "55555555-5555-4555-8555-555555555555";
const file = (type: string, size = 10) => new File([new Uint8Array(size)], "ring.png", { type });
const created = (photoId: string) => new Response(JSON.stringify({ photoId }), { status: 201 });

afterEach(() => vi.unstubAllGlobals());

describe("upload target (UT-MR-F3)", () => {
  it("posts the raw bytes to the Memo Receive photo route with the CSRF marker and returns the id; Quotation keeps its route", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => created(P1));
    vi.stubGlobal("fetch", fetchMock);
    const photo = file("image/png");
    await expect(uploadMemoReceivePhoto(photo)).resolves.toBe(P1);
    expect(MEMO_RECEIVE_PHOTO_ROUTE).toBe("/api/v1/memo-receive/photos");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/memo-receive/photos", {
      method: "POST",
      headers: { "content-type": "image/png", "x-gms-csrf": "1" },
      body: photo,
      credentials: "same-origin",
    });
    await uploadQuotationPhoto(file("image/jpeg"));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/v1/quotation/photos", expect.objectContaining({ method: "POST" }));
  });

  it("the document kind and the row-panel target use the Memo Receive route; photo links read from it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => created(P2)));
    await expect(MEMO_RECEIVE_KIND.uploadPhoto(file("image/png"))).resolves.toEqual({ id: P2, name: "ring.png", url: `/api/v1/memo-receive/photos/${P2}` });
    expect(memoReceivePhotoUrl(P1)).toBe(`/api/v1/memo-receive/photos/${P1}`);
    expect(MEMO_RECEIVE_PHOTOS.upload).toBe(uploadMemoReceivePhoto);
    expect(MEMO_RECEIVE_PHOTOS.url(P1)).toBe(memoReceivePhotoUrl(P1));
    expect(MEMO_RECEIVE_KIND.uploadPhoto).not.toBe(QUOTATION_KIND.uploadPhoto);
  });

  it("checks type and size before any request and maps every refusal to a message", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadMemoReceivePhoto(file("image/gif"))).rejects.toThrow("JPEG or PNG");
    await expect(uploadMemoReceivePhoto(file("image/jpeg", 5 * 1024 * 1024 + 1))).rejects.toThrow("5 MB");
    expect(fetchMock).not.toHaveBeenCalled();

    const answer = async (response: Response | Error): Promise<Error> => {
      vi.stubGlobal("fetch", vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      }));
      return uploadMemoReceivePhoto(file("image/png")).then(() => new Error("uploaded"), (error: Error) => error);
    };
    const invalid = JSON.stringify({ code: "MEMO_RECEIVE_PHOTO_INVALID", fieldErrors: [{ path: "(body)", code: "invalid_photo" }] });
    for (const status of [413, 415, 422]) {
      const error = await answer(new Response(status === 422 ? invalid : "{}", { status }));
      expect(error).toBeInstanceOf(PhotoUploadError);
      expect(error.message).toBe("This file isn't a supported photo (JPEG or PNG, up to 5 MB).");
    }
    expect((await answer(new Response("{}", { status: 403 }))).message).toBe("You don't have permission to add photos.");
    expect((await answer(new Response("{}", { status: 401 }))).message).toBe("Couldn't upload the photo. Try again.");
    expect((await answer(new Response("{}", { status: 503, headers: { "retry-after": "1" } }))).message).toBe("Couldn't upload the photo. Try again.");
    expect((await answer(new Response("{}", { status: 201 }))).message).toBe("Couldn't upload the photo. Try again.");
    expect((await answer(new TypeError("offline"))).message).toContain("Check the connection");
  });
});

describe("photo ids on save (UT-MR-F3)", () => {
  const withPhotos = (photos: string[]) => ({ ...emptyLine(), stone: "Ruby", pcs: "1", photos: photos.map((id) => ({ id, name: id, url: memoReceivePhotoUrl(id) })) });

  it("sends each row's photo ids in order, main photo first; a row without photos sends none", () => {
    const values = { ...emptyMemoReceive(), vendorId: ID, addressId: ID, currency: "THB", lines: [withPhotos([P2, P1]), emptyLine(), withPhotos([])] };
    expect(toMemoReceiveInput(values).lines.map((line) => line.photoIds)).toEqual([[P2, P1], []]);
  });

  it("loads saved photo ids back as photos read from the Memo Receive route", () => {
    const detail = {
      id: ID, docNo: "MR-1", status: "APPROVED", version: 1, docDate: "2026-10-29", dueDate: "2026-10-30", vendorId: ID, addressId: ID,
      currency: "THB", exchangeRate: null, ref: "", documentNote: "", discount: { type: "NONE", value: "0" },
      tax: { enabled: false, rate: "7", includeInPrice: false }, serviceCharges: [], labor: null,
      lines: [{
        id: LINE, stockId: "260001", stoneCode: "", stone: "Ruby", shape: "", size: "", color: "", clarity: "", cutting: "", quality: "", lot: "",
        cerType: "", cerNo: "", pcs: 1, weightCt: "1.000", priceUnit: "PER_CT", unitPrice: "1.0000", discount: { type: "NONE", value: "0" }, itemNote: "", photoIds: [P1, P2],
      }],
    } as unknown as MemoReceiveDetail;
    const values = fromMemoReceive(detail);
    expect(values.lines[0].photos).toEqual([
      { id: P1, name: "Photo 1", url: `/api/v1/memo-receive/photos/${P1}` },
      { id: P2, name: "Photo 2", url: `/api/v1/memo-receive/photos/${P2}` },
    ]);
    expect(toMemoReceiveInput(values, new Set([LINE])).lines[0]).toMatchObject({ id: LINE, photoIds: [P1, P2] });
  });

  it("maps MEMO_RECEIVE_PHOTO_INVALID on save to the photo's row", () => {
    const outcome = mapMemoReceiveError(gatewayError({ domainCode: "MEMO_RECEIVE_PHOTO_INVALID", httpStatus: 422, fieldErrors: [{ path: "lines.1.photoIds.0", code: "invalid_photo" }] }));
    expect(outcome).toMatchObject({ message: "A photo couldn't be used. Remove it and add it again.", reload: false, gone: false, fieldErrors: [{ name: "lines", message: "Check item row 2" }] });
  });
});

describe("row-panel photos and item card (UT-MR-F3)", () => {
  const line = (photos: string[]): QuotationLine => ({ ...emptyLine(), key: LINE, stockId: "260001", stone: "Ruby", photos: photos.map((id, i) => ({ id, name: `Photo ${i + 1}`, url: memoReceivePhotoUrl(id) })) });

  function render(child: ReactNode, lines: QuotationLine[], target: LinePhotoTarget = MEMO_RECEIVE_PHOTOS) {
    function Harness() {
      const form = useForm({ defaultValues: { lines } });
      return createElement(FormProvider, form as never,
        createElement(DocumentKindContext.Provider, { value: MEMO_RECEIVE_KIND }, createElement(LinePhotoContext.Provider, { value: target }, child)));
    }
    return renderToStaticMarkup(createElement(Harness));
  }

  it("a pending document can add, remove and pick the main photo; the later-update note is gone", () => {
    const html = render(createElement(LinePhotosField, { index: 0, readOnly: false }), [line([P1, P2])]);
    expect(html).toContain(`src="/api/v1/memo-receive/photos/${P1}"`);
    expect(html).toContain('aria-label="Remove photo"');
    expect(html).toContain('aria-label="Set as main photo"');
    expect(html).not.toContain("later update");
    const empty = render(createElement(LinePhotosField, { index: 0, readOnly: false }), [line([])]);
    expect(empty).toMatch(/<button type="button" class="[^"]*">Add files<\/button>/);
    expect(empty).toContain("Up to 5 photos per item (JPEG/PNG, 5 MB)");
  });

  it("an Approved (read-only) document shows its photos but can't add, remove or change the main photo", () => {
    const html = render(createElement(LinePhotosField, { index: 0, readOnly: true }), [line([P1, P2])]);
    expect(html).toContain(`src="/api/v1/memo-receive/photos/${P2}"`);
    expect(html).not.toContain('aria-label="Remove photo"');
    expect(html).toMatch(/aria-label="Set as main photo"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="Add photo" disabled=""/);
    const empty = render(createElement(LinePhotosField, { index: 0, readOnly: true }), [line([])]);
    expect(empty).toMatch(/<button type="button" disabled=""[^>]*>Add files<\/button>/);
  });

  it("without an upload target (Memo Out) the row panel still says photos come later", () => {
    const html = render(createElement(LinePhotosField, { index: 0, readOnly: false }), [line([])], { upload: null, url: (id) => id });
    expect(html).toContain("Photos for this document come in a later update.");
  });

  it("the left item card shows the selected row's main photo first", () => {
    const html = render(createElement(ItemPhotoBox, { index: 0 }), [line([P2, P1])]);
    expect(html).toContain(`src="/api/v1/memo-receive/photos/${P2}"`);
    expect(html).not.toContain(`/api/v1/memo-receive/photos/${P1}`);
    expect(html).toContain("Photo · 1 / 2");
    expect(html).toContain('aria-label="Main photo"');
  });
});
