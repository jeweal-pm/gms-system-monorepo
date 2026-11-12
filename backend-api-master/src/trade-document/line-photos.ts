import { HttpStatus } from "@nestjs/common";
import { partnerException } from "../common/errors";
import type { Tx } from "../common/persistence";
import type { LineHook, TradeDocumentInput } from "./document-engine";

/**
 * ADR-0048 (owner 2026-11-11): line photos on Reserve, Memo Return, Memo Out, Memo Out Return and Purchase, exactly as
 * Purchase Order (ADR-0041 D5): up to 5 ready photos of the document's own `stored_files` source per line, in order,
 * written in the save transaction. `withLinePhotos` adds this to a document's existing line hook without changing it.
 */
export type LinePhotoModel = "reserveLinePhoto" | "memoReturnLinePhoto" | "memoOutLinePhoto" | "memoOutReturnLinePhoto" | "purchaseLinePhoto";

export type LinePhotoDocument = {
  /** Error code prefix, e.g. `RESERVE` → `RESERVE_PHOTO_INVALID`. */
  code: string;
  /** Menu / permission leaf that guards the photo route. */
  menu: string;
  /** `stored_files.source_type` of this document's line photos. */
  source: string;
  /** Storage module (one per document, like `purchase-order-photo`). */
  module: string;
  /** Route of the upload / read endpoints. */
  route: string;
  /** Audit event name of the photo endpoints. */
  event: string;
  linkModel: LinePhotoModel;
};

const photoDocument = (code: string, menu: string, table: string, linkModel: LinePhotoModel): LinePhotoDocument => ({
  code,
  menu,
  source: `${table}.line-photo`,
  module: `${menu}-photo`,
  route: `/api/v1/${menu}/photos`,
  event: table,
  linkModel,
});

export const LINE_PHOTO_DOCUMENTS = {
  reserve: photoDocument("RESERVE", "reserve", "reserve", "reserveLinePhoto"),
  memoReturn: photoDocument("MEMO_RETURN", "memo-return", "memo_return", "memoReturnLinePhoto"),
  memoOut: photoDocument("MEMO_OUT", "memo-out", "memo_out", "memoOutLinePhoto"),
  memoOutReturn: photoDocument("MEMO_OUT_RETURN", "memo-out-return", "memo_out_return", "memoOutReturnLinePhoto"),
  purchase: photoDocument("PURCHASE", "purchase", "purchase", "purchaseLinePhoto"),
} as const satisfies Record<string, LinePhotoDocument>;

/** An upload that isn't a JPEG/PNG ≤ 5 MB, or a saved photo id that isn't a ready photo of this document. */
export const linePhotoInvalid = (document: Pick<LinePhotoDocument, "code">) => (path: string) =>
  partnerException(`${document.code}_PHOTO_INVALID`, HttpStatus.UNPROCESSABLE_ENTITY, [{ path, code: "invalid_photo" }]);

/**
 * Every photo id must be a ready file of this document's source (a photo uploaded for another document, an unknown or a
 * pending file is refused) → `<CODE>_PHOTO_INVALID` at `lines.N.photoIds.M`. One bounded query (≤ 5 ids × lines).
 */
export async function checkLinePhotos(tx: Tx, document: LinePhotoDocument, lines: readonly { photoIds: readonly string[] }[]): Promise<void> {
  const photoIds = [...new Set(lines.flatMap((line) => line.photoIds))];
  if (photoIds.length === 0) return;
  const files = await tx.storedFile.findMany({ where: { id: { in: photoIds }, sourceType: document.source, status: "ready" }, select: { id: true } });
  const known = new Set(files.map((file) => file.id));
  const invalid = linePhotoInvalid(document);
  lines.forEach((line, index) => {
    const bad = line.photoIds.findIndex((photoId) => !known.has(photoId));
    if (bad >= 0) throw invalid(`lines.${index}.photoIds.${bad}`);
  });
}

type PhotoLinkDelegate = { createMany(args: { data: { lineId: string; position: number; fileId: string }[] }): Promise<unknown> };

/**
 * The document's line hook plus its photos. The existing hook (Stock IDs, stock lines, …) runs first and unchanged; the
 * photo ids are checked, read back in order with each line, and written after the lines (the save replaced the lines
 * and, by CASCADE, their old photo links).
 */
export function withLinePhotos<Input extends TradeDocumentInput & { lines: readonly { photoIds: readonly string[] }[] }>(
  document: LinePhotoDocument,
  hook?: LineHook<Input>,
): LineHook<Input> {
  return {
    storedSelect: hook?.storedSelect ?? {},
    assign: async (tx, input, stored) => {
      const assigned = hook ? await hook.assign(tx, input, stored) : input.lines.map(() => ({}));
      await checkLinePhotos(tx, document, input.lines);
      return assigned;
    },
    output: (line, base) => {
      const output = hook ? hook.output(line, base) : base;
      const photoIds = ((line.photos as { fileId: string }[] | undefined) ?? []).map((photo) => photo.fileId);
      return { ...output, photoIds };
    },
    result: (assigned) => (hook ? hook.result(assigned) : {}),
    lineInclude: { ...hook?.lineInclude, photos: { orderBy: { position: "asc" }, select: { fileId: true } } },
    afterLines: async (tx, input, lineIds) => {
      await hook?.afterLines?.(tx, input, lineIds);
      const photos = input.lines.flatMap((line, index) => line.photoIds.map((fileId, position) => ({ lineId: lineIds[index], position: position + 1, fileId })));
      if (photos.length > 0) await (tx[document.linkModel] as unknown as PhotoLinkDelegate).createMany({ data: photos });
    },
  };
}
