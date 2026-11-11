import { describe, expect, it, vi } from "vitest";
import type { LineHook } from "../../src/trade-document/document-engine";
import { LINE_PHOTO_DOCUMENTS, checkLinePhotos, linePhotoInvalid, withLinePhotos } from "../../src/trade-document/line-photos";

/** UT-LP-01…05: line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase (ADR-0048, owner 2026-11-11). */
const A = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d01";
const B = "0b9f3c4e-1d2a-4b3c-8d4e-5f6a7b8c9d02";
const reserve = LINE_PHOTO_DOCUMENTS.reserve;

function tx(readyIds: string[]) {
  return {
    storedFile: { findMany: vi.fn(async () => readyIds.map((id) => ({ id }))) },
    reserveLinePhoto: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
}
type AnyInput = Parameters<LineHook<never>["assign"]>[1];
const input = (lines: { photoIds: string[] }[]) => ({ lines }) as unknown as AnyInput;

describe("line photos (ADR-0048)", () => {
  it("UT-LP-01 five documents, each with its own source, module, route, menu and error code", () => {
    expect(Object.values(LINE_PHOTO_DOCUMENTS).map((doc) => [doc.menu, doc.source, doc.route, doc.module, doc.code])).toEqual([
      ["reserve", "reserve.line-photo", "/api/v1/reserve/photos", "reserve-photo", "RESERVE"],
      ["memo-return", "memo_return.line-photo", "/api/v1/memo-return/photos", "memo-return-photo", "MEMO_RETURN"],
      ["memo-out", "memo_out.line-photo", "/api/v1/memo-out/photos", "memo-out-photo", "MEMO_OUT"],
      ["memo-out-return", "memo_out_return.line-photo", "/api/v1/memo-out-return/photos", "memo-out-return-photo", "MEMO_OUT_RETURN"],
      ["purchase", "purchase.line-photo", "/api/v1/purchase/photos", "purchase-photo", "PURCHASE"],
    ]);
    expect(linePhotoInvalid(reserve)("lines.0.photoIds.0")).toMatchObject({ response: { error: { code: "RESERVE_PHOTO_INVALID", message: "A photo is missing or is not a JPEG or PNG image up to 5 MB" } } });
  });

  it("UT-LP-02 only ready photos of the document's own source are accepted, in one bounded query", async () => {
    const t = tx([A]);
    await expect(checkLinePhotos(t as never, reserve, [{ photoIds: [A] }])).resolves.toBeUndefined();
    expect(t.storedFile.findMany).toHaveBeenCalledWith({ where: { id: { in: [A] }, sourceType: "reserve.line-photo", status: "ready" }, select: { id: true } });
    await expect(checkLinePhotos(t as never, reserve, [{ photoIds: [] }, { photoIds: [A, B] }])).rejects.toMatchObject({
      response: { error: { code: "RESERVE_PHOTO_INVALID", fieldErrors: [{ path: "lines.1.photoIds.1", code: "invalid_photo" }] } },
    });
    const none = tx([]);
    await checkLinePhotos(none as never, reserve, [{ photoIds: [] }]);
    expect(none.storedFile.findMany).not.toHaveBeenCalled();
  });

  it("UT-LP-03 the existing hook runs first and unchanged; photos are checked after it", async () => {
    const order: string[] = [];
    const existing: LineHook<never> = {
      storedSelect: { id: true },
      assign: vi.fn(async () => {
        order.push("existing");
        return [{ stockId: "260001" }];
      }),
      output: (_line, base) => ({ ...base, stockId: "260001", photoIds: [] }),
      result: (assigned) => ({ stockIds: assigned.map((row) => row.stockId) }),
      lineInclude: { memoStock: true },
    };
    const t = tx([A]);
    t.storedFile.findMany.mockImplementation(async () => {
      order.push("photos");
      return [{ id: A }];
    });
    const hook = withLinePhotos(reserve, existing);
    expect(await hook.assign(t as never, input([{ photoIds: [A] }]), null)).toEqual([{ stockId: "260001" }]);
    expect(order).toEqual(["existing", "photos"]);
    expect(hook.storedSelect).toEqual({ id: true });
    expect(hook.result([{ stockId: "260001" }])).toEqual({ stockIds: ["260001"] });
    expect(hook.lineInclude).toEqual({ memoStock: true, photos: { orderBy: { position: "asc" }, select: { fileId: true } } });
  });

  it("UT-LP-04 output: the photos in position order replace the `[]` default, other fields kept", () => {
    const hook = withLinePhotos(reserve, undefined as never);
    expect(hook.output({ photos: [{ fileId: B }, { fileId: A }] }, { id: "l1", photoIds: [] })).toEqual({ id: "l1", photoIds: [B, A] });
    expect(hook.output({}, { id: "l2", photoIds: [] })).toEqual({ id: "l2", photoIds: [] });
  });

  it("UT-LP-05 afterLines: the existing hook's rows, then each line's photos with positions 1…n", async () => {
    const existingAfter = vi.fn(async () => undefined);
    const hook = withLinePhotos(reserve, { storedSelect: {}, assign: async () => [], output: (_line: unknown, base: unknown) => base, result: () => ({}), afterLines: existingAfter } as never);
    const t = tx([]);
    await hook.afterLines?.(t as never, input([{ photoIds: [A, B] }, { photoIds: [] }, { photoIds: [B] }]), ["l1", "l2", "l3"]);
    expect(existingAfter).toHaveBeenCalledTimes(1);
    expect(t.reserveLinePhoto.createMany).toHaveBeenCalledWith({
      data: [
        { lineId: "l1", position: 1, fileId: A },
        { lineId: "l1", position: 2, fileId: B },
        { lineId: "l3", position: 1, fileId: B },
      ],
    });
    const empty = tx([]);
    await withLinePhotos(reserve).afterLines?.(empty as never, input([{ photoIds: [] }]), ["l1"]);
    expect(empty.reserveLinePhoto.createMany).not.toHaveBeenCalled();
  });
});
